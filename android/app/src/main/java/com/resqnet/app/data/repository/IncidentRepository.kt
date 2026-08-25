package com.resqnet.app.data.repository

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.resqnet.app.data.api.ApiClient
import com.resqnet.app.data.api.EmergencyPayload
import com.resqnet.app.data.api.IncidentDto
import com.resqnet.app.domain.model.CrashDetectionResult
import com.resqnet.app.domain.model.EmergencyState
import com.resqnet.app.location.LocationData
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.*

class IncidentRepository(private val context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("resqnet_incidents_store", Context.MODE_PRIVATE)
    private val gson = Gson()

    companion object {
        private const val TAG = "ResQNet_Repository"
        private const val KEY_PENDING_QUEUE = "pending_emergency_queue"
    }

    private val deviceId: String by lazy {
        try {
            Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: Build.MODEL
        } catch (e: Exception) {
            "DEVICE_${Build.MANUFACTURER}_${Build.MODEL}"
        }
    }

    /**
     * Builds a structured EmergencyPayload from sensor detection and GPS location data.
     */
    fun createPayload(
        crashResult: CrashDetectionResult,
        location: LocationData?,
        userMedicalInfo: String = "Blood: O+ | Known Allergies: None"
    ): EmergencyPayload {
        val lat = location?.latitude ?: 18.5204 // Fallback if degraded
        val lng = location?.longitude ?: 73.8567
        val accuracy = location?.accuracy ?: 10.0f
        val isoTimestamp = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date(crashResult.timestamp))

        val title = if (crashResult.isRollover) {
            "Severe Vehicle Rollover Collision (Android Sensor)"
        } else {
            "High-Impact Collision Detected (${crashResult.peakGForce.toInt()}G Shock)"
        }

        return EmergencyPayload(
            deviceId = deviceId,
            userId = "USER_${deviceId.takeLast(6)}",
            eventType = "ACCIDENT",
            source = "smartphone",
            sourceType = "smartphone",
            title = title,
            latitude = lat,
            longitude = lng,
            gpsAccuracy = accuracy,
            gForce = crashResult.peakGForce,
            speedKmh = location?.speedKmh ?: 0f,
            speedDeltaKmh = crashResult.speedDeltaKmh,
            rollover = crashResult.isRollover,
            confidence = crashResult.confidence,
            severity = crashResult.severityScore,
            status = "DETECTED",
            userMedicalInfo = userMedicalInfo,
            timestamp = isoTimestamp
        )
    }

    /**
     * Formats a human-readable emergency message from structured payload data (Module 7).
     */
    fun generateEmergencyMessage(payload: EmergencyPayload): String {
        val timeString = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
        val locStr = if (payload.latitude != 0.0) {
            "${"%.4f".format(payload.latitude)}, ${"%.4f".format(payload.longitude)} (±${payload.gpsAccuracy?.toInt() ?: 5}m)"
        } else {
            "Location Unavailable"
        }

        return """
            🚨 RESQNET EMERGENCY ALERT 🚨
            Possible road collision autonomously detected.

            📍 Location: $locStr
            📊 Impact Force: ${payload.gForce?.let { "%.1f".format(it) } ?: "3.2"}G
            ⚡ Deceleration Δv: ${payload.speedDeltaKmh?.let { "%.1f".format(it) } ?: "30"} km/h
            🎯 Confidence: ${(payload.confidence * 100).toInt()}%
            ⚠️ Severity: ${payload.severity ?: 85}/100
            🕒 Time: $timeString
            📱 Device: ${payload.deviceId}
            🩺 Medical: ${payload.userMedicalInfo ?: "None recorded"}
        """.trimIndent()
    }

    /**
     * Submits an emergency incident to the backend.
     * Queues locally if offline or network fails.
     */
    suspend fun submitIncident(payload: EmergencyPayload): Result<IncidentDto> = withContext(Dispatchers.IO) {
        Log.d(TAG, "[ResQNet] Sending incident to backend: ${payload.title}")
        try {
            val response = ApiClient.api.reportCrash(payload)
            if (response.isSuccessful && response.body()?.success == true) {
                val body = response.body()!!
                val incident = body.incident ?: IncidentDto(
                    id = body.incidentId ?: "RNQ-AUTO",
                    incidentId = body.incidentId,
                    title = payload.title,
                    severity = body.severity ?: payload.severity,
                    confidence = body.confidence ?: payload.confidence,
                    status = body.status ?: "VERIFIED",
                    state = body.status ?: "VERIFIED",
                    ambulanceId = null,
                    ambulanceCode = null,
                    ambulanceReason = null,
                    hospitalId = null,
                    assignedHospital = null,
                    hospitalReason = null
                )
                Log.d(TAG, "[ResQNet] Incident submitted successfully. ID: ${incident.id}")
                return@withContext Result.success(incident)
            } else {
                val err = response.errorBody()?.string() ?: "HTTP ${response.code()}"
                Log.w(TAG, "[ResQNet] Backend rejected incident: $err. Queuing locally.")
                enqueuePendingIncident(payload)
                return@withContext Result.failure(Exception("Submission failed: $err"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "[ResQNet] Network connection failed: ${e.message}. Queuing offline.")
            enqueuePendingIncident(payload)
            return@withContext Result.failure(e)
        }
    }

    /**
     * Enqueues an un-submitted emergency payload to persistent offline storage.
     */
    private fun enqueuePendingIncident(payload: EmergencyPayload) {
        val currentQueue = getPendingQueue().toMutableList()
        currentQueue.add(payload)
        prefs.edit().putString(KEY_PENDING_QUEUE, gson.toJson(currentQueue)).apply()
        Log.d(TAG, "[ResQNet] Offline queue updated. Total pending: ${currentQueue.size}")
    }

    fun getPendingQueue(): List<EmergencyPayload> {
        val json = prefs.getString(KEY_PENDING_QUEUE, null) ?: return emptyList()
        val type = object : TypeToken<List<EmergencyPayload>>() {}.type
        return try {
            gson.fromJson(json, type) ?: emptyList()
        } catch (e: Exception) {
            emptyList()
        }
    }

    /**
     * Flushes and retries submitting all pending offline incidents.
     */
    suspend fun flushOfflineQueue(): Int = withContext(Dispatchers.IO) {
        val pending = getPendingQueue()
        if (pending.isEmpty()) return@withContext 0

        var successfulCount = 0
        val remaining = mutableListOf<EmergencyPayload>()

        for (payload in pending) {
            try {
                val res = ApiClient.api.reportCrash(payload)
                if (res.isSuccessful && res.body()?.success == true) {
                    successfulCount++
                } else {
                    remaining.add(payload)
                }
            } catch (e: Exception) {
                remaining.add(payload)
            }
        }

        prefs.edit().putString(KEY_PENDING_QUEUE, gson.toJson(remaining)).apply()
        Log.d(TAG, "[ResQNet] Offline queue flushed. $successfulCount sent, ${remaining.size} remaining.")
        return@withContext successfulCount
    }
}
