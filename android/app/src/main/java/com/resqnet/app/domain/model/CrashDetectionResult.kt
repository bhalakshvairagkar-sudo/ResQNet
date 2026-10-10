package com.resqnet.app.domain.model

/**
 * Encapsulates the output of the multi-sensor crash evaluation engine.
 * Confidence is represented as a normalized float [0.0, 1.0] and as percentage [0, 100].
 */
data class CrashDetectionResult(
    val isDetected: Boolean,
    val confidence: Float,             // 0.0 to 1.0
    val confidencePercentage: Int,     // 0 to 100
    val severity: String,              // "LOW", "MEDIUM", "HIGH", "CRITICAL"
    val severityScore: Int,            // 0 to 100
    val peakGForce: Float,
    val accelerationMagnitude: Float,  // m/s²
    val speedDeltaKmh: Float,          // Δv in km/h
    val isRollover: Boolean,
    val gyroMagnitude: Float,          // rad/s
    val timestamp: Long = System.currentTimeMillis(),
    val sensorDetails: String = ""
)
