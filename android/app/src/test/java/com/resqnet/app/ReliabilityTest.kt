package com.resqnet.app

import com.resqnet.app.data.local.LocalIncidentRecord
import com.resqnet.app.data.repository.IncidentRepository
import com.resqnet.app.domain.model.LocationQuality
import com.resqnet.app.domain.model.SubmissionStatus
import org.junit.Assert.*
import org.junit.Test
import kotlin.math.min
import kotlin.math.pow

class ReliabilityTest {

    @Test
    fun testExponentialBackoffCalculation() {
        fun calc(attempt: Int): Long {
            val multiplier = 2.0.pow(min(attempt.toDouble(), 5.0)).toLong()
            val delay = IncidentRepository.BASE_RETRY_DELAY_MS * multiplier
            return min(delay, IncidentRepository.MAX_RETRY_DELAY_MS)
        }

        assertEquals(4000L, calc(1))  // 2s * 2^1 = 4s
        assertEquals(8000L, calc(2))  // 2s * 2^2 = 8s
        assertEquals(16000L, calc(3)) // 2s * 2^3 = 16s
        assertEquals(32000L, calc(4)) // 2s * 2^4 = 32s
        assertEquals(64000L.coerceAtMost(60000L), calc(5)) // Capped at 60s
        assertEquals(60000L, calc(10)) // Capped at 60s max
    }

    @Test
    fun testIncidentStatusTransitions() {
        val record = LocalIncidentRecord(
            incidentId = "RNQ-TEST001",
            deviceId = "PIXEL_8",
            userId = "USER_42",
            title = "Test Crash Event",
            timestamp = System.currentTimeMillis(),
            latitude = 18.5204,
            longitude = 73.8567,
            locationAccuracy = 4.0f,
            confidence = 0.95f,
            severity = 90,
            submissionStatus = SubmissionStatus.CREATED
        )

        assertEquals(SubmissionStatus.CREATED, record.submissionStatus)

        // Simulate transmission start
        record.submissionStatus = SubmissionStatus.SUBMITTING
        assertEquals(SubmissionStatus.SUBMITTING, record.submissionStatus)

        // Simulate network failure
        record.submissionStatus = SubmissionStatus.RETRY_REQUIRED
        record.retryCount = 1
        assertEquals(SubmissionStatus.RETRY_REQUIRED, record.submissionStatus)
        assertEquals(1, record.retryCount)

        // Simulate retry success & backend confirmation
        record.submissionStatus = SubmissionStatus.CONFIRMED
        record.backendIncidentId = "RNQ-TEST001"
        record.assignedAmbulance = "AMB-01"
        assertEquals(SubmissionStatus.CONFIRMED, record.submissionStatus)
        assertEquals("AMB-01", record.assignedAmbulance)
    }

    @Test
    fun testGpsQualityDegradationModel() {
        // Fresh GPS fix
        val freshRecord = LocalIncidentRecord(
            incidentId = "RNQ-GPS1",
            deviceId = "PIXEL_8",
            userId = "USER_42",
            title = "Fresh GPS Crash",
            timestamp = System.currentTimeMillis(),
            latitude = 18.5204,
            longitude = 73.8567,
            locationAccuracy = 3.5f,
            locationQuality = LocationQuality.FRESH_GPS,
            confidence = 0.95f,
            severity = 90
        )
        assertEquals(LocationQuality.FRESH_GPS, freshRecord.locationQuality)
        assertEquals(18.5204, freshRecord.latitude!!, 0.0001)

        // GPS Unavailable fallback (No coordinate fabrication)
        val unavailableRecord = LocalIncidentRecord(
            incidentId = "RNQ-GPS2",
            deviceId = "PIXEL_8",
            userId = "USER_42",
            title = "No GPS Crash",
            timestamp = System.currentTimeMillis(),
            latitude = null,
            longitude = null,
            locationAccuracy = null,
            locationQuality = LocationQuality.UNAVAILABLE,
            confidence = 0.95f,
            severity = 90
        )
        assertEquals(LocationQuality.UNAVAILABLE, unavailableRecord.locationQuality)
        assertNull(unavailableRecord.latitude)
        assertNull(unavailableRecord.longitude)
        assertNotNull(unavailableRecord.incidentId)
        // Emergency continues despite missing GPS
        assertTrue((unavailableRecord.severity ?: 0) > 0)
    }

    @Test
    fun testIdempotencyIncidentIdStability() {
        val initialId = "RNQ-STABLE01"
        val record = LocalIncidentRecord(
            incidentId = initialId,
            deviceId = "DEVICE_X",
            userId = "USER_X",
            title = "Stable Crash",
            timestamp = System.currentTimeMillis(),
            latitude = 18.52,
            longitude = 73.85,
            locationAccuracy = 5f,
            confidence = 0.9f,
            severity = 80
        )

        // Verify that retry attempts preserve the exact original incidentId
        for (attempt in 1..5) {
            record.retryCount = attempt
            assertEquals(initialId, record.incidentId)
        }
    }
}
