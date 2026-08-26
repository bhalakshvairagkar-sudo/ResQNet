package com.resqnet.app.domain.model

/**
 * Explicit lifecycle status for emergency incident submission and backend confirmation.
 */
enum class SubmissionStatus {
    CREATED,            // Initialized and safely persisted to local disk storage
    PENDING_SUBMISSION, // Awaiting initial network transmission
    SUBMITTING,         // Network request actively in-flight
    SUBMITTED,          // Network packet received by backend
    CONFIRMED,          // Backend verified, saved to MongoDB, and returned 201/200
    RETRY_REQUIRED,     // Network or server error encountered; queued for exponential retry
    FAILED              // Terminal failure after exceeding maximum retry attempts (10)
}

enum class LocationQuality {
    FRESH_GPS,          // Live high-accuracy satellite fix acquired within last 60s
    LAST_KNOWN,         // Cached previous location (degraded timestamp)
    UNAVAILABLE         // GPS hardware disabled or timed out; emergency continues safely
}
