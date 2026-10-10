package com.example.resqnet

import android.Manifest
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlin.math.sqrt

class CrashDetectionService : Service(), SensorEventListener {

    private lateinit var sensorManager: SensorManager
    private var accelerometer: Sensor? = null
    private var gyroscope: Sensor? = null

    private var lastGyroMagnitude = 0f
    private var lastCrashTriggerTime = 0L

    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private var lastKnownSpeed: Float = 0f
    private var speedBeforeSpike: Float = 0f
    private var lastLatitude: Double = 0.0
    private var lastLongitude: Double = 0.0

    companion object {
        const val ACCEL_THRESHOLD = 45f
        const val GYRO_THRESHOLD = 4f
        const val COOLDOWN_MS = 15000L
        const val SPEED_DROP_THRESHOLD = 8.0f
        const val LOCATION_INTERVAL_MS = 1000L
    }

    override fun onCreate() {
        super.onCreate()

        val notification = NotificationCompat.Builder(this, NotificationHelper.MONITORING_CHANNEL_ID)
            .setContentTitle("ResQNet Active")
            .setContentText("Monitoring for possible accidents")
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .build()
        startForeground(1, notification)

        sensorManager = getSystemService(SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        gyroscope = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)

        sensorManager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_GAME)
        sensorManager.registerListener(this, gyroscope, SensorManager.SENSOR_DELAY_GAME)

        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        startLocationUpdates()

        AppState.isMonitoring.value = true
    }

    @Suppress("MissingPermission")
    private fun startLocationUpdates() {
        val hasLocationPermission = ContextCompat.checkSelfPermission(
            this, Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        if (!hasLocationPermission) return

        val locationRequest = LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY, LOCATION_INTERVAL_MS
        ).build()

        fusedLocationClient.requestLocationUpdates(
            locationRequest,
            object : LocationCallback() {
                override fun onLocationResult(result: LocationResult) {
                    result.lastLocation?.let { loc ->
                        speedBeforeSpike = lastKnownSpeed
                        lastKnownSpeed = loc.speed
                        lastLatitude = loc.latitude
                        lastLongitude = loc.longitude
                        AppState.lastLatitude = loc.latitude
                        AppState.lastLongitude = loc.longitude
                        AppState.currentSpeedKmh.floatValue = loc.speed * 3.6f
                        AppState.gpsLockGood.value = loc.accuracy < 20f
                    }
                }
            },
            Looper.getMainLooper()
        )
    }

    override fun onSensorChanged(event: SensorEvent) {
        when (event.sensor.type) {
            Sensor.TYPE_ACCELEROMETER -> {
                val ax = event.values[0]
                val ay = event.values[1]
                val az = event.values[2]
                val magnitude = sqrt(ax * ax + ay * ay + az * az)

                AppState.axisX.floatValue = ax
                AppState.axisY.floatValue = ay
                AppState.axisZ.floatValue = az
                AppState.currentGForce.floatValue = magnitude / 9.81f

                checkForCrash(magnitude)
            }
            Sensor.TYPE_GYROSCOPE -> {
                lastGyroMagnitude = sqrt(
                    event.values[0] * event.values[0] +
                            event.values[1] * event.values[1] +
                            event.values[2] * event.values[2]
                )
            }
        }
    }

    private fun checkForCrash(accelMagnitude: Float) {
        val now = System.currentTimeMillis()
        if (now - lastCrashTriggerTime < COOLDOWN_MS) return

        val speedDropDetected = (speedBeforeSpike - lastKnownSpeed) > SPEED_DROP_THRESHOLD

        if (accelMagnitude > ACCEL_THRESHOLD && lastGyroMagnitude > GYRO_THRESHOLD && speedDropDetected) {
            lastCrashTriggerTime = now
            triggerCrashAlert()
        }
    }

    private fun triggerCrashAlert() {
        val intent = Intent(this, CrashConfirmationActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent, PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, NotificationHelper.CRASH_CHANNEL_ID)
            .setContentTitle("Possible accident detected")
            .setContentText("Tap to confirm you're safe")
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setFullScreenIntent(pendingIntent, true)
            .setAutoCancel(true)
            .build()

        val hasNotificationPermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                this, Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }

        if (hasNotificationPermission) {
            NotificationManagerCompat.from(this).notify(2, notification)
        }

        Handler(Looper.getMainLooper()).post {
            startActivity(intent)
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        sensorManager.unregisterListener(this)
        AppState.isMonitoring.value = false
    }
}