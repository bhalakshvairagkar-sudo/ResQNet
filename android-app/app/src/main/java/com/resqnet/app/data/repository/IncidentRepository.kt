package com.resqnet.app.data.repository

import android.content.Context
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.resqnet.app.data.api.ApiClient
import com.resqnet.app.data.api.EmergencyPayload
import com.resqnet.app.data.api.PatientProfileDto
import com.resqnet.app.data.api.EmergencyContactDto
import com.resqnet.app.data.local.LocalIncidentRecord
import com.resqnet.app.data.local.LocalIncidentStore
import com.resqnet.app.data.local.UserSessionManager
import com.resqnet.app.domain.model.CrashDetectionResult
import com.resqnet.app.domain.model.LocationQuality
import com.resqnet.app.domain.model.SubmissionStatus
import com.resqnet.app.location.LocationData
import com.resqnet.app.network.NetworkMonitor
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import kotlin.math.min
import kotlin.math.pow

class IncidentRepository(
    private val context: Context
) {

    private val localStore =
        LocalIncidentStore(context)

    private val networkMonitor =
        NetworkMonitor.getInstance(context)

    private val scope =
        CoroutineScope(
            Dispatchers.IO + SupervisorJob()
        )


    companion object {

        private const val TAG =
            "ResQNet_Repository"

        private const val MAX_RETRIES =
            10

        private const val BASE_RETRY_DELAY_MS =
            2_000L

        private const val MAX_RETRY_DELAY_MS =
            60_000L
    }


    // =========================================================
    // DEVICE ID
    // =========================================================

    val deviceId: String by lazy {

        try {

            Settings.Secure.getString(
                context.contentResolver,
                Settings.Secure.ANDROID_ID
            ) ?: Build.MODEL

        } catch (
            e: Exception
        ) {

            "DEVICE_${Build.MANUFACTURER}_${Build.MODEL}"
        }
    }


    // =========================================================
    // INITIALIZATION
    // =========================================================

    init {

        networkMonitor
            .setOnNetworkRestoredListener {

                Log.d(
                    TAG,
                    "[NETWORK] Connectivity restored"
                )

                scope.launch {

                    flushPendingRetries()
                }
            }
    }


    // =========================================================
    // CREATE LOCAL INCIDENT
    // =========================================================

    fun createAndSaveLocalIncident(
        crashResult: CrashDetectionResult,
        location: LocationData,
        userMedicalInfo: String? = null
    ): LocalIncidentRecord {
        val resolvedMedical = userMedicalInfo ?: UserSessionManager.getMedicalSummary(context)


        val incidentId =
            "RNQ-${
                UUID.randomUUID()
                    .toString()
                    .replace("-", "")
                    .take(8)
                    .uppercase()
            }"


        val title =
            if (
                crashResult.isRollover
            ) {

                "Severe Vehicle Rollover Collision"

            } else {

                "High-Impact Collision Detected"
            }


        val record =
            LocalIncidentRecord(

                incidentId =
                    incidentId,

                deviceId =
                    deviceId,

                userId =
                    "USER_${deviceId.takeLast(6)}",

                eventType =
                    "ACCIDENT",

                source =
                    "SMARTPHONE",

                title =
                    title,

                timestamp =
                    crashResult.timestamp,

                latitude =
                    if (
                        location.quality !=
                        LocationQuality.UNAVAILABLE
                    ) {

                        location.latitude

                    } else {

                        null
                    },

                longitude =
                    if (
                        location.quality !=
                        LocationQuality.UNAVAILABLE
                    ) {

                        location.longitude

                    } else {

                        null
                    },

                locationAccuracy =
                    location.accuracy,

                locationQuality =
                    location.quality,

                speedKmh =
                    location.speedKmh,

                speedAvailable =
                    location.isSpeedAvailable,

                speedDeltaKmh =
                    crashResult.speedDeltaKmh,

                gForce =
                    crashResult.peakGForce,

                rollover =
                    crashResult.isRollover,

                confidence =
                    crashResult.confidence,

                severity =
                    crashResult.severityScore,

                userMedicalInfo =
                    resolvedMedical,

                submissionStatus =
                    SubmissionStatus.CREATED,

                retryCount =
                    0
            )


        // =====================================================
        // CRITICAL:
        // SAVE BEFORE NETWORK
        // =====================================================

        localStore.saveIncident(
            record
        )


        Log.d(
            TAG,
            "[LOCAL] Incident saved BEFORE API call: " +
                    incidentId
        )


        return record
    }


    // =========================================================
    // SUBMIT INCIDENT
    // =========================================================

    suspend fun submitIncidentReliably(
        record: LocalIncidentRecord,
        onStatusUpdate:
        ((SubmissionStatus, LocalIncidentRecord) -> Unit)? =
            null
    ): Result<LocalIncidentRecord> =
        withContext(Dispatchers.IO) {


            try {

                // =================================================
                // STEP 1 — SAVE SUBMITTING
                // =================================================

                record.submissionStatus =
                    SubmissionStatus.SUBMITTING

                record.lastAttemptAt =
                    System.currentTimeMillis()

                localStore.saveIncident(
                    record
                )

                onStatusUpdate?.invoke(
                    SubmissionStatus.SUBMITTING,
                    record
                )


                // =================================================
                // STEP 2 — CREATE PAYLOAD
                // =================================================

                val payload =
                    buildPayloadFromRecord(
                        record
                    )


                Log.d(
                    TAG,
                    "========================================"
                )

                Log.d(
                    TAG,
                    "[API] SUBMITTING INCIDENT"
                )

                Log.d(
                    TAG,
                    "[API] Incident ID = ${record.incidentId}"
                )

                Log.d(
                    TAG,
                    "[API] Base URL = ${ApiClient.getBaseUrl()}"
                )

                Log.d(
                    TAG,
                    "[API] Endpoint = api/incidents/detect"
                )

                Log.d(
                    TAG,
                    "[API] Attempt = ${record.retryCount + 1}"
                )

                Log.d(
                    TAG,
                    "[API] Lat = ${payload.latitude}"
                )

                Log.d(
                    TAG,
                    "[API] Lng = ${payload.longitude}"
                )

                Log.d(
                    TAG,
                    "[API] GForce = ${payload.gForce}"
                )

                Log.d(
                    TAG,
                    "[API] Severity = ${payload.severity}"
                )

                Log.d(
                    TAG,
                    "[API] Confidence = ${payload.confidence}"
                )

                Log.d(
                    TAG,
                    "========================================"
                )


                // =================================================
                // STEP 3 — API REQUEST
                // =================================================

                val response =
                    ApiClient.api.reportCrash(
                        payload
                    )


                Log.d(
                    TAG,
                    "========================================"
                )

                Log.d(
                    TAG,
                    "[API] RESPONSE"
                )

                Log.d(
                    TAG,
                    "[API] HTTP = ${response.code()}"
                )

                Log.d(
                    TAG,
                    "[API] Successful = ${response.isSuccessful}"
                )

                Log.d(
                    TAG,
                    "[API] Message = ${response.message()}"
                )

                Log.d(
                    TAG,
                    "========================================"
                )


                // =================================================
                // SUCCESS
                // =================================================

                if (
                    response.isSuccessful
                ) {

                    val body =
                        response.body()


                    if (
                        body != null &&
                        body.success
                    ) {


                        record.submissionStatus =
                            SubmissionStatus.CONFIRMED


                        record.backendIncidentId =
                            body.incidentId
                                ?: body.incident?.incidentId
                                        ?: record.incidentId


                        record.assignedAmbulance =
                            body.assignedAmbulance
                                ?: body.incident?.assignedAmbulance


                        record.assignedHospital =
                            body.assignedHospital
                                ?: body.incident?.assignedHospital


                        record.lastErrorMessage =
                            null


                        record.nextRetryAt =
                            0L


                        localStore.saveIncident(
                            record
                        )


                        Log.d(
                            TAG,
                            "[API] ✓ INCIDENT CONFIRMED"
                        )

                        Log.d(
                            TAG,
                            "[API] Backend ID = " +
                                    record.backendIncidentId
                        )

                        Log.d(
                            TAG,
                            "[API] Ambulance = " +
                                    record.assignedAmbulance
                        )

                        Log.d(
                            TAG,
                            "[API] Hospital = " +
                                    record.assignedHospital
                        )


                        onStatusUpdate?.invoke(
                            SubmissionStatus.CONFIRMED,
                            record
                        )


                        return@withContext Result.success(
                            record
                        )
                    }
                }


                // =================================================
                // HTTP FAILURE
                // =================================================

                val errorBody =
                    try {

                        response
                            .errorBody()
                            ?.string()

                    } catch (
                        _: Exception
                    ) {

                        null
                    }


                val errorMessage =
                    buildString {

                        append(
                            "HTTP ${response.code()}"
                        )

                        if (
                            response.message()
                                .isNotBlank()
                        ) {

                            append(
                                " ${response.message()}"
                            )
                        }

                        if (
                            !errorBody.isNullOrBlank()
                        ) {

                            append(
                                " | $errorBody"
                            )
                        }
                    }


                Log.e(
                    TAG,
                    "[API] ✗ SERVER ERROR: $errorMessage"
                )


                handleFailure(
                    record =
                        record,

                    errorMessage =
                        errorMessage,

                    httpCode =
                        response.code(),

                    onStatusUpdate =
                        onStatusUpdate
                )

            } catch (
                e: Exception
            ) {


                // =================================================
                // NETWORK FAILURE
                // =================================================

                val errorMessage =
                    "${e.javaClass.simpleName}: " +
                            "${e.message ?: "Unknown network error"}"


                Log.e(
                    TAG,
                    "[API] ✗ NETWORK ERROR"
                )

                Log.e(
                    TAG,
                    "[API] $errorMessage",
                    e
                )


                handleFailure(
                    record =
                        record,

                    errorMessage =
                        errorMessage,

                    httpCode =
                        null,

                    onStatusUpdate =
                        onStatusUpdate
                )
            }
        }


    // =========================================================
    // HANDLE FAILURE
    // =========================================================

    private fun handleFailure(
        record: LocalIncidentRecord,
        errorMessage: String,
        httpCode: Int?,
        onStatusUpdate:
        ((SubmissionStatus, LocalIncidentRecord) -> Unit)?
    ): Result<LocalIncidentRecord> {


        // =======================================================
        // DETERMINE RETRY
        // =======================================================

        val retryable =
            when (httpCode) {

                400,
                401,
                403,
                404,
                422 -> false

                408,
                409,
                425,
                429,
                500,
                502,
                503,
                504 -> true

                null -> true

                else -> true
            }


        // =======================================================
        // NON-RETRYABLE ERROR
        // =======================================================

        if (!retryable) {

            record.submissionStatus =
                SubmissionStatus.FAILED

            record.lastAttemptAt =
                System.currentTimeMillis()

            record.lastErrorMessage =
                errorMessage

            record.nextRetryAt =
                0L

            localStore.saveIncident(
                record
            )


            onStatusUpdate?.invoke(
                SubmissionStatus.FAILED,
                record
            )


            return Result.failure(
                Exception(
                    errorMessage
                )
            )
        }


        // =======================================================
        // RETRY COUNT
        // =======================================================

        val nextRetryCount =
            record.retryCount + 1


        if (
            nextRetryCount >=
            MAX_RETRIES
        ) {

            record.retryCount =
                nextRetryCount

            record.submissionStatus =
                SubmissionStatus.FAILED

            record.lastAttemptAt =
                System.currentTimeMillis()

            record.lastErrorMessage =
                "Maximum retries reached. $errorMessage"

            record.nextRetryAt =
                0L

            localStore.saveIncident(
                record
            )


            onStatusUpdate?.invoke(
                SubmissionStatus.FAILED,
                record
            )


            return Result.failure(
                Exception(
                    record.lastErrorMessage
                )
            )
        }


        // =======================================================
        // EXPONENTIAL BACKOFF
        // =======================================================

        val delayMs =
            calculateExponentialBackoff(
                nextRetryCount
            )


        record.retryCount =
            nextRetryCount

        record.submissionStatus =
            SubmissionStatus.RETRY_REQUIRED

        record.lastAttemptAt =
            System.currentTimeMillis()

        record.lastErrorMessage =
            errorMessage

        record.nextRetryAt =
            System.currentTimeMillis() +
                    delayMs


        // =======================================================
        // CRITICAL:
        // SAVE RETRY STATE
        // =======================================================

        localStore.saveIncident(
            record
        )


        Log.w(
            TAG,
            "[RETRY] Incident=${record.incidentId}"
        )

        Log.w(
            TAG,
            "[RETRY] Count=${record.retryCount}"
        )

        Log.w(
            TAG,
            "[RETRY] Next retry=${delayMs / 1000}s"
        )


        onStatusUpdate?.invoke(
            SubmissionStatus.RETRY_REQUIRED,
            record
        )


        scheduleRetry(
            record,
            delayMs
        )


        return Result.failure(
            Exception(
                errorMessage
            )
        )
    }


    // =========================================================
    // BACKOFF
    // =========================================================

    private fun calculateExponentialBackoff(
        attempt: Int
    ): Long {

        val multiplier =
            2.0.pow(
                min(
                    attempt,
                    5
                ).toDouble()
            )


        return min(
            BASE_RETRY_DELAY_MS *
                    multiplier.toLong(),

            MAX_RETRY_DELAY_MS
        )
    }


    // =========================================================
    // SCHEDULE RETRY
    // =========================================================

    private fun scheduleRetry(
        record: LocalIncidentRecord,
        delayMs: Long
    ) {

        scope.launch {

            delay(
                delayMs
            )


            val current =
                localStore.getIncident(
                    record.incidentId
                )


            if (
                current == null
            ) {

                return@launch
            }


            if (
                current.submissionStatus !=
                SubmissionStatus.RETRY_REQUIRED
            ) {

                return@launch
            }


            if (
                networkMonitor.isOnline.value
            ) {

                Log.d(
                    TAG,
                    "[RETRY] Retrying " +
                            current.incidentId
                )


                submitIncidentReliably(
                    current
                )

            } else {

                Log.d(
                    TAG,
                    "[RETRY] Still offline. " +
                            "Incident remains locally stored."
                )
            }
        }
    }


    // =========================================================
    // RECOVER PENDING INCIDENTS
    // =========================================================

    suspend fun flushPendingRetries():
            Int =
        withContext(Dispatchers.IO) {


            val pending =
                localStore
                    .getPendingOrRetryRequired()


            if (
                pending.isEmpty()
            ) {

                Log.d(
                    TAG,
                    "[RECOVERY] No pending incidents"
                )

                return@withContext 0
            }


            Log.d(
                TAG,
                "[RECOVERY] Found ${pending.size} pending incidents"
            )


            var confirmed =
                0


            for (
            incident in pending
            ) {


                // Don't retry a future scheduled retry immediately.
                if (
                    incident.submissionStatus ==
                    SubmissionStatus.RETRY_REQUIRED &&

                    incident.nextRetryAt > 0L &&

                    System.currentTimeMillis() <
                    incident.nextRetryAt
                ) {

                    continue
                }


                val result =
                    submitIncidentReliably(
                        incident
                    )


                if (
                    result.isSuccess
                ) {

                    confirmed++
                }
            }


            confirmed
        }


    // =========================================================
    // GET INCIDENTS
    // =========================================================

    fun getAllLocalIncidents():
            List<LocalIncidentRecord> {

        return localStore
            .getAllIncidents()
    }


    fun getLocalIncident(
        id: String
    ): LocalIncidentRecord? {

        return localStore
            .getIncident(id)
    }


    // =========================================================
    // PAYLOAD
    // =========================================================

    private fun buildPayloadFromRecord(
        record: LocalIncidentRecord
    ): EmergencyPayload {


        val timestamp =
            SimpleDateFormat(
                "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
                Locale.US
            ).apply {

                timeZone =
                    TimeZone.getTimeZone("UTC")

            }.format(
                Date(
                    record.timestamp
                )
            )


        return EmergencyPayload(

            id =
                record.incidentId,

            incidentId =
                record.incidentId,

            deviceId =
                record.deviceId,

            userId =
                record.userId,

            eventType =
                record.eventType,

            source =
                "smartphone",

            sourceType =
                "smartphone",

            title =
                record.title,

            latitude =
                record.latitude,

            longitude =
                record.longitude,

            gpsAccuracy =
                record.locationAccuracy,

            locationQuality =
                record.locationQuality.name,

            gForce =
                record.gForce,

            speedKmh =
                record.speedKmh,

            speedDeltaKmh =
                record.speedDeltaKmh,

            speedAvailable =
                record.speedAvailable,

            rollover =
                record.rollover,

            confidence =
                record.confidence,

            severity =
                record.severity,

            status =
                "DETECTED",

            userMedicalInfo =
                record.userMedicalInfo ?: UserSessionManager.getMedicalSummary(context),

            patientProfile = run {
                val s = UserSessionManager.getSessionData(context)
                PatientProfileDto(
                    fullName = s.fullName ?: s.username ?: "Registered Citizen",
                    bloodGroup = s.bloodGroup ?: "O+ POSITIVE",
                    allergies = s.allergies?.split(",")?.map { it.trim() }?.filter { it.isNotEmpty() } ?: listOf("None Reported"),
                    chronicConditions = s.chronicConditions?.split(",")?.map { it.trim() }?.filter { it.isNotEmpty() } ?: listOf("None Reported"),
                    currentMedications = s.medications ?: "None Reported",
                    primaryContact = EmergencyContactDto(
                        name = s.emergencyContact ?: "Emergency Next-of-Kin",
                        phone = s.emergencyPhone ?: "+91 98220 12345",
                        relation = "Next-of-Kin"
                    ),
                    specialNotes = s.specialNotes ?: "Emergency Profile Armed"
                )
            },

            timestamp =
                timestamp,

            isDemo =
                false
        )
    }


    // =========================================================
    // EMERGENCY MESSAGE
    // =========================================================

    fun generateEmergencyMessage(
        record: LocalIncidentRecord
    ): String {


        val time =
            SimpleDateFormat(
                "HH:mm:ss",
                Locale.getDefault()
            ).format(
                Date(
                    record.timestamp
                )
            )


        val location =
            if (
                record.latitude != null &&
                record.longitude != null
            ) {

                "${"%.4f".format(record.latitude)}, " +
                        "${"%.4f".format(record.longitude)}"

            } else {

                "Unavailable"
            }


        val gForce =
            record.gForce?.let {

                "${"%.1f".format(it)}G"

            } ?: "Unavailable"


        val deltaV =
            record.speedDeltaKmh?.let {

                "${"%.1f".format(it)} km/h"

            } ?: "Unavailable"


        val confidence =
            record.confidence?.let {

                "${(it * 100).toInt()}%"

            } ?: "Unavailable"


        val severity =
            record.severity?.let {

                "$it/100"

            } ?: "Unavailable"


        return """
            🚨 RESQNET EMERGENCY ALERT 🚨

            Possible road collision autonomously detected.

            📍 Location: $location
            📊 Impact Force: $gForce
            ⚡ Deceleration Δv: $deltaV
            🎯 Confidence: $confidence
            ⚠️ Severity: $severity
            🕒 Time: $time
            📱 Incident ID: ${record.incidentId}
            🩺 Medical: ${record.userMedicalInfo ?: "None reported"}
        """.trimIndent()
    }
}