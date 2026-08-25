package com.resqnet.app.location

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Looper
import android.util.Log
import com.google.android.gms.location.*

data class LocationData(
    val latitude: Double,
    val longitude: Double,
    val accuracy: Float,
    val speedKmh: Float,
    val timestamp: Long = System.currentTimeMillis(),
    val isFresh: Boolean = true,
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
    }

    /**
     * Attempts to obtain fresh high-accuracy GPS coordinates.
     * Falls back to last known location if fresh fix fails within timeout.
     */
    @SuppressLint("MissingPermission")
    fun acquireLatestLocation(onResult: (LocationData?) -> Unit) {
        Log.d(TAG, "[ResQNet] Acquiring GPS location...")

        try {
            fusedLocationClient.getCurrentLocation(
                Priority.PRIORITY_HIGH_ACCURACY,
                null
            ).addOnSuccessListener { loc: Location? ->
                if (loc != null) {
                    val freshData = LocationData(
                        latitude = loc.latitude,
                        longitude = loc.longitude,
                        accuracy = loc.accuracy,
                        speedKmh = loc.speed * 3.6f,
                        timestamp = loc.time,
                        isFresh = (System.currentTimeMillis() - loc.time) < FRESH_LOCATION_MAX_AGE_MS,
                        isDegraded = false,
                        provider = loc.provider ?: "fused"
                    )
                    lastKnownLocation = freshData
                    Log.d(TAG, "[ResQNet] GPS Acquired: (${freshData.latitude}, ${freshData.longitude}) ±${freshData.accuracy}m")
                    onResult(freshData)
                } else {
                    fallbackToLastKnownLocation(onResult)
                }
            }.addOnFailureListener { e ->
                Log.w(TAG, "[ResQNet] FusedLocation error, attempting fallback", e)
                fallbackToLastKnownLocation(onResult)
            }
        } catch (e: SecurityException) {
            Log.e(TAG, "[ResQNet] Location permission missing", e)
            onResult(null)
        } catch (e: Exception) {
            Log.e(TAG, "[ResQNet] Unexpected location error", e)
            fallbackToLastKnownLocation(onResult)
        }
    }

    @SuppressLint("MissingPermission")
    private fun fallbackToLastKnownLocation(onResult: (LocationData?) -> Unit) {
        try {
            fusedLocationClient.lastLocation.addOnSuccessListener { loc: Location? ->
                if (loc != null) {
                    val fallbackData = LocationData(
                        latitude = loc.latitude,
                        longitude = loc.longitude,
                        accuracy = loc.accuracy,
                        speedKmh = loc.speed * 3.6f,
                        timestamp = loc.time,
                        isFresh = false,
                        isDegraded = true,
                        provider = "last_known_${loc.provider}"
                    )
                    lastKnownLocation = fallbackData
                    Log.d(TAG, "[ResQNet] Using Last Known GPS: (${fallbackData.latitude}, ${fallbackData.longitude})")
                    onResult(fallbackData)
                } else {
                    // Try system location manager as last resort
                    val gpsLoc = systemLocationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                    val netLoc = systemLocationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
                    val best = gpsLoc ?: netLoc

                    if (best != null) {
                        val data = LocationData(
                            latitude = best.latitude,
                            longitude = best.longitude,
                            accuracy = best.accuracy,
                            speedKmh = best.speed * 3.6f,
                            timestamp = best.time,
                            isFresh = false,
                            isDegraded = true,
                            provider = "system_provider"
                        )
                        lastKnownLocation = data
                        onResult(data)
                    } else {
                        Log.w(TAG, "[ResQNet] Location completely unavailable on device")
                        onResult(lastKnownLocation)
                    }
                }
            }.addOnFailureListener {
                onResult(lastKnownLocation)
            }
        } catch (e: Exception) {
            Log.e(TAG, "[ResQNet] Fallback location exception", e)
            onResult(lastKnownLocation)
        }
    }
}
