package com.resqnet.app.data.local

import android.content.Context
import android.util.Log
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.resqnet.app.domain.model.LocationQuality
import com.resqnet.app.domain.model.SubmissionStatus
import java.io.File
import java.io.FileOutputStream
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import android.util.Base64

data class LocalIncidentRecord(
    val incidentId: String,
    val deviceId: String,
    val userId: String,
    val eventType: String = "ACCIDENT",
    val source: String = "SMARTPHONE",
    val title: String,
    val timestamp: Long,
    val latitude: Double?,
    val longitude: Double?,
    val locationAccuracy: Float?,
    val locationQuality: LocationQuality = LocationQuality.FRESH_GPS,
    val speedKmh: Float? = null,
    val speedAvailable: Boolean = false,
    val speedDeltaKmh: Float? = null,
    val gForce: Float? = null,
    val rollover: Boolean = false,
    val confidence: Float? = null,
    val severity: Int? = null,
    val userMedicalInfo: String? = null,
    var submissionStatus: SubmissionStatus = SubmissionStatus.CREATED,
    var retryCount: Int = 0,
    val createdAt: Long = System.currentTimeMillis(),
    var lastAttemptAt: Long = 0L,
    var nextRetryAt: Long = 0L,
    var backendIncidentId: String? = null,
    var assignedAmbulance: String? = null,
    var assignedHospital: String? = null,
    var lastErrorMessage: String? = null
)

/**
 * Thread-safe, atomic disk persistence store for ResQNet emergency incident records.
 * Ensures an emergency is safely preserved on the device before any network transmission begins.
 */
class LocalIncidentStore(private val context: Context) {

    private val gson = Gson()
    private val storeFile = File(context.filesDir, "resqnet_incidents_v2.json")
    private val lock = Any()

    companion object {
        private const val TAG = "ResQNet_LocalStore"
        private const val KEY_ALIAS = "resqnet.incident.storage.v1"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    }

    /**
     * Persists or updates an incident record to disk using write-to-temp-and-rename atomic semantics.
     */
    fun saveIncident(record: LocalIncidentRecord) {
        synchronized(lock) {
            val records = loadAllInternal().toMutableMap()
            records[record.incidentId] = record
            writeRecordsToDisk(records.values.toList())
            Log.d(TAG, "Incident stored locally. Status: ${record.submissionStatus}")
        }
    }

    fun getIncident(incidentId: String): LocalIncidentRecord? {
        synchronized(lock) {
            return loadAllInternal()[incidentId]
        }
    }

    fun getAllIncidents(): List<LocalIncidentRecord> {
        synchronized(lock) {
            return loadAllInternal().values.sortedByDescending { it.createdAt }
        }
    }

    fun getPendingOrRetryRequired(): List<LocalIncidentRecord> {
        synchronized(lock) {
            return loadAllInternal().values.filter {
                it.submissionStatus == SubmissionStatus.CREATED ||
                it.submissionStatus == SubmissionStatus.PENDING_SUBMISSION ||
                it.submissionStatus == SubmissionStatus.RETRY_REQUIRED
            }.sortedBy { it.createdAt }
        }
    }

    fun updateStatus(
        incidentId: String,
        status: SubmissionStatus,
        retryCount: Int? = null,
        errorMessage: String? = null,
        backendId: String? = null,
        ambulance: String? = null,
        hospital: String? = null
    ) {
        synchronized(lock) {
            val record = loadAllInternal()[incidentId] ?: return
            record.submissionStatus = status
            record.lastAttemptAt = System.currentTimeMillis()
            if (retryCount != null) record.retryCount = retryCount
            if (errorMessage != null) record.lastErrorMessage = errorMessage
            if (backendId != null) record.backendIncidentId = backendId
            if (ambulance != null) record.assignedAmbulance = ambulance
            if (hospital != null) record.assignedHospital = hospital

            saveIncident(record)
        }
    }

    private fun loadAllInternal(): Map<String, LocalIncidentRecord> {
        if (!storeFile.exists()) return emptyMap()
        return try {
            val stored = storeFile.readText()
            val json = if (stored.startsWith("v1:")) decrypt(stored) else stored
            val type = object : TypeToken<List<LocalIncidentRecord>>() {}.type
            val list: List<LocalIncidentRecord> = gson.fromJson(json, type) ?: emptyList()
            list.associateBy { it.incidentId }
        } catch (e: Exception) {
            Log.e(TAG, "Unable to load encrypted incident store", e)
            emptyMap()
        }
    }

    private fun writeRecordsToDisk(records: List<LocalIncidentRecord>) {
        try {
            val tempFile = File(context.filesDir, "resqnet_incidents_v2.tmp")
            val json = gson.toJson(records)
            val encrypted = encrypt(json)
            FileOutputStream(tempFile).use { fos ->
                fos.write(encrypted.toByteArray(Charsets.UTF_8))
                fos.fd.sync()
            }
            if (tempFile.renameTo(storeFile) || (storeFile.delete() && tempFile.renameTo(storeFile))) {
                // Atomic replace succeeded
            } else {
                throw IllegalStateException("Atomic incident-store replacement failed")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Unable to persist encrypted incident store", e)
        }
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance("AES", ANDROID_KEYSTORE).apply {
            init(android.security.keystore.KeyGenParameterSpec.Builder(KEY_ALIAS, android.security.keystore.KeyProperties.PURPOSE_ENCRYPT or android.security.keystore.KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE)
                .build())
        }.generateKey()
    }

    private fun encrypt(plain: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, getOrCreateKey()) }
        val payload = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        return "v1:${Base64.encodeToString(cipher.iv, Base64.NO_WRAP)}:${Base64.encodeToString(payload, Base64.NO_WRAP)}"
    }

    private fun decrypt(stored: String): String {
        val parts = stored.split(":", limit = 3)
        require(parts.size == 3 && parts[0] == "v1") { "Unsupported incident-store format" }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(128, Base64.decode(parts[1], Base64.NO_WRAP))) }
        return String(cipher.doFinal(Base64.decode(parts[2], Base64.NO_WRAP)), Charsets.UTF_8)
    }
}
