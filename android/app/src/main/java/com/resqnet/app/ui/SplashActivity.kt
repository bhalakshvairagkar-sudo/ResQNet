package com.resqnet.app.ui

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
<<<<<<< HEAD
import com.resqnet.app.data.api.ApiClient
=======
>>>>>>> c65c78488f66982f29ff94d058197b528026acc0
import com.resqnet.app.data.local.UserSessionManager

/**
 * Entry router activity.
 * - New user (1st launch): Opens Citizen Registration & Medical Details Form (Image 2).
 * - Returning user: Opens the main sensor & crash detection interface (Image 1).
 */
class SplashActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (!UserSessionManager.isOnboardingCompleted(this)) {
            // First time launch: show Registration & Medical Form
<<<<<<< HEAD
            val intent = Intent(this, CitizenWebPortalActivity::class.java).apply {
                putExtra(CitizenWebPortalActivity.EXTRA_URL, "${ApiClient.getBaseUrl()}login.html?mode=register")
                putExtra(CitizenWebPortalActivity.EXTRA_IS_FIRST_LAUNCH, true)
            }
=======
            val intent = Intent(this, CitizenWebPortalActivity::class.java)
>>>>>>> c65c78488f66982f29ff94d058197b528026acc0
            startActivity(intent)
        } else {
            // Returning user: show original main interface (Image 1)
            val intent = Intent(this, MainActivity::class.java)
            startActivity(intent)
        }

        finish()
    }
}
