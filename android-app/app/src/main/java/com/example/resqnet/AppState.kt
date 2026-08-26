package com.example.resqnet

import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf

object AppState {
    var lastLatitude: Double = 0.0
    var lastLongitude: Double = 0.0

    // Observable live telemetry, read by the Dashboard UI
    val currentSpeedKmh = mutableFloatStateOf(0f)
    val currentGForce = mutableFloatStateOf(1.0f)
    val axisX = mutableFloatStateOf(0f)
    val axisY = mutableFloatStateOf(0f)
    val axisZ = mutableFloatStateOf(9.81f)
    val isMonitoring = mutableStateOf(false)
    val gpsLockGood = mutableStateOf(false)
}