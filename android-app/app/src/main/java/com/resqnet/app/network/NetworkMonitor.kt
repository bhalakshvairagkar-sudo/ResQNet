package com.resqnet.app.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Build
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Real-time Android network connectivity observer.
 * Monitors Wi-Fi and Mobile Data transitions and verifies active internet.
 */
class NetworkMonitor(private val context: Context) {

    private val connectivityManager =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    private val _isOnline = MutableStateFlow(checkCurrentConnectivity())
    val isOnline: StateFlow<Boolean> = _isOnline.asStateFlow()

    private var onNetworkRestoredCallback: (() -> Unit)? = null

    companion object {
        private const val TAG = "ResQNet_Network"

        @Volatile
        private var instance: NetworkMonitor? = null

        fun getInstance(context: Context): NetworkMonitor {
            return instance ?: synchronized(this) {
                instance ?: NetworkMonitor(context.applicationContext).also { instance = it }
            }
        }
    }

    init {
        registerNetworkCallback()
    }

    fun setOnline(online: Boolean) {
        if (_isOnline.value != online) {
            _isOnline.value = online
            if (online) {
                onNetworkRestoredCallback?.invoke()
            }
        }
    }

    fun setOnNetworkRestoredListener(callback: () -> Unit) {
        this.onNetworkRestoredCallback = callback
    }

    private fun registerNetworkCallback() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                connectivityManager.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
                    override fun onAvailable(network: Network) {
                        Log.d(TAG, "[ResQNet] Default network available (Online)")
                        setOnline(true)
                    }

                    override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
                        val hasInternet = networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                        if (hasInternet) {
                            setOnline(true)
                        }
                    }

                    override fun onLost(network: Network) {
                        Log.w(TAG, "[ResQNet] Network connection lost")
                        _isOnline.value = checkCurrentConnectivity()
                    }

                    override fun onUnavailable() {
                        Log.w(TAG, "[ResQNet] Network unavailable")
                        _isOnline.value = checkCurrentConnectivity()
                    }
                })
            } else {
                val request = android.net.NetworkRequest.Builder()
                    .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    .build()
                connectivityManager.registerNetworkCallback(request, object : ConnectivityManager.NetworkCallback() {
                    override fun onAvailable(network: Network) {
                        setOnline(true)
                    }
                    override fun onLost(network: Network) {
                        _isOnline.value = checkCurrentConnectivity()
                    }
                })
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register network callback: ${e.message}")
            _isOnline.value = checkCurrentConnectivity()
        }
    }

    fun checkCurrentConnectivity(): Boolean {
        return try {
            val activeNetwork = connectivityManager.activeNetwork ?: return false
            val capabilities = connectivityManager.getNetworkCapabilities(activeNetwork) ?: return false
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        } catch (e: Exception) {
            false
        }
    }
}
