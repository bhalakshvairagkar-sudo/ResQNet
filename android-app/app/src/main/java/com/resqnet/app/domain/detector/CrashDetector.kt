package com.resqnet.app.domain.detector

import com.resqnet.app.domain.model.CrashDetectionResult
import com.resqnet.app.domain.model.CrashSensorConfig
import java.util.concurrent.ConcurrentLinkedQueue
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Sensor reading sample with strictly typed physical units:
 * - ax, ay, az: Linear acceleration in meters per second squared (m/s²)
 * - gx, gy, gz: Angular velocity in radians per second (rad/s)
 * - gForce: Normalized Earth gravity multiple (1.0G = 9.80665 m/s²)
 * - speedKmh: GPS speed in kilometers per hour (km/h) or null if unavailable
 */
data class SensorSample(
    val timestamp: Long,
    val ax: Float,
    val ay: Float,
    val az: Float,
    val gx: Float,
    val gy: Float,
    val gz: Float,
    val speedKmh: Float? = null,
    val isSpeedAvailable: Boolean = false
) {
    // Magnitude ||A|| = sqrt(ax² + ay² + az²) in m/s²
    val accelerationMagnitude: Float = sqrt((ax * ax + ay * ay + az * az).toDouble()).toFloat()

    // 1G = 9.80665 m/s²
    val gForce: Float = accelerationMagnitude / 9.80665f

    // Angular velocity ||ω|| = sqrt(gx² + gy² + gz²) in rad/s
    val gyroMagnitude: Float = sqrt((gx * gx + gy * gy + gz * gz).toDouble()).toFloat()
}

/**
 * Multi-signal Crash Detection Engine.
 * Evaluates kinematic shock, angular rollover, and velocity deceleration over a rolling temporal sliding window.
 */
class CrashDetector(
    private val impactThresholdG: Float = CrashSensorConfig.DEFAULT_IMPACT_THRESHOLD_G,
    private val windowSizeMs: Long = CrashSensorConfig.SENSOR_WINDOW_MS
) {
    private val sampleBuffer = ConcurrentLinkedQueue<SensorSample>()
    private var lastDecelerationDeltaV: Float = 0f
    private var currentSpeedKmh: Float? = null
    private var previousSpeedKmh: Float? = null
    private var isSpeedAvailable: Boolean = false

    /**
     * Updates real GPS velocity to compute empirical deceleration Δv.
     * If GPS fix is unavailable or lacks speed, marks isSpeedAvailable = false without fabricating zero.
     */
    fun updateSpeed(speedKmh: Float?, speedAvailable: Boolean = (speedKmh != null && speedKmh >= 0f)) {
        this.isSpeedAvailable = speedAvailable
        if (speedAvailable && speedKmh != null) {
            previousSpeedKmh = currentSpeedKmh ?: speedKmh
            currentSpeedKmh = speedKmh
            lastDecelerationDeltaV = max(0f, (previousSpeedKmh ?: speedKmh) - speedKmh)
        } else {
            currentSpeedKmh = null
            previousSpeedKmh = null
            lastDecelerationDeltaV = 0f
        }
    }

    /**
     * Ingests a high-frequency sensor reading (50Hz nominal).
     */
    fun processSample(
        ax: Float, ay: Float, az: Float,
        gx: Float, gy: Float, gz: Float,
        timestamp: Long = System.currentTimeMillis()
    ): CrashDetectionResult? {
        val sample = SensorSample(
            timestamp = timestamp,
            ax = ax, ay = ay, az = az,
            gx = gx, gy = gy, gz = gz,
            speedKmh = currentSpeedKmh,
            isSpeedAvailable = isSpeedAvailable
        )
        sampleBuffer.add(sample)

        // Prune samples older than the sliding window
        val cutoff = timestamp - windowSizeMs
        while (sampleBuffer.isNotEmpty() && sampleBuffer.peek()!!.timestamp < cutoff) {
            sampleBuffer.poll()
        }

        // Evaluate whether the current sample exceeds the initial impact threshold (e.g. 3.20G)
        if (sample.gForce < impactThresholdG) {
            return null
        }

        // Multi-signal analysis across the window
        return evaluateCrashPattern(sample)
    }

    /**
     * Evaluates multi-signal correlation across impact, rotation, deceleration, and post-impact state.
     */
    fun evaluateCrashPattern(triggerSample: SensorSample): CrashDetectionResult {
        val samples = sampleBuffer.toList()
        val peakG = samples.maxOfOrNull { it.gForce } ?: triggerSample.gForce
        val peakAccel = samples.maxOfOrNull { it.accelerationMagnitude } ?: triggerSample.accelerationMagnitude
        val peakGyro = samples.maxOfOrNull { it.gyroMagnitude } ?: triggerSample.gyroMagnitude

        val isRollover = peakGyro >= CrashSensorConfig.GYRO_ROLLOVER_THRESHOLD_RADS

        // Deceleration calculation: GPS speed delta or estimated kinematic delta
        val effectiveDeltaV: Float = if (isSpeedAvailable && lastDecelerationDeltaV > 0f) {
            lastDecelerationDeltaV
        } else {
            // Kinematic approximation: delta_v = peak_accel * impact_duration
            min(80f, peakG * 12.0f)
        }

        // Stagnation evidence: ONLY evaluated if real GPS speed is available
        val stagnationScore = if (isSpeedAvailable && currentSpeedKmh != null) {
            if (currentSpeedKmh!! <= CrashSensorConfig.POST_IMPACT_STAGNATION_THRESHOLD_KMH) 1.0f else 0.4f
        } else {
            // Neutral weight when speed is unavailable (do NOT assume vehicle is stopped)
            0.6f
        }

        // Calculate confidence (0.0 to 1.0)
        var confidenceScore = 0.0f
        confidenceScore += min(1.0f, (peakG / 6.0f)) * CrashSensorConfig.WEIGHT_IMPACT_MAGNITUDE
        confidenceScore += min(1.0f, (effectiveDeltaV / 60.0f)) * CrashSensorConfig.WEIGHT_DECELERATION
        confidenceScore += (if (isRollover) 1.0f else min(1.0f, peakGyro / 4.0f)) * CrashSensorConfig.WEIGHT_ROTATION
        confidenceScore += stagnationScore * CrashSensorConfig.WEIGHT_STAGNATION

        val normalizedConfidence = max(0.50f, min(0.99f, confidenceScore))
        val confidencePct = (normalizedConfidence * 100).toInt()

        // Calculate severity score (0 to 100)
        val gContrib = min(40, (peakG / 6.0f * 40).toInt())
        val deltaContrib = min(30, (effectiveDeltaV / 80.0f * 30).toInt())
        val rolloverContrib = if (isRollover) 20 else 0
        val severityScore = min(100, gContrib + deltaContrib + rolloverContrib + 10)

        val severityCategory = when {
            severityScore >= 75 -> "CRITICAL"
            severityScore >= 50 -> "HIGH"
            severityScore >= 25 -> "MEDIUM"
            else -> "LOW"
        }

        val details = "Peak G: ${"%.2f".format(peakG)}G | Decel Δv: ${"%.1f".format(effectiveDeltaV)} km/h | Gyro: ${"%.2f".format(peakGyro)} rad/s | Speed Avail: $isSpeedAvailable"

        return CrashDetectionResult(
            isDetected = true,
            confidence = normalizedConfidence,
            confidencePercentage = confidencePct,
            severity = severityCategory,
            severityScore = severityScore,
            peakGForce = peakG,
            accelerationMagnitude = peakAccel,
            speedDeltaKmh = effectiveDeltaV,
            isRollover = isRollover,
            gyroMagnitude = peakGyro,
            timestamp = triggerSample.timestamp,
            sensorDetails = details
        )
    }

    fun clearBuffer() {
        sampleBuffer.clear()
        lastDecelerationDeltaV = 0f
        currentSpeedKmh = null
        previousSpeedKmh = null
        isSpeedAvailable = false
    }
}
