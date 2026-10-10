package com.resqnet.app.domain.model

/**
 * Explicit state machine for ResQNet Emergency Detection lifecycle.
 */
enum class EmergencyState {
    MONITORING,             // Normal continuous sensor sampling
    POSSIBLE_CRASH,         // Anomaly threshold crossed
    VERIFICATION_PENDING,   // 15-second "Are You OK?" countdown active
    USER_CONFIRMED_OK,      // User tapped "I'm OK" - cancelled
    TIMEOUT,                // 15 seconds elapsed with no user response
    EMERGENCY_TRIGGERED,    // Incident creation in progress
    SUBMISSION_PENDING,     // Incident queued/awaiting network transmission
    INCIDENT_SUBMITTED,     // Successfully ingested and confirmed by backend
    LOCATION_UNAVAILABLE,   // GPS failed (proceeds with degraded/last known location)
    NETWORK_UNAVAILABLE,    // Network offline (queued locally for retry)
    COOLDOWN                // Post-incident suppression window to prevent duplicates
}
