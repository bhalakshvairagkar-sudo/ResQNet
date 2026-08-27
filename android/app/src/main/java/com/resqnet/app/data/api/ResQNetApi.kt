package com.resqnet.app.data.api

import com.google.gson.annotations.SerializedName
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
import retrofit2.http.PATCH
import java.util.concurrent.TimeUnit
import com.resqnet.app.BuildConfig

data class EmergencyPayload(
    @SerializedName("id") val id: String? = null,
    @SerializedName("incidentId") val incidentId: String? = null,
    @SerializedName("deviceId") val deviceId: String? = null,
    @SerializedName("userId") val userId: String? = null,
    @SerializedName("eventType") val eventType: String = "ACCIDENT",
    @SerializedName("source") val source: String = "smartphone",
    @SerializedName("sourceType") val sourceType: String = "smartphone",
    @SerializedName("title") val title: String = "Smartphone Crash Triggered",
    @SerializedName("latitude") val latitude: Double? = null,
    @SerializedName("longitude") val longitude: Double? = null,
    @SerializedName("gpsAccuracy") val gpsAccuracy: Float? = null,
    @SerializedName("locationQuality") val locationQuality: String? = null,
    @SerializedName("gForce") val gForce: Float? = null,
    @SerializedName("speedKmh") val speedKmh: Float? = null,
    @SerializedName("speedDeltaKmh") val speedDeltaKmh: Float? = null,
    @SerializedName("speedAvailable") val speedAvailable: Boolean = false,
    @SerializedName("rollover") val rollover: Boolean = false,
    @SerializedName("confidence") val confidence: Float? = null,
    @SerializedName("severity") val severity: Int? = null,
    @SerializedName("status") val status: String = "DETECTED",
    @SerializedName("userMedicalInfo") val userMedicalInfo: String? = null,
    @SerializedName("timestamp") val timestamp: String? = null,
    @SerializedName("isDemo") val isDemo: Boolean = false
)

data class IncidentResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("message") val message: String?,
    @SerializedName("incidentId") val incidentId: String?,
    @SerializedName("status") val status: String?,
    @SerializedName("confidence") val confidence: Float?,
    @SerializedName("severity") val severity: Int?,
    @SerializedName("incident") val incident: IncidentDto?
)

data class IncidentDto(
    @SerializedName("id") val id: String,
    @SerializedName("incidentId") val incidentId: String?,
    @SerializedName("title") val title: String?,
    @SerializedName("severity") val severity: Int?,
    @SerializedName("confidence") val confidence: Float?,
    @SerializedName("status") val status: String?,
    @SerializedName("state") val state: String?,
    @SerializedName("ambulanceId") val ambulanceId: String?,
    @SerializedName("ambulanceCode") val ambulanceCode: String?,
    @SerializedName("ambulanceReason") val ambulanceReason: String?,
    @SerializedName("hospitalId") val hospitalId: String?,
    @SerializedName("assignedHospital") val assignedHospital: String?,
    @SerializedName("hospitalReason") val hospitalReason: String?
)

data class HealthResponse(
    @SerializedName("status") val status: String,
    @SerializedName("backend") val backend: String?,
    @SerializedName("database") val database: String?,
    @SerializedName("ai") val ai: String?,
    @SerializedName("routing") val routing: String?
)

data class LoginRequest(val username: String, val password: String)
data class SessionUser(val username: String, val role: String, val resourceId: String? = null)
data class LoginResponse(val token: String, val user: SessionUser)
data class EmergencyAlertDto(
    val id: String, val incidentId: String, val recipientType: String, val recipientId: String,
    val priority: String? = null, val severity: Int? = null, val helpMessage: String? = null,
    val accidentLatitude: Double? = null, val accidentLongitude: Double? = null, val mapUrl: String? = null,
    val distanceKm: Double? = null, val etaMinutes: Int? = null, val incomingAmbulance: String? = null,
    val patientCount: Any? = null, val createdAt: String? = null, val status: String? = null
)
data class AmbulanceDto(val id: String, val code: String? = null, val status: String? = null, val lat: Double? = null, val lng: Double? = null, val currentIncidentId: String? = null)
data class HospitalDto(val id: String, val name: String? = null, val status: String? = null, val traumaLevel: Int? = null, val emergencyCapacity: Int? = null, val lat: Double? = null, val lng: Double? = null)

interface ResQNetApi {
    @POST("api/auth/login")
    suspend fun login(@Body request: LoginRequest): Response<LoginResponse>

    @GET("api/incidents/alerts/pending")
    suspend fun getPendingAlerts(@Header("Authorization") authorization: String): Response<List<EmergencyAlertDto>>

    @POST("api/incidents/{id}/accept")
    suspend fun acceptDispatch(@Path("id") id: String, @Header("Authorization") authorization: String): Response<IncidentResponse>

    @POST("api/incidents/{id}/reject")
    suspend fun rejectDispatch(@Path("id") id: String, @Header("Authorization") authorization: String, @Body body: Map<String, String>): Response<IncidentResponse>

    @POST("api/incidents/{id}/hospital-ack")
    suspend fun acknowledgeHospitalAlert(@Path("id") id: String, @Header("Authorization") authorization: String): Response<IncidentResponse>

    @GET("api/ambulances/{id}")
    suspend fun getAmbulance(@Path("id") id: String, @Header("Authorization") authorization: String): Response<AmbulanceDto>

    @GET("api/hospitals/{id}")
    suspend fun getHospital(@Path("id") id: String, @Header("Authorization") authorization: String): Response<HospitalDto>
    @POST("api/incidents/detect")
    suspend fun reportCrash(@Body payload: EmergencyPayload): Response<IncidentResponse>

    @POST("api/emergencies")
    suspend fun reportEmergency(@Body payload: EmergencyPayload): Response<IncidentResponse>

    @GET("api/incidents/{id}")
    suspend fun getIncidentStatus(@Path("id") id: String): Response<IncidentResponse>

    @GET("api/health")
    suspend fun checkHealth(): Response<HealthResponse>
}

enum class AppEnvironment(val defaultUrl: String) {
    LOCAL_LAN(BuildConfig.DEFAULT_BACKEND_URL),
    EMULATOR(BuildConfig.DEFAULT_BACKEND_URL),
    // The shared deployed service is used in every build mode. Keeping these
    // values identical prevents a user from accidentally selecting a demo URL
    // that does not exist and silently switching the field app offline.
    STAGING(BuildConfig.DEFAULT_BACKEND_URL),
    PRODUCTION(BuildConfig.DEFAULT_BACKEND_URL)
}

object ApiClient {
    private var currentEnvironment: AppEnvironment = AppEnvironment.LOCAL_LAN
    private var baseUrl: String = currentEnvironment.defaultUrl

    fun setEnvironment(env: AppEnvironment) {
        currentEnvironment = env
        baseUrl = env.defaultUrl
        retrofitInstance = null
    }

    fun getEnvironment(): AppEnvironment = currentEnvironment

    fun setBaseUrl(url: String) {
        baseUrl = if (url.endsWith("/")) url else "$url/"
        retrofitInstance = null
    }

    fun getBaseUrl(): String = baseUrl

    private var retrofitInstance: Retrofit? = null

    val api: ResQNetApi
        get() {
            if (retrofitInstance == null) {
                val logging = HttpLoggingInterceptor().apply { level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC else HttpLoggingInterceptor.Level.NONE }

                val client = OkHttpClient.Builder()
                    .connectTimeout(6, TimeUnit.SECONDS)
                    .readTimeout(10, TimeUnit.SECONDS)
                    .writeTimeout(10, TimeUnit.SECONDS)
                    .addInterceptor(logging)
                    .retryOnConnectionFailure(true)
                    .build()

                retrofitInstance = Retrofit.Builder()
                    .baseUrl(baseUrl)
                    .client(client)
                    .addConverterFactory(GsonConverterFactory.create())
                    .build()
            }
            return retrofitInstance!!.create(ResQNetApi::class.java)
        }
}
