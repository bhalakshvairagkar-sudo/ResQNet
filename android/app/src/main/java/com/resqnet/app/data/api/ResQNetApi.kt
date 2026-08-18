package com.resqnet.app.data.api

import com.google.gson.annotations.SerializedName
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

data class EmergencyPayload(
    @SerializedName("id") val id: String? = null,
    @SerializedName("title") val title: String,
    @SerializedName("latitude") val latitude: Double,
    @SerializedName("longitude") val longitude: Double,
    @SerializedName("sourceType") val sourceType: String = "smartphone",
    @SerializedName("gForce") val gForce: Float? = null,
    @SerializedName("speedKmh") val speedKmh: Float? = null,
    @SerializedName("speedDeltaKmh") val speedDeltaKmh: Float? = null,
    @SerializedName("rollover") val rollover: Boolean = false,
    @SerializedName("confidence") val confidence: Float = 0.94f,
    @SerializedName("severity") val severity: Int? = null,
    @SerializedName("userMedicalInfo") val userMedicalInfo: String? = "Blood: O+ | No Allergies"
)

data class IncidentResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("message") val message: String?,
    @SerializedName("incident") val incident: IncidentDto?
)

data class IncidentDto(
    @SerializedName("id") val id: String,
    @SerializedName("title") val title: String,
    @SerializedName("severity") val severity: Int,
    @SerializedName("confidence") val confidence: Float,
    @SerializedName("state") val state: String,
    @SerializedName("ambulanceId") val ambulanceId: String?,
    @SerializedName("ambulanceReason") val ambulanceReason: String?,
    @SerializedName("hospitalId") val hospitalId: String?,
    @SerializedName("hospitalReason") val hospitalReason: String?
)

data class HealthResponse(
    @SerializedName("status") val status: String,
    @SerializedName("service") val service: String
)

interface ResQNetApi {
    @POST("api/incidents/detect")
    suspend fun reportCrash(@Body payload: EmergencyPayload): Response<IncidentResponse>

    @GET("api/incidents/{id}")
    suspend fun getIncidentStatus(@Path("id") id: String): Response<IncidentResponse>

    @GET("api/health")
    suspend fun checkHealth(): Response<HealthResponse>
}

object ApiClient {
    private var baseUrl: String = "http://10.0.2.2:5000/" // Android Emulator localhost bridge or local IP

    fun setBaseUrl(url: String) {
        baseUrl = if (url.endsWith("/")) url else "$url/"
        retrofitInstance = null
    }

    private var retrofitInstance: Retrofit? = null

    val api: ResQNetApi
        get() {
            if (retrofitInstance == null) {
                retrofitInstance = Retrofit.Builder()
                    .baseUrl(baseUrl)
                    .addConverterFactory(GsonConverterFactory.create())
                    .build()
            }
            return retrofitInstance!!.create(ResQNetApi::class.java)
        }
}
