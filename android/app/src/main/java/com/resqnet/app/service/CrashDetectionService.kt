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
import com.resqnet.app.location.AppLocationManager
import com.resqnet.app.ui.CrashCountdownActivity

/**
 * ResQNet Background Continuous G-Sensor & Accelerometer Crash Detection Service.
 * Implements 50Hz kinematic evaluation, sliding window shock filtering, and duplicate cooldown.
 */
class CrashDetectionService : Service(), SensorEventListener {

    private lateinit var sensorManager: SensorManager
    private var accelerometer: Sensor? = null
    private var gyroscope: Sensor? = null

    private lateinit var crashDetector: CrashDetector
    private lateinit var locationManager: AppLocationManager

    private var currentState = EmergencyState.MONITORING
    private var lastCrashTimestamp = 0L

    companion object {
        private const val TAG = "ResQNet"
        private const val NOTIFICATION_CHANNEL_ID = "resqnet_crash_shield_channel"
        private const val NOTIFICATION_ID = 901

        var isRunning = false
            private set
    }

    override fun onCreate() {
        super.onCreate()
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        gyroscope = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)

        crashDetector = CrashDetector()
        locationManager = AppLocationManager(this)

        startForegroundServiceWithNotification()
        registerSensors()
        isRunning = true
        currentState = EmergencyState.MONITORING
        Log.d(TAG, "[ResQNet] Sensor monitoring started")
    }

    private fun registerSensors() {
        // Target 50Hz (20,000 microseconds)
        val samplingPeriodUs = (CrashSensorConfig.TARGET_SAMPLING_PERIOD_MS * 1000).toInt()
        accelerometer?.let {
            sensorManager.registerListener(this, it, samplingPeriodUs)
        }
        gyroscope?.let {
            sensorManager.registerListener(this, it, samplingPeriodUs)
        }
    }

    private var latestGx = 0f
    private var latestGy = 0f
    private var latestGz = 0f

    override fun onSensorChanged(event: SensorEvent?) {
        if (event == null) return
        val now = System.currentTimeMillis()

        // Duplicate Crash Prevention: Ignore triggers during cooldown window
        if (currentState == EmergencyState.COOLDOWN || (now - lastCrashTimestamp < CrashSensorConfig.DUPLICATE_COOLDOWN_MS)) {
            return
        }

        when (event.sensor.type) {
            Sensor.TYPE_GYROSCOPE -> {
                latestGx = event.values[0]
                latestGy = event.values[1]
                latestGz = event.values[2]
            }

            Sensor.TYPE_ACCELEROMETER -> {
                val ax = event.values[0]
                val ay = event.values[1]
                val az = event.values[2]

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

        Log.w(TAG, "[ResQNet] Acceleration magnitude: ${"%.2f".format(result.accelerationMagnitude)} m/s²")
        Log.w(TAG, "[ResQNet] Possible crash detected! Peak G: ${"%.2f".format(result.peakGForce)}G")
        Log.w(TAG, "[ResQNet] Confidence: ${"%.2f".format(result.confidence)} | Severity: ${result.severity}")
        Log.w(TAG, "[ResQNet] Verification countdown started (15 seconds)")

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
                description = "Continuous 50Hz multi-sensor impact protection"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }

        val notification: Notification = NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("ResQNet Crash Shield Active")
            .setContentText("Continuous 50Hz sensor protection armed")
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setOngoing(true)
            .build()

        startForeground(NOTIFICATION_ID, notification)
    }

    override fun onDestroy() {
        super.onDestroy()
        sensorManager.unregisterListener(this)
        isRunning = false
        currentState = EmergencyState.MONITORING
        Log.d(TAG, "[ResQNet] Sensor monitoring stopped")
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
