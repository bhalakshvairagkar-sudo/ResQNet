package com.resqnet.app.ui

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.*
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.ComponentActivity
import com.resqnet.app.R
import com.resqnet.app.data.api.ApiClient

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

        val backButton = android.widget.TextView(this).apply {
            text = "← BACK"
            setTextColor(android.graphics.Color.parseColor("#38BDF8"))
            textSize = 13f
            setTypeface(null, android.graphics.Typeface.BOLD)
            setOnClickListener { finish() }
        }

        val titleView = android.widget.TextView(this).apply {
            text = "CITIZEN MEDICAL PORTAL"
            setTextColor(android.graphics.Color.WHITE)
            textSize = 14f
            setTypeface(android.graphics.Typeface.MONOSPACE, android.graphics.Typeface.BOLD)
            val params = android.widget.RelativeLayout.LayoutParams(
                android.widget.RelativeLayout.LayoutParams.WRAP_CONTENT,
                android.widget.RelativeLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                addRule(android.widget.RelativeLayout.CENTER_IN_PARENT)
            }
            layoutParams = params
        }

        val refreshButton = android.widget.TextView(this).apply {
            text = "RELOAD ⟳"
            setTextColor(android.graphics.Color.parseColor("#94A3B8"))
            textSize = 13f
            setTypeface(null, android.graphics.Typeface.BOLD)
            val params = android.widget.RelativeLayout.LayoutParams(
                android.widget.RelativeLayout.LayoutParams.WRAP_CONTENT,
                android.widget.RelativeLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                addRule(android.widget.RelativeLayout.ALIGN_PARENT_END)
            }
            layoutParams = params
            setOnClickListener { webView.reload() }
        }

        header.addView(backButton)
        header.addView(titleView)
        header.addView(refreshButton)

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
    }
}
