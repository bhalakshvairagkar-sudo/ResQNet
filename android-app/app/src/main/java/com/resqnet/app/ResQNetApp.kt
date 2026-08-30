package com.resqnet.app

import android.app.Application
import android.util.Log

class ResQNetApp : Application() {

    companion object {
        private const val TAG = "ResQNetApp"
        lateinit var instance: ResQNetApp
            private set
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        Log.d(TAG, "[ResQNet] Application Initialized")
    }
}
