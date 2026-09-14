package com.resqnet.app.data.api

import com.google.gson.annotations.SerializedName
import com.resqnet.app.BuildConfig
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Header
import java.util.concurrent.TimeUnit

// ============================================================
// EMERGENCY PAYLOAD
// ============================================================

data class EmergencyPayload(

    @SerializedName("id")
    val id: String? = null,

    @SerializedName("incidentId")
    val incidentId: String? = null,

    @SerializedName("deviceId")
    val deviceId: String? = null,

    @SerializedName("userId")
    val userId: String? = null,

    @SerializedName("eventType")
    val eventType: String = "ACCIDENT",

    @SerializedName("source")
    val source: String = "smartphone",

    @SerializedName("sourceType")
    val sourceType: String = "smartphone",

    @SerializedName("title")
    val title: String = "Smartphone Crash Triggered",

    @SerializedName("latitude")
    val latitude: Double? = null,

    @SerializedName("longitude")
    val longitude: Double? = null,

    @SerializedName("gpsAccuracy")
    val gpsAccuracy: Float? = null,

    @SerializedName("locationQuality")
    val locationQuality: String? = null,

    @SerializedName("gForce")
    val gForce: Float? = null,

    @SerializedName("speedKmh")
    val speedKmh: Float? = null,

    @SerializedName("speedDeltaKmh")
    val speedDeltaKmh: Float? = null,

    @SerializedName("speedAvailable")
    val speedAvailable: Boolean = false,

    @SerializedName("rollover")
    val rollover: Boolean = false,

    @SerializedName("confidence")
    val confidence: Float? = null,

    @SerializedName("severity")
    val severity: Int? = null,

    @SerializedName("status")
    val status: String = "DETECTED",

    @SerializedName("userMedicalInfo")
    val userMedicalInfo: String? = null,

    @SerializedName("timestamp")
    val timestamp: String? = null,

    @SerializedName("isDemo")
    val isDemo: Boolean = false
)


// ============================================================
// DISPATCH UPDATE PAYLOAD
// ============================================================

data class DispatchUpdatePayload(

    @SerializedName("id")
    val id: String,

    @SerializedName("step")
    val step: String,

    @SerializedName("statusMsg")
    val statusMsg: String,

    @SerializedName("ambulanceLat")
    val ambulanceLat: Double,

    @SerializedName("ambulanceLng")
    val ambulanceLng: Double
)


// ============================================================
// INCIDENT RESPONSE
// ============================================================

data class IncidentResponse(

    @SerializedName("success")
    val success: Boolean = false,

    @SerializedName("message")
    val message: String? = null,

    @SerializedName("incidentId")
    val incidentId: String? = null,

    @SerializedName("status")
    val status: String? = null,

    @SerializedName("confidence")
    val confidence: Float? = null,

    @SerializedName("severity")
    val severity: Int? = null,

    @SerializedName("ambulance")
    val assignedAmbulance: String? = null,

    @SerializedName("hospital")
    val assignedHospital: String? = null,

    @SerializedName("incident")
    val incident: IncidentDto? = null
)


// ============================================================
// INCIDENT DTO
// ============================================================

data class IncidentDto(

    @SerializedName("id")
    val id: String,

    @SerializedName("incidentId")
    val incidentId: String? = null,

    @SerializedName("title")
    val title: String? = null,

    @SerializedName("severity")
    val severity: Int? = null,

    @SerializedName("confidence")
    val confidence: Float? = null,

    @SerializedName("status")
    val status: String? = null,

    @SerializedName("state")
    val state: String? = null,

    @SerializedName("ambulanceId")
    val ambulanceId: String? = null,

    @SerializedName("assignedAmbulance")
    val assignedAmbulance: String? = null,

    @SerializedName("ambulanceCode")
    val ambulanceCode: String? = null,

    @SerializedName("ambulanceReason")
    val ambulanceReason: String? = null,

    @SerializedName("hospitalId")
    val hospitalId: String? = null,

    @SerializedName("assignedHospital")
    val assignedHospital: String? = null,

    @SerializedName("hospitalReason")
    val hospitalReason: String? = null
)


// ============================================================
// HEALTH
// ============================================================

data class HealthResponse(

    @SerializedName("status")
    val status: String,

    @SerializedName("backend")
    val backend: String? = null,

    @SerializedName("database")
    val database: String? = null,

    @SerializedName("ai")
    val ai: String? = null,

    @SerializedName("routing")
    val routing: String? = null
)


// ============================================================
// AUTH
// ============================================================

data class LoginRequest(
    val username: String,
    val password: String
)

data class SessionUser(
    val username: String,
    val role: String,
    val resourceId: String? = null
)

data class LoginResponse(
    val token: String,
    val user: SessionUser
)


// ============================================================
// EMERGENCY ALERT
// ============================================================

data class EmergencyAlertDto(
    val id: String,
    val incidentId: String,
    val recipientType: String? = null,
    val recipientId: String? = null,
    val priority: String? = null,
    val severity: Int? = null,
    val confidence: Float? = null,
    val accidentType: String? = null,
    val accidentTime: String? = null,
    val helpMessage: String? = null,
    val accidentLatitude: Double? = null,
    val accidentLongitude: Double? = null,
    val locationQuality: String? = null,
    val gpsAccuracy: Float? = null,
    val gForce: Float? = null,
    val speedDeltaKmh: Float? = null,
    val rollover: Boolean? = null,
    val patientMedicalInfo: String? = null,
    val patientProfile: PatientProfileDto? = null,
    val mapUrl: String? = null,
    val hospitalMapUrl: String? = null,
    val distanceKm: Double? = null,
    val etaMinutes: Int? = null,
    val incomingAmbulance: String? = null,
    val destinationHospital: String? = null,
    val assignedHospital: String? = null,
    val hospitalLatitude: Double? = null,
    val hospitalLongitude: Double? = null,
    val hospitalAddress: String? = null,
    val hospitalPhone: String? = null,
    val hospitalTraumaLevel: Int? = null,
    val patientCount: Any? = null,
    val status: String? = null,
    val accepted: Boolean? = null,
    val acknowledged: Boolean? = null
)

data class PatientProfileDto(
    val fullName: String? = null,
    val age: Int? = null,
    val dateOfBirth: String? = null,
    val gender: String? = null,
    val bloodGroup: String? = null,
    val allergies: List<String>? = null,
    val chronicConditions: List<String>? = null,
    val currentMedications: String? = null,
    val primaryContact: EmergencyContactDto? = null,
    val organDonor: Boolean? = null,
    val specialNotes: String? = null
)

data class EmergencyContactDto(
    val name: String? = null,
    val phone: String? = null,
    val relation: String? = null
)


// ============================================================
// AMBULANCE
// ============================================================

data class AmbulanceDto(

    val id: String,

    val code: String? = null,

    val status: String? = null,

    val lat: Double? = null,

    val lng: Double? = null,

    val currentIncidentId: String? = null
)


// ============================================================
// HOSPITAL
// ============================================================

data class HospitalDto(

    val id: String,

    val name: String? = null,

    val status: String? = null,

    val traumaLevel: Int? = null,

    val emergencyCapacity: Int? = null,

    val address: String? = null,

    val phone: String? = null,

    val relevance: String? = null,

    val lat: Double? = null,

    val lng: Double? = null
)


// ============================================================
// API INTERFACE
// ============================================================

interface ResQNetApi {

    // ---------------- AUTH ----------------

    @POST("api/auth/login")
    suspend fun login(
        @Body request: LoginRequest
    ): Response<LoginResponse>


    // ---------------- EMERGENCY ALERTS ----------------

    @GET("api/incidents/alerts/pending")
    suspend fun getPendingAlerts(
        @Header("Authorization") authorization: String
    ): Response<List<EmergencyAlertDto>>


    // ---------------- DISPATCH ----------------

    @POST("api/incidents/{id}/accept")
    suspend fun acceptDispatch(
        @Path("id") id: String,
        @Header("Authorization") authorization: String
    ): Response<IncidentResponse>


    @POST("api/incidents/{id}/reject")
    suspend fun rejectDispatch(
        @Path("id") id: String,
        @Header("Authorization") authorization: String,
        @Body body: Map<String, String>
    ): Response<IncidentResponse>


    // ---------------- HOSPITAL ----------------

    @POST("api/incidents/{id}/hospital-ack")
    suspend fun acknowledgeHospitalAlert(
        @Path("id") id: String,
        @Header("Authorization") authorization: String
    ): Response<IncidentResponse>


    // ---------------- AMBULANCE ----------------

    @GET("api/ambulances/{id}")
    suspend fun getAmbulance(
        @Path("id") id: String,
        @Header("Authorization") authorization: String
    ): Response<AmbulanceDto>


    // ---------------- HOSPITAL DETAILS ----------------

    @GET("api/hospitals/{id}")
    suspend fun getHospital(
        @Path("id") id: String,
        @Header("Authorization") authorization: String
    ): Response<HospitalDto>


    // ---------------- USER INCIDENTS ----------------

    @GET("api/incidents/mine")
    suspend fun getMyIncidents(
        @Header("Authorization") authorization: String
    ): Response<List<IncidentDto>>


    // ========================================================
    // CRITICAL RESQNET EMERGENCY ENDPOINT
    // ========================================================

    @POST("api/incidents/detect")
    suspend fun reportCrash(
        @Body payload: EmergencyPayload
    ): Response<IncidentResponse>


    // ---------------- GENERAL EMERGENCY ----------------

    @POST("api/emergencies")
    suspend fun reportEmergency(
        @Body payload: EmergencyPayload
    ): Response<IncidentResponse>


    // ---------------- INCIDENT STATUS ----------------

    @GET("api/incidents/{id}")
    suspend fun getIncidentStatus(
        @Path("id") id: String
    ): Response<IncidentResponse>


    // ---------------- HEALTH ----------------

    @GET("api/health")
    suspend fun checkHealth(): Response<HealthResponse>


    // ---------------- DISPATCH UPDATE ----------------

    @POST("api/dispatch-update")
    suspend fun updateDispatchStatus(
        @Body payload: DispatchUpdatePayload
    ): Response<IncidentResponse>
}


// ============================================================
// ENVIRONMENTS
// ============================================================

enum class AppEnvironment(
    val defaultUrl: String
) {

    LOCAL_LAN(
        "https://resqnet-backend-pyqc.onrender.com/"
    ),

    EMULATOR(
        "https://resqnet-backend-pyqc.onrender.com/"
    ),

    STAGING(
        "https://staging-api.resqnet.io/"
    ),

    PRODUCTION(
        "https://resqnet-backend-pyqc.onrender.com/"
    )
}


// ============================================================
// API CLIENT
// ============================================================

object ApiClient {

    private const val TAG = "ResQNet_API"

    private var currentEnvironment =
        AppEnvironment.PRODUCTION

    private var baseUrl =
        currentEnvironment.defaultUrl

    private var retrofitInstance: Retrofit? = null


    // ========================================================
    // CHANGE ENVIRONMENT
    // ========================================================

    fun setEnvironment(
        env: AppEnvironment
    ) {
        currentEnvironment = env
        baseUrl = env.defaultUrl
        retrofitInstance = null

        android.util.Log.d(
            TAG,
            "Environment changed to: $env"
        )

        android.util.Log.d(
            TAG,
            "Base URL: $baseUrl"
        )
    }


    fun getEnvironment(): AppEnvironment =
        currentEnvironment


    // ========================================================
    // CUSTOM BASE URL
    // ========================================================

    fun setBaseUrl(
        url: String
    ) {

        baseUrl =
            if (url.endsWith("/")) {
                url
            } else {
                "$url/"
            }

        retrofitInstance = null

        android.util.Log.d(
            TAG,
            "Base URL changed to: $baseUrl"
        )
    }


    fun getBaseUrl(): String =
        baseUrl


    // ========================================================
    // RETROFIT API
    // ========================================================

    val api: ResQNetApi
        get() {

            if (retrofitInstance == null) {

                // ------------------------------------------------
                // HTTP LOGGER
                // ------------------------------------------------

                val loggingInterceptor =
                    HttpLoggingInterceptor { message ->

                        android.util.Log.d(
                            TAG,
                            message
                        )

                    }.apply {

                        level =
                            HttpLoggingInterceptor.Level.BODY
                    }


                // ------------------------------------------------
                // NETWORK CLIENT
                // ------------------------------------------------

                val client =
                    OkHttpClient.Builder()

                        .connectTimeout(
                            60,
                            TimeUnit.SECONDS
                        )

                        .readTimeout(
                            60,
                            TimeUnit.SECONDS
                        )

                        .writeTimeout(
                            60,
                            TimeUnit.SECONDS
                        )

                        .retryOnConnectionFailure(
                            true
                        )

                        // ----------------------------------------
                        // LOG REQUEST / RESPONSE
                        // ----------------------------------------

                        .addInterceptor { chain ->

                            val request =
                                chain.request()

                            android.util.Log.d(
                                TAG,
                                "========================================"
                            )

                            android.util.Log.d(
                                TAG,
                                "REQUEST"
                            )

                            android.util.Log.d(
                                TAG,
                                "${request.method} ${request.url}"
                            )

                            android.util.Log.d(
                                TAG,
                                "========================================"
                            )

                            try {

                                val response =
                                    chain.proceed(request)

                                android.util.Log.d(
                                    TAG,
                                    "========================================"
                                )

                                android.util.Log.d(
                                    TAG,
                                    "RESPONSE"
                                )

                                android.util.Log.d(
                                    TAG,
                                    "HTTP ${response.code}"
                                )

                                android.util.Log.d(
                                    TAG,
                                    response.message
                                )

                                android.util.Log.d(
                                    TAG,
                                    "${request.method} ${request.url}"
                                )

                                android.util.Log.d(
                                    TAG,
                                    "========================================"
                                )

                                response

                            } catch (e: Exception) {

                                android.util.Log.e(
                                    TAG,
                                    "========================================"
                                )

                                android.util.Log.e(
                                    TAG,
                                    "NETWORK FAILURE"
                                )

                                android.util.Log.e(
                                    TAG,
                                    "${e.javaClass.simpleName}: ${e.message}",
                                    e
                                )

                                android.util.Log.e(
                                    TAG,
                                    "========================================"
                                )

                                throw e
                            }
                        }

                        // ----------------------------------------
                        // API KEY & AUTHENTICATION
                        // ----------------------------------------

                        .addInterceptor { chain ->

                            val original =
                                chain.request()

                            val apiKey =
                                BuildConfig.RESQNET_API_KEY

                            val requestBuilder =
                                original.newBuilder()

                            if (
                                apiKey.isNotBlank()
                            ) {

                                requestBuilder.header(
                                    "Authorization",
                                    "Bearer $apiKey"
                                )

                                requestBuilder.header(
                                    "X-API-Key",
                                    apiKey
                                )

                                android.util.Log.d(
                                    TAG,
                                    "Authorization Bearer and X-API-Key attached to request"
                                )

                            } else {

                                android.util.Log.w(
                                    TAG,
                                    "RESQNET_API_KEY is empty"
                                )
                            }

                            chain.proceed(
                                requestBuilder.build()
                            )
                        }

                        // ----------------------------------------
                        // BODY LOGGER
                        // ----------------------------------------

                        .addInterceptor(
                            loggingInterceptor
                        )

                        .build()


                // ------------------------------------------------
                // RETROFIT
                // ------------------------------------------------

                android.util.Log.d(
                    TAG,
                    "Creating Retrofit"
                )

                android.util.Log.d(
                    TAG,
                    "Base URL: $baseUrl"
                )

                retrofitInstance =
                    Retrofit.Builder()

                        .baseUrl(
                            baseUrl
                        )

                        .client(
                            client
                        )

                        .addConverterFactory(
                            GsonConverterFactory.create()
                        )

                        .build()
            }

            return retrofitInstance!!
                .create(
                    ResQNetApi::class.java
                )
        }
}