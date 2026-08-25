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
import java.util.concurrent.TimeUnit

data class EmergencyPayload(
    @SerializedName("id") val id: String? = null,
    @SerializedName("incidentId") val incidentId: String? = null,
    @SerializedName("deviceId") val deviceId: String? = null,
    @SerializedName("userId") val userId: String? = null,
    @SerializedName("eventType") val eventType: String = "ACCIDENT",
    @SerializedName("source") val source: String = "smartphone",
    @SerializedName("sourceType") val sourceType: String = "smartphone",
    @SerializedName("title") val title: String = "Smartphone Crash Triggered",
    @SerializedName("latitude") val latitude: Double,
    @SerializedName("longitude") val longitude: Double,
    @SerializedName("gpsAccuracy") val gpsAccuracy: Float? = null,
    @SerializedName("gForce") val gForce: Float? = null,
    @SerializedName("speedKmh") val speedKmh: Float? = null,
    @SerializedName("speedDeltaKmh") val speedDeltaKmh: Float? = null,
    @SerializedName("rollover") val rollover: Boolean = false,
    @SerializedName("confidence") val confidence: Float = 0.94f,
    @SerializedName("severity") val severity: Int? = null,
    @SerializedName("status") val status: String = "DETECTED",
    @SerializedName("userMedicalInfo") val userMedicalInfo: String? = "Blood: O+ | No Allergies",
    @SerializedName("timestamp") val timestamp: String? = null
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

interface ResQNetApi {
    @POST("api/incidents/detect")
    suspend fun reportCrash(@Body payload: EmergencyPayload): Response<IncidentResponse>

    @POST("api/emergencies")
    suspend fun reportEmergency(@Body payload: EmergencyPayload): Response<IncidentResponse>

    @GET("api/incidents/{id}")
    suspend fun getIncidentStatus(@Path("id") id: String): Response<IncidentResponse>

    @GET("api/health")
    suspend fun checkHealth(): Response<HealthResponse>
}

object ApiClient {
    private var baseUrl: String = "http://192.168.1.11:5000/" // Host LAN IP (or 10.0.2.2 for Emulator)

    fun setBaseUrl(url: String) {
        baseUrl = if (url.endsWith("/")) url else "$url/"
        retrofitInstance = null
    }

    fun getBaseUrl(): String = baseUrl

    private var retrofitInstance: Retrofit? = null

    val api: ResQNetApi
        get() {
            if (retrofitInstance == null) {
                val logging = HttpLoggingInterceptor().apply {
                    level = HttpLoggingInterceptor.Level.BODY
                }

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
