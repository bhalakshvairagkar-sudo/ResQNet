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
    val emergencyPhone: String?,
    val allergies: String?,
    val chronicConditions: String?,
    val medications: String?,
    val specialNotes: String?,
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
    private const val KEY_EMERGENCY_PHONE = "key_emergency_phone"
    private const val KEY_ALLERGIES = "key_allergies"
    private const val KEY_CONDITIONS = "key_conditions"
    private const val KEY_MEDICATIONS = "key_medications"
    private const val KEY_SPECIAL_NOTES = "key_special_notes"

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
        emergencyContact: String? = null,
        emergencyPhone: String? = null,
        allergies: String? = null,
        chronicConditions: String? = null,
        medications: String? = null,
        specialNotes: String? = null
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
            .putString(KEY_EMERGENCY_PHONE, emergencyPhone)
            .putString(KEY_ALLERGIES, allergies)
            .putString(KEY_CONDITIONS, chronicConditions)
            .putString(KEY_MEDICATIONS, medications)
            .putString(KEY_SPECIAL_NOTES, specialNotes)
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
            emergencyPhone = p.getString(KEY_EMERGENCY_PHONE, null),
            allergies = p.getString(KEY_ALLERGIES, null),
            chronicConditions = p.getString(KEY_CONDITIONS, null),
            medications = p.getString(KEY_MEDICATIONS, null),
            specialNotes = p.getString(KEY_SPECIAL_NOTES, null),
            isOnboarded = p.getBoolean(KEY_ONBOARDING_COMPLETED, false)
        )
    }

    fun getMedicalSummary(context: Context): String {
        val s = getSessionData(context)
        val sb = StringBuilder()
        sb.append("Patient: ").append(s.fullName ?: s.username ?: "Unknown Citizen")
        if (!s.bloodGroup.isNullOrBlank()) sb.append(" | Blood: ").append(s.bloodGroup)
        if (!s.emergencyContact.isNullOrBlank()) sb.append(" | ICE: ").append(s.emergencyContact)
        if (!s.emergencyPhone.isNullOrBlank()) sb.append(" (").append(s.emergencyPhone).append(")")
        if (!s.allergies.isNullOrBlank()) sb.append(" | Allergies: ").append(s.allergies)
        if (!s.chronicConditions.isNullOrBlank()) sb.append(" | Conditions: ").append(s.chronicConditions)
        return sb.toString()
    }

    fun clearSession(context: Context) {
        getPrefs(context).edit().clear().apply()
    }
}
