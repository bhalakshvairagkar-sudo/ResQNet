package com.resqnet.app.service

import android.app.*
import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.IBinder
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
import kotlin.math.max
import kotlin.math.sqrt

/**
 * ResQNet Background Continuous G-Sensor & Accelerometer Crash Detection Service.
 * Implements measured-frequency kinematic evaluation, sliding window shock filtering, and duplicate cooldown.
 */
class CrashDetectionService : Service(), SensorEventListener {

    private lateinit var sensorManager: SensorManager
    private var accelerometer: Sensor? = null
    private var gyroscope: Sensor? = null

    private lateinit var crashDetector: CrashDetector
    private lateinit var locationManager: AppLocationManager

    private var currentState = EmergencyState.MONITORING
    private var lastCrashTimestamp = 0L

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
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        gyroscope = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)

        isAccelAvailable = (accelerometer != null)
        isGyroAvailable = (gyroscope != null)

        Log.d(TAG, "[SENSOR] Sensor initialized")
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

    private val gpsHandler = android.os.Handler(android.os.Looper.getMainLooper())
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
        registerSensors()
        return START_STICKY
    }

    private fun registerSensors() {
        var accelRegistered = false
        var gyroRegistered = false

        accelerometer?.let {
            accelRegistered = sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
        }
        gyroscope?.let {
            gyroRegistered = sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
        }

        Log.d(TAG, "[SENSOR] Sensor listener registered: Accel=$accelRegistered, Gyro=$gyroRegistered")
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

                    Log.d(TAG, "[SENSOR] Measured Cadence -> Accel: ${"%.1f".format(measuredAccelHz)} Hz | Gyro: ${"%.1f".format(measuredGyroHz)} Hz | Processing: ${"%.1f".format(measuredProcessingHz)} Hz")

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
        Log.w(TAG, "[SENSOR] 🚨 POSSIBLE CRASH DETECTED!")
        Log.w(TAG, "[SENSOR] Acceleration magnitude: ${"%.2f".format(result.accelerationMagnitude)} m/s² (${"%.2f".format(result.peakGForce)}G)")
        Log.w(TAG, "[SENSOR] Angular velocity: ${"%.2f".format(result.gyroMagnitude)} rad/s | Rollover: ${result.isRollover}")
        Log.w(TAG, "[SENSOR] Confidence: ${"%.2f".format(result.confidence)} | Severity: ${result.severity} (${result.severityScore}/100)")
        Log.w(TAG, "[SENSOR] State -> VERIFICATION_PENDING (15s)")
        Log.w(TAG, "[SENSOR] ======================================================")

        currentState = EmergencyState.VERIFICATION_PENDING

        // Launch the 15-second Verification Activity
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
                "ResQNet Crash Shield Active",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Continuous multi-sensor impact protection"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }

        val notification: Notification = NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("ResQNet Crash Shield Active")
            .setContentText("Continuous sensor protection armed")
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setOngoing(true)
            .build()

        startForeground(NOTIFICATION_ID, notification)
    }

    override fun onDestroy() {
        super.onDestroy()
        gpsHandler.removeCallbacks(gpsRunnable)
        sensorManager.unregisterListener(this)
        isRunning = false
        currentState = EmergencyState.MONITORING
        Log.d(TAG, "[SENSOR] Sensor monitoring stopped")
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
