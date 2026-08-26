package com.resqnet.app

import com.resqnet.app.domain.detector.CrashDetector
import com.resqnet.app.domain.detector.SensorSample
import com.resqnet.app.domain.model.CrashSensorConfig
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class CrashDetectorTest {

    private lateinit var detector: CrashDetector

    @Before
    fun setUp() {
        detector = CrashDetector(
            impactThresholdG = 3.2f,
            windowSizeMs = 1000L
        )
    }

    @Test
    fun testNormalMovement_NoCrashDetected() {
        // Normal 1G earth gravity along Z axis (sitting on table or ordinary walking)
        val result = detector.processSample(
            ax = 0.2f, ay = 0.3f, az = 9.8f,
            gx = 0.05f, gy = 0.02f, gz = 0.01f,
            timestamp = System.currentTimeMillis()
        )
        assertNull("Normal 1G earth gravity should not trigger a crash anomaly", result)
    }

    @Test
    fun testWalkingOrPothole_BelowThreshold_NoCrash() {
        // Pothole bump: 2.1G transient spike (below 3.2G impact threshold)
        val result = detector.processSample(
            ax = 3.5f, ay = 5.0f, az = 19.5f, // ~2.1G
            gx = 0.8f, gy = 0.6f, gz = 0.4f,
            timestamp = System.currentTimeMillis()
        )
        assertNull("Sub-threshold pothole jolt should not trigger crash detection", result)
    }

    @Test
    fun testSevereCollisionImpact_CrashDetected() {
        // Severe impact spike: 4.8G along forward axis (ax = 45 m/s²)
        detector.updateSpeed(65.0f)
        detector.updateSpeed(10.0f) // Sudden deceleration Δv = 55 km/h

        val result = detector.processSample(
            ax = 45.0f, ay = 8.0f, az = 12.0f, // ~4.8G
            gx = 1.2f, gy = 0.8f, gz = 0.5f,
            timestamp = System.currentTimeMillis()
        )

        assertNotNull("Severe 4.8G collision must trigger crash detection", result)
        assertTrue("Crash detected flag must be true", result!!.isDetected)
        assertTrue("Confidence must be high (>= 0.85)", result.confidence >= 0.85f)
        assertTrue("Severity score must be high (>= 75)", result.severityScore >= 75)
        assertEquals("CRITICAL", result.severity)
        assertFalse("Planar crash without extreme gyro is not rollover", result.isRollover)
    }

    @Test
    fun testUnavailableSpeed_DoesNotFabricateZeroSpeed() {
        // Speed unavailable
        detector.updateSpeed(speedKmh = null, speedAvailable = false)

        val result = detector.processSample(
            ax = 45.0f, ay = 8.0f, az = 12.0f,
            gx = 1.0f, gy = 0.5f, gz = 0.2f,
            timestamp = System.currentTimeMillis()
        )

        assertNotNull(result)
        // Check that details report Speed Avail: false
        assertTrue("Sensor details must show speed is unavailable", result!!.sensorDetails.contains("Speed Avail: false"))
        // Detection still proceeds reliably
        assertTrue(result.isDetected)
    }

    @Test
    fun testRealSpeedDeltaVCalculation() {
        // Highway speed drop: 80 km/h -> 20 km/h => Δv = 60 km/h
        detector.updateSpeed(80.0f, true)
        detector.updateSpeed(20.0f, true)

        val result = detector.processSample(
            ax = 48.0f, ay = 10.0f, az = 10.0f,
            gx = 1.0f, gy = 0.5f, gz = 0.2f,
            timestamp = System.currentTimeMillis()
        )

        assertNotNull(result)
        assertEquals("Calculated Δv must equal 60 km/h", 60.0f, result!!.speedDeltaKmh, 0.5f)
        assertTrue(result.sensorDetails.contains("Speed Avail: true"))
    }
}
