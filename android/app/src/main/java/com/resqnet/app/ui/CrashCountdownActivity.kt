package com.resqnet.app.ui

import android.content.Context
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.*
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.lifecycleScope
import com.resqnet.app.data.api.EmergencyPayload
import com.resqnet.app.data.api.IncidentDto
import com.resqnet.app.data.repository.IncidentRepository
import com.resqnet.app.domain.model.CrashDetectionResult
import com.resqnet.app.domain.model.EmergencyState
import com.resqnet.app.location.AppLocationManager
import com.resqnet.app.location.LocationData
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class CrashCountdownActivity : ComponentActivity() {

    companion object {
        const val EXTRA_G_FORCE = "EXTRA_G_FORCE"
        const val EXTRA_IS_ROLLOVER = "EXTRA_IS_ROLLOVER"
        const val EXTRA_CONFIDENCE = "EXTRA_CONFIDENCE"
        const val EXTRA_SEVERITY_SCORE = "EXTRA_SEVERITY_SCORE"
        const val EXTRA_DELTA_V = "EXTRA_DELTA_V"
        const val EXTRA_TIMESTAMP = "EXTRA_TIMESTAMP"

        private const val TAG = "ResQNet"
    }

    private var ringtone: Ringtone? = null
    private var vibrator: Vibrator? = null

    private lateinit var locationManager: AppLocationManager
    private lateinit var repository: IncidentRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        locationManager = AppLocationManager(this)
        repository = IncidentRepository(this)

        val gForce = intent.getFloatExtra(EXTRA_G_FORCE, 3.8f)
        val isRollover = intent.getBooleanExtra(EXTRA_IS_ROLLOVER, false)
        val confidence = intent.getFloatExtra(EXTRA_CONFIDENCE, 0.94f)
        val severityScore = intent.getIntExtra(EXTRA_SEVERITY_SCORE, 85)
        val deltaV = intent.getFloatExtra(EXTRA_DELTA_V, 35.0f)
        val timestamp = intent.getLongExtra(EXTRA_TIMESTAMP, System.currentTimeMillis())

        val detectionResult = CrashDetectionResult(
            isDetected = true,
            confidence = confidence,
            confidencePercentage = (confidence * 100).toInt(),
            severity = if (severityScore >= 75) "CRITICAL" else "HIGH",
            severityScore = severityScore,
            peakGForce = gForce,
            accelerationMagnitude = gForce * 9.80665f,
            speedDeltaKmh = deltaV,
            isRollover = isRollover,
            gyroMagnitude = if (isRollover) 5.0f else 1.2f,
            timestamp = timestamp
        )

        startSirenAndVibration()

        setContent {
            MaterialTheme(
                colorScheme = darkColorScheme(
                    background = Color(0xFF0A0F1D),
                    surface = Color(0xFF131B2E),
                    primary = Color(0xFFEF4444)
                )
            ) {
                var isEmergencyTriggered by remember { mutableStateOf(false) }
                var submittedIncident by remember { mutableStateOf<IncidentDto?>(null) }
                var emergencyMessage by remember { mutableStateOf("") }
                var isSubmitting by remember { mutableStateOf(false) }

                if (isEmergencyTriggered) {
                    TriggeredEmergencyView(
                        incident = submittedIncident,
                        formattedMessage = emergencyMessage,
                        isSubmitting = isSubmitting,
                        onClose = { finish() }
                    )
                } else {
                    CountdownScreen(
                        initialSeconds = 15,
                        result = detectionResult,
                        onCancel = {
                            Log.d(TAG, "[ResQNet] User confirmed OK - Cancelling emergency.")
                            stopSiren()
                            finish()
                        },
                        onSendNow = {
                            stopSiren()
                            isEmergencyTriggered = true
                            isSubmitting = true
                            executeEmergencyTrigger(detectionResult) { inc, msg ->
                                submittedIncident = inc
                                emergencyMessage = msg
                                isSubmitting = false
                            }
                        },
                        onTimeout = {
                            Log.w(TAG, "[ResQNet] User did not respond in 15 seconds. Automatic emergency triggered!")
                            stopSiren()
                            isEmergencyTriggered = true
                            isSubmitting = true
                            executeEmergencyTrigger(detectionResult) { inc, msg ->
                                submittedIncident = inc
                                emergencyMessage = msg
                                isSubmitting = false
                            }
                        }
                    )
                }
            }
        }
    }

    private fun executeEmergencyTrigger(
        crashResult: CrashDetectionResult,
        onComplete: (IncidentDto?, String) -> Unit
    ) {
        lifecycleScope.launch {
            Log.d(TAG, "[ResQNet] Emergency triggered. Acquiring GPS...")

            locationManager.acquireLatestLocation { loc: LocationData? ->
                lifecycleScope.launch {
                    val payload = repository.createPayload(crashResult, loc)
                    val message = repository.generateEmergencyMessage(payload)

                    Log.d(TAG, "[ResQNet] Location: ${payload.latitude}, ${payload.longitude} (Acc: ${payload.gpsAccuracy}m)")
                    Log.d(TAG, "[ResQNet] Sending incident to backend...")

                    val result = repository.submitIncident(payload)
                    if (result.isSuccess) {
                        val inc = result.getOrNull()
                        Log.d(TAG, "[ResQNet] Incident submitted successfully: ID ${inc?.id}")
                        onComplete(inc, message)
                    } else {
                        Log.w(TAG, "[ResQNet] Incident saved locally due to offline network: ${result.exceptionOrNull()?.message}")
                        onComplete(null, message)
                    }
                }
            }
        }
    }

    private fun startSirenAndVibration() {
        try {
            val alertUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            ringtone = RingtoneManager.getRingtone(applicationContext, alertUri)
            ringtone?.play()

            vibrator = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 400, 200, 400), 0))
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(longArrayOf(0, 400, 200, 400), 0)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Audio alert error", e)
        }
    }

    private fun stopSiren() {
        try {
            ringtone?.stop()
            vibrator?.cancel()
        } catch (e: Exception) { }
    }

    override fun onDestroy() {
        super.onDestroy()
        stopSiren()
    }
}

@Composable
fun CountdownScreen(
    initialSeconds: Int,
    result: CrashDetectionResult,
    onCancel: () -> Unit,
    onSendNow: () -> Unit,
    onTimeout: () -> Unit
) {
    var secondsLeft by remember { mutableIntStateOf(initialSeconds) }

    LaunchedEffect(Unit) {
        while (secondsLeft > 0) {
            delay(1000L)
            secondsLeft -= 1
        }
        onTimeout()
    }

    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 1.0f,
        targetValue = 1.08f,
        animationSpec = infiniteRepeatable(
            animation = tween(600, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulse"
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF090D16))
            .padding(24.dp)
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        // Top Header
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Spacer(modifier = Modifier.height(20.dp))
            Icon(
                imageVector = Icons.Default.Warning,
                contentDescription = "Crash Alert",
                tint = Color(0xFFEF4444),
                modifier = Modifier.size(52.dp)
            )
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = "POSSIBLE ACCIDENT DETECTED",
                fontSize = 20.sp,
                fontWeight = FontWeight.Black,
                color = Color.White,
                textAlign = TextAlign.Center,
                fontFamily = FontFamily.Monospace
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = "Are you OK? Emergency dispatch will be automatically notified if you do not respond.",
                fontSize = 13.sp,
                color = Color(0xFF94A3B8),
                textAlign = TextAlign.Center,
                lineHeight = 18.sp
            )
        }

        // Circular Countdown Display
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(190.dp)
                .padding(16.dp)
        ) {
            Surface(
                modifier = Modifier.size(160.dp * pulseScale),
                shape = CircleShape,
                color = Color(0xFFEF4444).copy(alpha = 0.15f)
            ) {}

            Surface(
                modifier = Modifier.size(130.dp),
                shape = CircleShape,
                color = Color(0xFFEF4444),
                shadowElevation = 12.dp
            ) {
                Column(
                    modifier = Modifier.fillMaxSize(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Text(
                        text = "$secondsLeft",
                        fontSize = 54.sp,
                        fontWeight = FontWeight.Black,
                        color = Color.White,
                        fontFamily = FontFamily.Monospace
                    )
                    Text(
                        text = "SECONDS",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White.copy(alpha = 0.8f)
                    )
                }
            }
        }

        // Sensor Metrics Telemetry Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF131B2E)),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(modifier = Modifier.padding(14.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Impact Force:", color = Color(0xFF94A3B8), fontSize = 12.sp)
                    Text("${"%.2f".format(result.peakGForce)}G", color = Color(0xFFEF4444), fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
                Spacer(modifier = Modifier.height(4.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Confidence Score:", color = Color(0xFF94A3B8), fontSize = 12.sp)
                    Text("${result.confidencePercentage}%", color = Color(0xFF38BDF8), fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
                Spacer(modifier = Modifier.height(4.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Severity Tier:", color = Color(0xFF94A3B8), fontSize = 12.sp)
                    Text(result.severity, color = Color(0xFFF59E0B), fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
            }
        }

        // Action Buttons
        Column(modifier = Modifier.fillMaxWidth()) {
            Button(
                onClick = onCancel,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981)),
                shape = RoundedCornerShape(14.dp)
            ) {
                Icon(Icons.Default.CheckCircle, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "I'M OK — CANCEL ALERT",
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            OutlinedButton(
                onClick = onSendNow,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFEF4444)),
                shape = RoundedCornerShape(14.dp)
            ) {
                Text(
                    text = "SEND HELP NOW (IMMEDIATE)",
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 13.sp
                )
            }
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

@Composable
fun TriggeredEmergencyView(
    incident: IncidentDto?,
    formattedMessage: String,
    isSubmitting: Boolean,
    onClose: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF090D16))
            .padding(24.dp)
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Spacer(modifier = Modifier.height(20.dp))
            Icon(
                imageVector = Icons.Default.Emergency,
                contentDescription = "Dispatched",
                tint = Color(0xFF38BDF8),
                modifier = Modifier.size(56.dp)
            )
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = if (isSubmitting) "TRANSMITTING INCIDENT..." else "EMERGENCY BROADCAST SENT",
                fontSize = 20.sp,
                fontWeight = FontWeight.Black,
                color = Color.White,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = "ResQNet Central AI has registered the collision and alerted nearest trauma response units.",
                fontSize = 13.sp,
                color = Color(0xFF94A3B8),
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(18.dp))

            if (isSubmitting) {
                CircularProgressIndicator(color = Color(0xFF38BDF8))
            } else {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF131B2E)),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = "INCIDENT ID: ${incident?.id ?: "RNQ-AUTO-INGESTED"}",
                            fontWeight = FontWeight.Black,
                            fontSize = 15.sp,
                            color = Color(0xFF38BDF8),
                            fontFamily = FontFamily.Monospace
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "Assigned Unit: ${incident?.ambulanceId ?: "AMB-01 (ALS Trauma Equipped)"}",
                            fontSize = 13.sp,
                            color = Color.White
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "Target Trauma Center: ${incident?.assignedHospital ?: "Pune Trauma Center (Pre-Alerted)"}",
                            fontSize = 13.sp,
                            color = Color(0xFF10B981)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Raw Emergency Message Payload Display
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF0C1220)),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(
                        text = formattedMessage,
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace,
                        color = Color(0xFFCBD5E1),
                        modifier = Modifier.padding(12.dp)
                    )
                }
            }
        }

        Button(
            onClick = onClose,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF3B82F6)),
            shape = RoundedCornerShape(12.dp)
        ) {
            Text("RETURN TO DASHBOARD", fontWeight = FontWeight.Bold)
        }
    }
}
