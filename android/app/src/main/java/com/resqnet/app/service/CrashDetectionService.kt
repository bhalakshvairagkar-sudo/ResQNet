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
import com.resqnet.app.ui.CrashCountdownActivity
import kotlin.math.sqrt

/**
 * ResQNet Background Continuous G-Sensor & Accelerometer Crash Detection Service
 * Monitors 3-axis accelerometer and gyroscope vectors at 50Hz.
 */
class CrashDetectionService : Service(), SensorEventListener {

    private lateinit var sensorManager: SensorManager
    private var accelerometer: Sensor? = null
    private var gyroscope: Sensor? = null

    // Crash Detection Calibration Thresholds
    companion object {
        private const val TAG = "ResQNet_CrashSensor"
        private const val NOTIFICATION_CHANNEL_ID = "resqnet_crash_shield_channel"
        private const val NOTIFICATION_ID = 901

        // Thresholds based on automotive crash test standards
        private const val G_FORCE_IMPACT_THRESHOLD_MS2 = 31.4f // ~3.2G impact spike
        private const val GYRO_ROLLOVER_THRESHOLD_RADS = 4.5f   // ~257 deg/sec severe angular velocity
        private const val COOLDOWN_WINDOW_MS = 10000L          // 10-second re-arm period
    }

    private var lastTriggerTime: Long = 0
    private var currentGyroMagnitude: Float = 0f

    override fun onCreate() {
        super.onCreate()
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        gyroscope = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)

        startForegroundServiceWithNotification()
        registerSensors()
    }

    private fun registerSensors() {
        accelerometer?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
        }
        gyroscope?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
        }
        Log.d(TAG, "ResQNet Sensor Engine Armed: Accelerometer & Gyroscope active.")
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event == null) return

        val currentTime = System.currentTimeMillis()
        if (currentTime - lastTriggerTime < COOLDOWN_WINDOW_MS) return

        when (event.sensor.type) {
            Sensor.TYPE_GYROSCOPE -> {
                val gx = event.values[0]
                val gy = event.values[1]
                val gz = event.values[2]
                currentGyroMagnitude = sqrt((gx * gx + gy * gy + gz * gz).toDouble()).toFloat()
            }

            Sensor.TYPE_ACCELEROMETER -> {
                val ax = event.values[0]
                val ay = event.values[1]
                val az = event.values[2]

                // Total Acceleration Vector Magnitude
                val totalAcceleration = sqrt((ax * ax + ay * ay + az * az).toDouble()).toFloat()
                val gForce = totalAcceleration / 9.80665f

                // Evaluate Crash Condition: High G Impact Spike OR Extreme Inversion + Impact
                val isImpactSpike = totalAcceleration >= G_FORCE_IMPACT_THRESHOLD_MS2
                val isRolloverCrash = (totalAcceleration >= 22.0f) && (currentGyroMagnitude >= GYRO_ROLLOVER_THRESHOLD_RADS)

                if (isImpactSpike || isRolloverCrash) {
                    lastTriggerTime = currentTime
                    Log.w(TAG, "🚨 CRASH ANOMALY DETECTED! G-Force: $gForce G, Accel: $totalAcceleration m/s², Gyro: $currentGyroMagnitude rad/s")
                    launchCrashCountdown(gForce, isRolloverCrash)
                }
            }
        }
    }

    private fun launchCrashCountdown(gForce: Float, isRollover: Boolean) {
        val intent = Intent(this, CrashCountdownActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            putExtra("EXTRA_G_FORCE", gForce)
            putExtra("EXTRA_IS_ROLLOVER", isRollover)
            putExtra("EXTRA_TIMESTAMP", System.currentTimeMillis())
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
            .setContentText("Monitoring real-time accelerometer and g-force telemetry")
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setOngoing(true)
            .build()

        startForeground(NOTIFICATION_ID, notification)
    }

    override fun onDestroy() {
        super.onDestroy()
        sensorManager.unregisterListener(this)
        Log.d(TAG, "ResQNet Sensor Engine Disarmed.")
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
