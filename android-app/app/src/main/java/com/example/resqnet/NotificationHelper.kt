package com.example.resqnet

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

object NotificationHelper {
    const val MONITORING_CHANNEL_ID = "monitoring_channel"
    const val CRASH_CHANNEL_ID = "crash_channel"

    fun createChannels(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = context.getSystemService(NotificationManager::class.java)

            val monitoringChannel = NotificationChannel(
                MONITORING_CHANNEL_ID, "Monitoring", NotificationManager.IMPORTANCE_LOW
            )
            val crashChannel = NotificationChannel(
                CRASH_CHANNEL_ID, "Crash Alerts", NotificationManager.IMPORTANCE_HIGH
            )
            manager.createNotificationChannel(monitoringChannel)
            manager.createNotificationChannel(crashChannel)
        }
    }
}