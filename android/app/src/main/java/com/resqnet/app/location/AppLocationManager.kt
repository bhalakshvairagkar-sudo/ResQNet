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
    val latitude: Double?,
    val longitude: Double?,
    val accuracy: Float?,
    val speedKmh: Float?,
    val isSpeedAvailable: Boolean = false,
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
     * Attempts to acquire fresh high-accuracy GPS coordinates within a 5-second bounded window.
     * Falls back to last known location or marks UNAVAILABLE without ever blocking the emergency pipeline or fabricating coordinates.
     */
    @SuppressLint("MissingPermission")
    fun acquireLatestLocation(onResult: (LocationData) -> Unit) {
        Log.d(TAG, "[GPS] Acquiring GPS location with 5s bounded timeout...")

        var hasDeliveredResult = false
        val timeoutHandler = Handler(Looper.getMainLooper())

        val timeoutRunnable = Runnable {
            if (!hasDeliveredResult) {
                hasDeliveredResult = true
                Log.w(TAG, "[GPS] Fresh GPS timed out after 5s. Falling back to last known fix.")
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
                        val hasSpeed = loc.hasSpeed()
                        val speedKmh = if (hasSpeed) loc.speed * 3.6f else null

                        val freshData = LocationData(
                            latitude = loc.latitude,
                            longitude = loc.longitude,
                            accuracy = if (loc.hasAccuracy()) loc.accuracy else null,
                            speedKmh = speedKmh,
                            isSpeedAvailable = hasSpeed,
                            timestamp = loc.time,
                            quality = LocationQuality.FRESH_GPS,
                            isDegraded = false,
                            provider = loc.provider ?: "fused_gps"
                        )
                        lastKnownLocation = freshData
                        Log.d(TAG, "[GPS] Fresh GPS Acquired: (${freshData.latitude}, ${freshData.longitude}) ±${freshData.accuracy}m | Speed: ${if (hasSpeed) "${"%.1f".format(speedKmh)} km/h" else "Unavailable"}")
                        onResult(freshData)
                    } else {
                        fallbackToLastKnownLocation(onResult)
                    }
                }
            }.addOnFailureListener { e ->
                if (!hasDeliveredResult) {
                    hasDeliveredResult = true
                    timeoutHandler.removeCallbacks(timeoutRunnable)
                    Log.w(TAG, "[GPS] FusedLocation failure, checking last known cache", e)
                    fallbackToLastKnownLocation(onResult)
                }
            }
        } catch (e: SecurityException) {
            if (!hasDeliveredResult) {
                hasDeliveredResult = true
                timeoutHandler.removeCallbacks(timeoutRunnable)
                Log.e(TAG, "[GPS] Location permission denied. Proceeding with location unavailable.", e)
                onResult(createUnavailableLocation())
            }
        } catch (e: Exception) {
            if (!hasDeliveredResult) {
                hasDeliveredResult = true
                timeoutHandler.removeCallbacks(timeoutRunnable)
                Log.e(TAG, "[GPS] Unexpected location error", e)
                fallbackToLastKnownLocation(onResult)
            }
        }
    }

    @SuppressLint("MissingPermission")
    private fun fallbackToLastKnownLocation(onResult: (LocationData) -> Unit) {
        try {
            fusedLocationClient.lastLocation.addOnSuccessListener { loc: Location? ->
                if (loc != null) {
                    val hasSpeed = loc.hasSpeed()
                    val speedKmh = if (hasSpeed) loc.speed * 3.6f else null

                    val fallbackData = LocationData(
                        latitude = loc.latitude,
                        longitude = loc.longitude,
                        accuracy = if (loc.hasAccuracy()) loc.accuracy else null,
                        speedKmh = speedKmh,
                        isSpeedAvailable = hasSpeed,
                        timestamp = loc.time,
                        quality = LocationQuality.LAST_KNOWN,
                        isDegraded = true,
                        provider = "last_known_${loc.provider}"
                    )
                    lastKnownLocation = fallbackData
                    Log.d(TAG, "[GPS] Using Last Known GPS Fix: (${fallbackData.latitude}, ${fallbackData.longitude}) ±${fallbackData.accuracy}m")
                    onResult(fallbackData)
                } else {
                    // Try system location manager
                    val best = systemLocationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                        ?: systemLocationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)

                    if (best != null) {
                        val hasSpeed = best.hasSpeed()
                        val speedKmh = if (hasSpeed) best.speed * 3.6f else null

                        val data = LocationData(
                            latitude = best.latitude,
                            longitude = best.longitude,
                            accuracy = if (best.hasAccuracy()) best.accuracy else null,
                            speedKmh = speedKmh,
                            isSpeedAvailable = hasSpeed,
                            timestamp = best.time,
                            quality = LocationQuality.LAST_KNOWN,
                            isDegraded = true,
                            provider = "system_provider"
                        )
                        lastKnownLocation = data
                        onResult(data)
                    } else {
                        Log.w(TAG, "[GPS] GPS completely unavailable. Continuing emergency submission with UNAVAILABLE quality.")
                        onResult(lastKnownLocation ?: createUnavailableLocation())
                    }
                }
            }.addOnFailureListener {
                onResult(lastKnownLocation ?: createUnavailableLocation())
            }
        } catch (e: Exception) {
            Log.e(TAG, "[GPS] Fallback location exception", e)
            onResult(lastKnownLocation ?: createUnavailableLocation())
        }
    }

    private fun createUnavailableLocation(): LocationData {
        return LocationData(
            latitude = null,
            longitude = null,
            accuracy = null,
            speedKmh = null,
            isSpeedAvailable = false,
            timestamp = System.currentTimeMillis(),
            quality = LocationQuality.UNAVAILABLE,
            isDegraded = true,
            provider = "unavailable"
        )
    }
}
