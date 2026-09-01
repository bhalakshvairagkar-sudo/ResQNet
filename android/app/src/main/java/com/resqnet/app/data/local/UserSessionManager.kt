package com.resqnet.app.data.local

import android.content.Context
import android.content.SharedPreferences

data class UserSessionData(
    val token: String?,
    val username: String?,
    val role: String?,
    val fullName: String?,
    val phone: String?,
    val bloodGroup: String?,
    val emergencyContact: String?,
    val isOnboarded: Boolean
)

object UserSessionManager {

    private const val PREF_NAME = "resqnet_user_session_v1"
    private const val KEY_ONBOARDING_COMPLETED = "key_onboarding_completed"
    private const val KEY_AUTH_TOKEN = "key_auth_token"
    private const val KEY_USERNAME = "key_username"
    private const val KEY_ROLE = "key_role"
    private const val KEY_FULL_NAME = "key_full_name"
    private const val KEY_PHONE = "key_phone"
    private const val KEY_BLOOD_GROUP = "key_blood_group"
    private const val KEY_EMERGENCY_CONTACT = "key_emergency_contact"

    private fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    }

    fun isOnboardingCompleted(context: Context): Boolean {
        return getPrefs(context).getBoolean(KEY_ONBOARDING_COMPLETED, false)
    }

    fun setOnboardingCompleted(context: Context, completed: Boolean) {
        getPrefs(context).edit().putBoolean(KEY_ONBOARDING_COMPLETED, completed).apply()
    }

    fun saveUserSession(
        context: Context,
        token: String,
        username: String,
        role: String = "USER",
        fullName: String? = null,
        phone: String? = null,
        bloodGroup: String? = null,
        emergencyContact: String? = null
    ) {
        getPrefs(context).edit()
            .putBoolean(KEY_ONBOARDING_COMPLETED, true)
            .putString(KEY_AUTH_TOKEN, token)
            .putString(KEY_USERNAME, username)
            .putString(KEY_ROLE, role)
            .putString(KEY_FULL_NAME, fullName)
            .putString(KEY_PHONE, phone)
            .putString(KEY_BLOOD_GROUP, bloodGroup)
            .putString(KEY_EMERGENCY_CONTACT, emergencyContact)
            .apply()
    }

    fun getAuthToken(context: Context): String? {
        return getPrefs(context).getString(KEY_AUTH_TOKEN, null)
    }

    fun getSessionData(context: Context): UserSessionData {
        val p = getPrefs(context)
        return UserSessionData(
            token = p.getString(KEY_AUTH_TOKEN, null),
            username = p.getString(KEY_USERNAME, null),
            role = p.getString(KEY_ROLE, "USER"),
            fullName = p.getString(KEY_FULL_NAME, null),
            phone = p.getString(KEY_PHONE, null),
            bloodGroup = p.getString(KEY_BLOOD_GROUP, null),
            emergencyContact = p.getString(KEY_EMERGENCY_CONTACT, null),
            isOnboarded = p.getBoolean(KEY_ONBOARDING_COMPLETED, false)
        )
    }

    fun clearSession(context: Context) {
        getPrefs(context).edit().clear().apply()
    }
}
