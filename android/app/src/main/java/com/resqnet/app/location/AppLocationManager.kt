package com.resqnet.app.location

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.google.android.gms.location.*
import com.resqnet.app.domain.model.LocationQuality

data class LocationData(
    val latitude: Double,
    val longitude: Double,
    val accuracy: Float,
    val speedKmh: Float,
    val timestamp: Long = System.currentTimeMillis(),
    val quality: LocationQuality = LocationQuality.FRESH_GPS,
    val isDegraded: Boolean = false,
    val provider: String = "gps"
)

class AppLocationManager(private val context: Context) {

    private val fusedLocationClient: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(context)
    private val systemLocationManager =
        context.getSystemService(Context.LOCATION_SERVICE) as LocationManager

    private var lastKnownLocation: LocationData? = null

    companion object {
        private const val TAG = "ResQNet_Location"
        private const val FRESH_LOCATION_MAX_AGE_MS = 60000L // 1 minute
        private const val GPS_ACQUISITION_TIMEOUT_MS = 5000L  // 5 second max wait for fresh fix
    }

    /**
     * Attempts to acquire fresh high-accuracy GPS coordinates within a 5-second window.
     * Falls back to last known location or marks UNAVAILABLE without ever blocking the emergency pipeline.
     */
    @SuppressLint("MissingPermission")
    fun acquireLatestLocation(onResult: (LocationData) -> Unit) {
        Log.d(TAG, "[ResQNet] Acquiring GPS location with 5s bounded timeout...")

        var hasDeliveredResult = false
        val timeoutHandler = Handler(Looper.getMainLooper())

        val timeoutRunnable = Runnable {
            if (!hasDeliveredResult) {
                hasDeliveredResult = true
                Log.w(TAG, "[ResQNet] Fresh GPS timed out after 5s. Falling back to last known location.")
                fallbackToLastKnownLocation(onResult)
            }
        }
        timeoutHandler.postDelayed(timeoutRunnable, GPS_ACQUISITION_TIMEOUT_MS)

        try {
            fusedLocationClient.getCurrentLocation(
                Priority.PRIORITY_HIGH_ACCURACY,
                null
            ).addOnSuccessListener { loc: Location? ->
                if (!hasDeliveredResult) {
                    hasDeliveredResult = true
                    timeoutHandler.removeCallbacks(timeoutRunnable)

                    if (loc != null && (System.currentTimeMillis() - loc.time) < FRESH_LOCATION_MAX_AGE_MS) {
                        val freshData = LocationData(
                            latitude = loc.latitude,
                            longitude = loc.longitude,
                            accuracy = loc.accuracy,
                            speedKmh = loc.speed * 3.6f,
                            timestamp = loc.time,
                            quality = LocationQuality.FRESH_GPS,
                            isDegraded = false,
                            provider = loc.provider ?: "fused_gps"
                        )
                        lastKnownLocation = freshData
                        Log.d(TAG, "[ResQNet] Fresh GPS Acquired: (${freshData.latitude}, ${freshData.longitude}) ±${freshData.accuracy}m")
                        onResult(freshData)
                    } else {
                        fallbackToLastKnownLocation(onResult)
                    }
                }
            }.addOnFailureListener { e ->
                if (!hasDeliveredResult) {
                    hasDeliveredResult = true
                    timeoutHandler.removeCallbacks(timeoutRunnable)
                    Log.w(TAG, "[ResQNet] FusedLocation failure, falling back to cached", e)
                    fallbackToLastKnownLocation(onResult)
                }
            }
        } catch (e: SecurityException) {
            if (!hasDeliveredResult) {
                hasDeliveredResult = true
                timeoutHandler.removeCallbacks(timeoutRunnable)
                Log.e(TAG, "[ResQNet] Location permission denied. Proceeding with location unavailable.", e)
                onResult(createUnavailableLocation())
            }
        } catch (e: Exception) {
            if (!hasDeliveredResult) {
                hasDeliveredResult = true
                timeoutHandler.removeCallbacks(timeoutRunnable)
                Log.e(TAG, "[ResQNet] Unexpected location error", e)
                fallbackToLastKnownLocation(onResult)
            }
        }
    }

    @SuppressLint("MissingPermission")
    private fun fallbackToLastKnownLocation(onResult: (LocationData) -> Unit) {
        try {
            fusedLocationClient.lastLocation.addOnSuccessListener { loc: Location? ->
                if (loc != null) {
                    val fallbackData = LocationData(
                        latitude = loc.latitude,
                        longitude = loc.longitude,
                        accuracy = loc.accuracy,
                        speedKmh = loc.speed * 3.6f,
                        timestamp = loc.time,
                        quality = LocationQuality.LAST_KNOWN,
                        isDegraded = true,
                        provider = "last_known_${loc.provider}"
                    )
                    lastKnownLocation = fallbackData
                    Log.d(TAG, "[ResQNet] Using Last Known GPS: (${fallbackData.latitude}, ${fallbackData.longitude})")
                    onResult(fallbackData)
                } else {
                    // Try system location manager
                    val best = systemLocationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                        ?: systemLocationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)

                    if (best != null) {
                        val data = LocationData(
                            latitude = best.latitude,
                            longitude = best.longitude,
                            accuracy = best.accuracy,
                            speedKmh = best.speed * 3.6f,
                            timestamp = best.time,
                            quality = LocationQuality.LAST_KNOWN,
                            isDegraded = true,
                            provider = "system_provider"
                        )
                        lastKnownLocation = data
                        onResult(data)
                    } else {
                        Log.w(TAG, "[ResQNet] GPS unavailable. Emergency reporting will continue with unavailable tag.")
                        onResult(lastKnownLocation ?: createUnavailableLocation())
                    }
                }
            }.addOnFailureListener {
                onResult(lastKnownLocation ?: createUnavailableLocation())
            }
        } catch (e: Exception) {
            Log.e(TAG, "[ResQNet] Fallback location exception", e)
            onResult(lastKnownLocation ?: createUnavailableLocation())
        }
    }

    private fun createUnavailableLocation(): LocationData {
        return LocationData(
            latitude = 0.0,
            longitude = 0.0,
            accuracy = 999.0f,
            speedKmh = 0.0f,
            timestamp = System.currentTimeMillis(),
            quality = LocationQuality.UNAVAILABLE,
            isDegraded = true,
            provider = "unavailable"
        )
    }
}
