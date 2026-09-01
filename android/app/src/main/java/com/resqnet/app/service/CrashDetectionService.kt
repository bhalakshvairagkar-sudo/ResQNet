package com.resqnet.app.service

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.*
import android.util.Log
import androidx.core.app.NotificationCompat
import com.resqnet.app.domain.detector.CrashDetector
import com.resqnet.app.domain.model.CrashDetectionResult
import com.resqnet.app.domain.model.CrashSensorConfig
import com.resqnet.app.domain.model.EmergencyState
import com.resqnet.app.domain.model.LocationQuality
import com.resqnet.app.location.AppLocationManager
import com.resqnet.app.location.LocationData
import com.resqnet.app.ui.CrashCountdownActivity
import com.resqnet.app.ui.MainActivity
import kotlin.math.sqrt

/**
 * ResQNet Background Continuous G-Sensor & Accelerometer Crash Detection Service.
 * Runs 24/7 continuously with screen turned off using a dedicated Sensor HandlerThread and Partial WakeLock.
 */
class CrashDetectionService : Service(), SensorEventListener {

    private lateinit var sensorManager: SensorManager
    private var accelerometer: Sensor? = null
    private var gyroscope: Sensor? = null

    private lateinit var crashDetector: CrashDetector
    private lateinit var locationManager: AppLocationManager

    private var currentState = EmergencyState.MONITORING
    private var lastCrashTimestamp = 0L

    // Dedicated background thread for sensor processing (prevents main thread drops when screen is off)
    private var sensorThread: HandlerThread? = null
    private var sensorHandler: Handler? = null

    // CPU WakeLock to guarantee continuous execution while screen is black/locked
    private var wakeLock: PowerManager.WakeLock? = null

    // Sampling frequency tracking variables
    private var lastAccelTimestampNanos = 0L
    private var lastGyroTimestampNanos = 0L
    private var accelSampleCount = 0
    private var gyroSampleCount = 0
    private var lastRateCalcTimestamp = System.currentTimeMillis()

    companion object {
        private const val TAG = "ResQNet-SENSOR"
        private const val NOTIFICATION_CHANNEL_ID = "resqnet_crash_shield_channel"
        private const val NOTIFICATION_ID = 901
        private const val WAKELOCK_TAG = "ResQNet:CrashShieldWakeLock"

        var isRunning = false
            private set

        // Shared live telemetry & measured frequencies for UI Test Mode
        var liveAx = 0f
            private set
        var liveAy = 0f
            private set
        var liveAz = 9.8f
            private set
        var liveMagnitude = 9.8f
            private set
        var liveGForce = 1.0f
            private set
        var liveGx = 0f
            private set
        var liveGy = 0f
            private set
        var liveGz = 0f
            private set
        var liveAngularVelocity = 0f
            private set
        var isAccelAvailable = false
            private set
        var isGyroAvailable = false
            private set

        // Measured Real Sampling Frequencies (Hz)
        var measuredAccelHz = 0.0f
            private set
        var measuredGyroHz = 0.0f
            private set
        var measuredProcessingHz = 0.0f
            private set
    }

    override fun onCreate() {
        super.onCreate()

        acquireWakeLock()
        initSensorThread()

        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        gyroscope = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)

        isAccelAvailable = (accelerometer != null)
        isGyroAvailable = (gyroscope != null)

        Log.d(TAG, "[SENSOR] Sensor initialized (Background thread & WakeLock active)")
        Log.d(TAG, "[SENSOR] Accelerometer: ${if (isAccelAvailable) "AVAILABLE (${accelerometer?.name})" else "UNAVAILABLE"}")
        Log.d(TAG, "[SENSOR] Gyroscope: ${if (isGyroAvailable) "AVAILABLE (${gyroscope?.name})" else "UNAVAILABLE (Fallback to Accel)"}")

        crashDetector = CrashDetector()
        locationManager = AppLocationManager(this)

        startForegroundServiceWithNotification()
        registerSensors()
        isRunning = true
        currentState = EmergencyState.MONITORING
        Log.d(TAG, "[SENSOR] Crash detection state: MONITORING")

        // Start periodic GPS speed feed to crash detector (every 2 seconds)
        startContinuousGpsSpeedFeed()
    }

    private fun acquireWakeLock() {
        try {
            if (wakeLock == null) {
                val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
                wakeLock = powerManager.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    WAKELOCK_TAG
                ).apply {
                    setReferenceCounted(false)
                    acquire()
                }
                Log.d(TAG, "[SENSOR] Partial WakeLock acquired. CPU will stay active when screen is OFF.")
            }
        } catch (e: Exception) {
            Log.e(TAG, "[SENSOR] Failed to acquire WakeLock: ${e.message}")
        }
    }

    private fun releaseWakeLock() {
        try {
            wakeLock?.let {
                if (it.isHeld) {
                    it.release()
                    Log.d(TAG, "[SENSOR] Partial WakeLock released.")
                }
            }
            wakeLock = null
        } catch (e: Exception) {
            Log.e(TAG, "[SENSOR] Error releasing WakeLock: ${e.message}")
        }
    }

    private fun initSensorThread() {
        if (sensorThread == null) {
            sensorThread = HandlerThread("ResQNet-SensorThread", Process.THREAD_PRIORITY_MORE_FAVORABLE).apply {
                start()
                sensorHandler = Handler(looper)
            }
        }
    }

    private val gpsHandler = Handler(Looper.getMainLooper())
    private val gpsRunnable = object : Runnable {
        override fun run() {
            if (isRunning) {
                locationManager.acquireLatestLocation { loc: LocationData ->
                    val isAvailable = (loc.quality != LocationQuality.UNAVAILABLE && loc.isSpeedAvailable && loc.speedKmh != null)
                    crashDetector.updateSpeed(
                        speedKmh = if (isAvailable) loc.speedKmh else null,
                        speedAvailable = isAvailable
                    )
                }
                gpsHandler.postDelayed(this, 2000L)
            }
        }
    }

    private fun startContinuousGpsSpeedFeed() {
        gpsHandler.post(gpsRunnable)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        acquireWakeLock()
        registerSensors()
        return START_STICKY
    }

    private fun registerSensors() {
        val handler = sensorHandler ?: Handler(Looper.getMainLooper())
        var accelRegistered = false
        var gyroRegistered = false

        accelerometer?.let {
            accelRegistered = sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME, 0, handler)
        }
        gyroscope?.let {
            gyroRegistered = sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME, 0, handler)
        }

        Log.d(TAG, "[SENSOR] Sensor listener registered on background thread: Accel=$accelRegistered, Gyro=$gyroRegistered")
    }

    private var latestGx = 0f
    private var latestGy = 0f
    private var latestGz = 0f

    override fun onSensorChanged(event: SensorEvent?) {
        if (event == null) return
        val now = System.currentTimeMillis()
        val eventNanos = event.timestamp

        when (event.sensor.type) {
            Sensor.TYPE_GYROSCOPE -> {
                gyroSampleCount++
                latestGx = event.values[0]
                latestGy = event.values[1]
                latestGz = event.values[2]

                liveGx = latestGx
                liveGy = latestGy
                liveGz = latestGz
                val gyroMag = sqrt((latestGx * latestGx + latestGy * latestGy + latestGz * latestGz).toDouble()).toFloat()
                liveAngularVelocity = gyroMag
                lastGyroTimestampNanos = eventNanos
            }

            Sensor.TYPE_ACCELEROMETER -> {
                accelSampleCount++
                val ax = event.values[0]
                val ay = event.values[1]
                val az = event.values[2]

                liveAx = ax
                liveAy = ay
                liveAz = az
                val mag = sqrt((ax * ax + ay * ay + az * az).toDouble()).toFloat()
                val g = mag / 9.80665f
                liveMagnitude = mag
                liveGForce = g
                lastAccelTimestampNanos = eventNanos

                // Calculate measured sampling frequencies every 1000ms
                val elapsedSinceRateCalc = now - lastRateCalcTimestamp
                if (elapsedSinceRateCalc >= 1000L) {
                    val seconds = elapsedSinceRateCalc / 1000.0f
                    measuredAccelHz = accelSampleCount / seconds
                    measuredGyroHz = gyroSampleCount / seconds
                    measuredProcessingHz = (accelSampleCount + gyroSampleCount) / (2.0f * seconds)

                    Log.d(TAG, "[SENSOR] Screen-Off Cadence -> Accel: ${"%.1f".format(measuredAccelHz)} Hz | Gyro: ${"%.1f".format(measuredGyroHz)} Hz | Processing: ${"%.1f".format(measuredProcessingHz)} Hz")

                    accelSampleCount = 0
                    gyroSampleCount = 0
                    lastRateCalcTimestamp = now
                }

                // Duplicate Crash Prevention: Ignore triggers during cooldown window
                if (currentState == EmergencyState.COOLDOWN || (now - lastCrashTimestamp < CrashSensorConfig.DUPLICATE_COOLDOWN_MS)) {
                    return
                }

                val result: CrashDetectionResult? = crashDetector.processSample(
                    ax, ay, az,
                    latestGx, latestGy, latestGz,
                    now
                )

                if (result != null && result.isDetected) {
                    onCrashDetected(result)
                }
            }
        }
    }

    private fun onCrashDetected(result: CrashDetectionResult) {
        lastCrashTimestamp = result.timestamp
        currentState = EmergencyState.POSSIBLE_CRASH

        Log.w(TAG, "[SENSOR] ======================================================")
        Log.w(TAG, "[SENSOR] 🚨 POSSIBLE CRASH DETECTED WHILE SCREEN OFF/ON!")
        Log.w(TAG, "[SENSOR] Acceleration magnitude: ${"%.2f".format(result.accelerationMagnitude)} m/s² (${"%.2f".format(result.peakGForce)}G)")
        Log.w(TAG, "[SENSOR] Angular velocity: ${"%.2f".format(result.gyroMagnitude)} rad/s | Rollover: ${result.isRollover}")
        Log.w(TAG, "[SENSOR] Confidence: ${"%.2f".format(result.confidence)} | Severity: ${result.severity} (${result.severityScore}/100)")
        Log.w(TAG, "[SENSOR] State -> VERIFICATION_PENDING (15s)")
        Log.w(TAG, "[SENSOR] ======================================================")

        currentState = EmergencyState.VERIFICATION_PENDING

        // Wake screen up & launch the 15-second Verification Activity over lockscreen
        val intent = Intent(this, CrashCountdownActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            putExtra(CrashCountdownActivity.EXTRA_G_FORCE, result.peakGForce)
            putExtra(CrashCountdownActivity.EXTRA_IS_ROLLOVER, result.isRollover)
            putExtra(CrashCountdownActivity.EXTRA_CONFIDENCE, result.confidence)
            putExtra(CrashCountdownActivity.EXTRA_SEVERITY_SCORE, result.severityScore)
            putExtra(CrashCountdownActivity.EXTRA_DELTA_V, result.speedDeltaKmh)
            putExtra(CrashCountdownActivity.EXTRA_TIMESTAMP, result.timestamp)
        }
        startActivity(intent)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    private fun startForegroundServiceWithNotification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "ResQNet Crash Shield",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Continuous 24/7 background sensor impact protection"
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }

        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification: Notification = NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("ResQNet Crash Shield Active")
            .setContentText("Continuous sensor kinematic evaluation armed (Screen-Off Protected)")
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        gpsHandler.removeCallbacks(gpsRunnable)
        sensorManager.unregisterListener(this)
        sensorThread?.quitSafely()
        sensorThread = null
        sensorHandler = null
        releaseWakeLock()
        isRunning = false
        currentState = EmergencyState.MONITORING
        Log.d(TAG, "[SENSOR] Sensor monitoring stopped & WakeLock released")
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
