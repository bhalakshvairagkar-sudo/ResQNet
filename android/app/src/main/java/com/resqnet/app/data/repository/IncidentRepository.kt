package com.resqnet.app.data.repository

import android.content.Context
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.resqnet.app.data.api.ApiClient
import com.resqnet.app.data.api.EmergencyPayload
import com.resqnet.app.data.api.IncidentDto
import com.resqnet.app.data.local.LocalIncidentRecord
import com.resqnet.app.data.local.LocalIncidentStore
import com.resqnet.app.domain.model.CrashDetectionResult
import com.resqnet.app.domain.model.LocationQuality
import com.resqnet.app.domain.model.SubmissionStatus
import com.resqnet.app.location.LocationData
import com.resqnet.app.network.NetworkMonitor
import kotlinx.coroutines.*
import java.text.SimpleDateFormat
import java.util.*
import kotlin.math.min
import kotlin.math.pow

class IncidentRepository(private val context: Context) {

    private val localStore = LocalIncidentStore(context)
    private val networkMonitor = NetworkMonitor.getInstance(context)
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    companion object {
        private const val TAG = "ResQNet_Repository"
        const val MAX_RETRIES = 10
        const val BASE_RETRY_DELAY_MS = 2000L // 2 seconds
        const val MAX_RETRY_DELAY_MS = 60000L // 60 seconds
    }

    init {
        // Automatically flush pending retries when network connectivity is restored
        networkMonitor.setOnNetworkRestoredListener {
            Log.d(TAG, "[ResQNet] Network restored listener fired. Resuming pending emergency submissions...")
            scope.launch {
                flushPendingRetries()
            }
        }
    }

    val deviceId: String by lazy {
        try {
            Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: Build.MODEL
        } catch (e: Exception) {
            "DEVICE_${Build.MANUFACTURER}_${Build.MODEL}"
        }
    }

    /**
     * MODULE B: LOCAL PERSISTENCE FIRST.
     * Safely saves the emergency incident to disk before any network transmission starts.
     */
    fun createAndSaveLocalIncident(
        crashResult: CrashDetectionResult,
        location: LocationData,
        userMedicalInfo: String? = null
    ): LocalIncidentRecord {
        val uniqueIncidentId = "RNQ-${UUID.randomUUID().toString().take(8).uppercase()}"

        val title = if (crashResult.isRollover) {
            "Severe Vehicle Rollover Collision (Android Sensor Alert)"
        } else {
            "High-Impact Collision Detected (${crashResult.peakGForce.toInt()}G Shock)"
        }

        val record = LocalIncidentRecord(
            incidentId = uniqueIncidentId,
            deviceId = deviceId,
            userId = "USER_${deviceId.takeLast(6)}",
            eventType = "ACCIDENT",
            source = "SMARTPHONE",
            title = title,
            timestamp = crashResult.timestamp,
            latitude = if (location.quality != LocationQuality.UNAVAILABLE) location.latitude else null,
            longitude = if (location.quality != LocationQuality.UNAVAILABLE) location.longitude else null,
            locationAccuracy = location.accuracy,
            locationQuality = location.quality,
            speedKmh = location.speedKmh,
            speedAvailable = location.isSpeedAvailable,
            speedDeltaKmh = crashResult.speedDeltaKmh,
            gForce = crashResult.peakGForce,
            rollover = crashResult.isRollover,
            confidence = crashResult.confidence,
            severity = crashResult.severityScore,
            userMedicalInfo = userMedicalInfo,
            submissionStatus = SubmissionStatus.CREATED,
            retryCount = 0,
            createdAt = System.currentTimeMillis()
        )

        localStore.saveIncident(record)
        Log.d(TAG, "[LOCAL_STORE] Emergency incident ${record.incidentId} safely recorded locally FIRST.")
        return record
    }

    /**
     * MODULE D & E: RELIABLE SUBMISSION & CONTROLLED EXPONENTIAL RETRY.
     */
    suspend fun submitIncidentReliably(
        record: LocalIncidentRecord,
        onStatusUpdate: ((SubmissionStatus, LocalIncidentRecord) -> Unit)? = null
    ): Result<LocalIncidentRecord> = withContext(Dispatchers.IO) {
        localStore.updateStatus(record.incidentId, SubmissionStatus.SUBMITTING)
        record.submissionStatus = SubmissionStatus.SUBMITTING
        onStatusUpdate?.invoke(SubmissionStatus.SUBMITTING, record)

        val payload = buildPayloadFromRecord(record)

        try {
            Log.d(TAG, "[ResQNet] Submitting incident ${record.incidentId} to backend (Attempt ${record.retryCount + 1})...")
            val response = ApiClient.api.reportCrash(payload)

            if (response.isSuccessful && response.body()?.success == true) {
                val body = response.body()!!
                localStore.updateStatus(
                    incidentId = record.incidentId,
                    status = SubmissionStatus.CONFIRMED,
                    backendId = body.incidentId ?: record.incidentId,
                    ambulance = body.assignedAmbulance ?: body.incident?.assignedAmbulance,
                    hospital = body.assignedHospital ?: body.incident?.assignedHospital
                )
                record.submissionStatus = SubmissionStatus.CONFIRMED
                record.backendIncidentId = body.incidentId ?: record.incidentId
                record.assignedAmbulance = body.assignedAmbulance ?: body.incident?.assignedAmbulance
                record.assignedHospital = body.assignedHospital ?: body.incident?.assignedHospital

                Log.d(TAG, "[ResQNet] ✓ Backend confirmed incident ${record.incidentId}. Assigned: ${record.assignedAmbulance}")
                onStatusUpdate?.invoke(SubmissionStatus.CONFIRMED, record)
                return@withContext Result.success(record)
            } else {
                val err = response.errorBody()?.string() ?: "HTTP ${response.code()}"
                return@withContext handleSubmissionFailure(record, "Backend HTTP Error: $err", onStatusUpdate)
            }
        } catch (e: Exception) {
            return@withContext handleSubmissionFailure(record, "Network Connectivity Failure: ${e.message}", onStatusUpdate)
        }
    }

    private fun handleSubmissionFailure(
        record: LocalIncidentRecord,
        errorMessage: String,
        onStatusUpdate: ((SubmissionStatus, LocalIncidentRecord) -> Unit)?
    ): Result<LocalIncidentRecord> {
        val newRetryCount = record.retryCount + 1
        val isTerminal = newRetryCount >= MAX_RETRIES

        val nextStatus = if (isTerminal) SubmissionStatus.FAILED else SubmissionStatus.RETRY_REQUIRED
        val delayMs = calculateExponentialBackoff(newRetryCount)
        record.nextRetryAt = System.currentTimeMillis() + delayMs
        record.retryCount = newRetryCount
        record.submissionStatus = nextStatus

        localStore.updateStatus(
            incidentId = record.incidentId,
            status = nextStatus,
            retryCount = newRetryCount,
            errorMessage = errorMessage
        )

        Log.w(TAG, "[ResQNet] Incident ${record.incidentId} submission failed: $errorMessage. Status -> $nextStatus (Next retry in ${delayMs / 1000}s)")
        onStatusUpdate?.invoke(nextStatus, record)

        if (!isTerminal) {
            scheduleDelayedRetry(record, delayMs)
        }

        return Result.failure(Exception(errorMessage))
    }

    /**
     * Calculates exponential backoff delay: 2^n * 2 seconds capped at 60s.
     */
    fun calculateExponentialBackoff(attempt: Int): Long {
        val multiplier = 2.0.pow(min(attempt.toDouble(), 5.0)).toLong()
        val delay = BASE_RETRY_DELAY_MS * multiplier
        return min(delay, MAX_RETRY_DELAY_MS)
    }

    private fun scheduleDelayedRetry(record: LocalIncidentRecord, delayMs: Long) {
        scope.launch {
            delay(delayMs)
            val current = localStore.getIncident(record.incidentId)
            if (current != null && current.submissionStatus == SubmissionStatus.RETRY_REQUIRED) {
                if (networkMonitor.isOnline.value) {
                    Log.d(TAG, "[ResQNet] Executing scheduled retry for ${record.incidentId}...")
                    submitIncidentReliably(current)
                } else {
                    Log.d(TAG, "[ResQNet] Scheduled retry deferred: Device is currently offline.")
                }
            }
        }
    }

    /**
     * MODULE K: PROCESS RESTART RECOVERY.
     * Scans local disk store and resumes any unconfirmed emergency submissions.
     */
    suspend fun flushPendingRetries(): Int = withContext(Dispatchers.IO) {
        val pendingList = localStore.getPendingOrRetryRequired()
        if (pendingList.isEmpty()) return@withContext 0

        Log.d(TAG, "[ResQNet] Found ${pendingList.size} unconfirmed incidents. Resuming submissions...")
        var confirmedCount = 0

        for (record in pendingList) {
            val result = submitIncidentReliably(record)
            if (result.isSuccess) {
                confirmedCount++
            }
        }

        return@withContext confirmedCount
    }

    fun getAllLocalIncidents(): List<LocalIncidentRecord> = localStore.getAllIncidents()

    fun getLocalIncident(id: String): LocalIncidentRecord? = localStore.getIncident(id)

    private fun buildPayloadFromRecord(record: LocalIncidentRecord): EmergencyPayload {
        val isoTimestamp = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date(record.timestamp))

        return EmergencyPayload(
            id = record.incidentId,
            incidentId = record.incidentId,
            deviceId = record.deviceId,
            userId = record.userId,
            eventType = record.eventType,
            source = "smartphone",
            sourceType = "smartphone",
            title = record.title,
            latitude = record.latitude,
            longitude = record.longitude,
            gpsAccuracy = record.locationAccuracy,
            locationQuality = record.locationQuality.name,
            gForce = record.gForce,
            speedKmh = record.speedKmh,
            speedDeltaKmh = record.speedDeltaKmh,
            speedAvailable = record.speedAvailable,
            rollover = record.rollover,
            confidence = record.confidence,
            severity = record.severity,
            status = "DETECTED",
            userMedicalInfo = record.userMedicalInfo,
            timestamp = isoTimestamp,
            isDemo = false
        )
    }

    fun generateEmergencyMessage(record: LocalIncidentRecord): String {
        val timeString = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date(record.timestamp))
        val locStr = when (record.locationQuality) {
            LocationQuality.FRESH_GPS -> {
                if (record.latitude != null && record.longitude != null) {
                    "${"%.4f".format(record.latitude)}, ${"%.4f".format(record.longitude)} (±${record.locationAccuracy?.toInt() ?: 5}m Live GPS)"
                } else "Location Unavailable"
            }
            LocationQuality.LAST_KNOWN -> {
                if (record.latitude != null && record.longitude != null) {
                    "${"%.4f".format(record.latitude)}, ${"%.4f".format(record.longitude)} (Last Known Location)"
                } else "Location Unavailable"
            }
            LocationQuality.UNAVAILABLE -> "Location Temporarily Unavailable"
        }

        val gForceStr = if (record.gForce != null) "${"%.1f".format(record.gForce)}G" else "Unavailable"
        val deltaVStr = if (record.speedDeltaKmh != null) "${"%.1f".format(record.speedDeltaKmh)} km/h" else "Unavailable"
        val confStr = if (record.confidence != null) "${(record.confidence * 100).toInt()}%" else "Unavailable"
        val sevStr = if (record.severity != null) "${record.severity}/100" else "Unavailable"

        return """
            🚨 RESQNET EMERGENCY ALERT 🚨
            Possible road collision autonomously detected.

            📍 Location: $locStr
            📊 Impact Force: $gForceStr
            ⚡ Deceleration Δv: $deltaVStr
            🎯 Confidence: $confStr
            ⚠️ Severity: $sevStr
            🕒 Time: $timeString
            📱 Incident ID: ${record.incidentId}
            🩺 Medical: ${record.userMedicalInfo ?: "None reported"}
        """.trimIndent()
    }
}
