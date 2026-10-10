package com.resqnet.app.ui

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import com.resqnet.app.data.api.ApiClient
import com.resqnet.app.data.local.UserSessionManager

/**
 * Entry router activity.
 * - New user (1st launch): Opens Citizen Registration & Medical Details Form (Image 2).
 * - Returning user: Opens the main sensor & crash detection interface (Image 1).
 */
class SplashActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }
}
