package com.resqnet.app.domain.model

/**
 * Configurable thresholds and calibration constants for ResQNet crash detection.
 * All values are centralized here for easy tuning and testing.
 */
object CrashSensorConfig {
    // Kinematic thresholds based on automotive crash test data
    const val DEFAULT_IMPACT_THRESHOLD_G = 3.2f        // ~31.4 m/s² shock spike
    const val SEVERE_IMPACT_THRESHOLD_G = 4.8f         // ~47.0 m/s² severe collision
    const val DECELERATION_THRESHOLD_KMH = 30.0f       // Minimum sudden speed loss Δv
    const val GYRO_ROLLOVER_THRESHOLD_RADS = 4.5f      // ~257 deg/sec angular rotation
    const val POST_IMPACT_STAGNATION_THRESHOLD_KMH = 8.0f // Post-crash speed must remain below this

    // Time windows
    const val SENSOR_WINDOW_MS = 1000L                 // 1-second rolling sensor ring buffer
    const val TARGET_SAMPLING_PERIOD_MS = 20L          // 50Hz nominal sampling target (20ms)
    const val VERIFICATION_COUNTDOWN_SECONDS = 15      // 15-second "Are You OK?" window
    const val DUPLICATE_COOLDOWN_MS = 30000L           // 30-second post-crash suppression window

    // Confidence scoring weights
    const val WEIGHT_IMPACT_MAGNITUDE = 0.40f
    const val WEIGHT_DECELERATION = 0.30f
    const val WEIGHT_ROTATION = 0.20f
    const val WEIGHT_STAGNATION = 0.10f
}
