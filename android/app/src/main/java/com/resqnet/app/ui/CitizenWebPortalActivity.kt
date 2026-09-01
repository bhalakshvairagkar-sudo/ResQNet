package com.resqnet.app.ui

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.*
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.ComponentActivity
import com.resqnet.app.data.api.ApiClient
import com.resqnet.app.data.local.UserSessionManager

class CitizenWebPortalActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Programmatic tactical dark container layout
        val rootLayout = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setBackgroundColor(android.graphics.Color.parseColor("#060911"))
            layoutParams = android.view.ViewGroup.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        // Top Tactical Action Header
        val header = android.widget.RelativeLayout(this).apply {
            setBackgroundColor(android.graphics.Color.parseColor("#0B1220"))
            setPadding(24, 28, 24, 28)
            layoutParams = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        val logoTitle = android.widget.TextView(this).apply {
            text = "RESQNET AI"
            setTextColor(android.graphics.Color.WHITE)
            textSize = 14f
            setTypeface(android.graphics.Typeface.MONOSPACE, android.graphics.Typeface.BOLD)
        }

        val actionButton = android.widget.TextView(this).apply {
            text = "ENTER APP →"
            setTextColor(android.graphics.Color.parseColor("#38BDF8"))
            textSize = 12f
            setTypeface(null, android.graphics.Typeface.BOLD)
            val params = android.widget.RelativeLayout.LayoutParams(
                android.widget.RelativeLayout.LayoutParams.WRAP_CONTENT,
                android.widget.RelativeLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                addRule(android.widget.RelativeLayout.ALIGN_PARENT_END)
            }
            layoutParams = params
            setOnClickListener {
                UserSessionManager.setOnboardingCompleted(this@CitizenWebPortalActivity, true)
                startActivity(Intent(this@CitizenWebPortalActivity, MainActivity::class.java))
                finish()
            }
        }

        header.addView(logoTitle)
        header.addView(actionButton)

        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progress = 0
            visibility = View.VISIBLE
            layoutParams = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                8
            )
        }

        webView = WebView(this).apply {
            layoutParams = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(android.graphics.Color.parseColor("#060911"))
        }

        rootLayout.addView(header)
        rootLayout.addView(progressBar)
        rootLayout.addView(webView)

        setContentView(rootLayout)

        configureWebView()
        loadPortalUrl()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.setGeolocationEnabled(true)
        settings.loadWithOverviewMode = true
        settings.useWideViewPort = true
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        // Attach Android Native Bridge for auto registration & login sync
        webView.addJavascriptInterface(AndroidWebAppBridge(), "AndroidBridge")

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progressBar.progress = newProgress
                if (newProgress >= 100) {
                    progressBar.visibility = View.GONE
                } else {
                    progressBar.visibility = View.VISIBLE
                }
            }

            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: GeolocationPermissions.Callback?
            ) {
                callback?.invoke(origin, true, false)
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: return false
                // Intercept any redirection to sos.html or dashboard and open the native MainActivity (Image 1) instead!
                if (url.contains("sos.html") || url.contains("dashboard.html")) {
                    UserSessionManager.setOnboardingCompleted(this@CitizenWebPortalActivity, true)
                    startActivity(Intent(this@CitizenWebPortalActivity, MainActivity::class.java))
                    finish()
                    return true
                }
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    return false
                }
                return try {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                    startActivity(intent)
                    true
                } catch (e: Exception) {
                    true
                }
            }
        }
    }

    private fun loadPortalUrl() {
        val customUrl = intent.getStringExtra(EXTRA_URL)
        val targetUrl = customUrl ?: ApiClient.getBaseUrl()
        webView.loadUrl(targetUrl)
    }

    inner class AndroidWebAppBridge {
        @JavascriptInterface
        fun onAccountRegistered(
            token: String,
            username: String,
            role: String,
            fullName: String?,
            phone: String?,
            bloodGroup: String?,
            emergencyContact: String?
        ) {
            runOnUiThread {
                UserSessionManager.saveUserSession(
                    this@CitizenWebPortalActivity,
                    token = token,
                    username = username,
                    role = role,
                    fullName = fullName,
                    phone = phone,
                    bloodGroup = bloodGroup,
                    emergencyContact = emergencyContact
                )
                Toast.makeText(this@CitizenWebPortalActivity, "✓ Account Created & Medical Vault Active!", Toast.LENGTH_LONG).show()
                startActivity(Intent(this@CitizenWebPortalActivity, MainActivity::class.java))
                finish()
            }
        }

        @JavascriptInterface
        fun onUserSignedIn(
            token: String,
            username: String,
            role: String,
            fullName: String?,
            phone: String?
        ) {
            runOnUiThread {
                UserSessionManager.saveUserSession(
                    this@CitizenWebPortalActivity,
                    token = token,
                    username = username,
                    role = role,
                    fullName = fullName,
                    phone = phone
                )
                Toast.makeText(this@CitizenWebPortalActivity, "✓ Welcome back, $username", Toast.LENGTH_SHORT).show()
                startActivity(Intent(this@CitizenWebPortalActivity, MainActivity::class.java))
                finish()
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    companion object {
        const val EXTRA_URL = "extra_target_url"
        const val EXTRA_IS_FIRST_LAUNCH = "extra_is_first_launch"
    }
}
