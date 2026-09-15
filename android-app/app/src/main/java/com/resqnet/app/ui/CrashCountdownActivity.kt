package com.resqnet.app.ui

import android.app.KeyguardManager
import android.content.Context
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.*
import android.util.Log
import android.view.WindowManager
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
import com.resqnet.app.data.local.LocalIncidentRecord
import com.resqnet.app.data.repository.IncidentRepository
import com.resqnet.app.domain.model.CrashDetectionResult
import com.resqnet.app.domain.model.SubmissionStatus
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

    // Retained state for configuration changes
    private var isTriggeredState = mutableStateOf(false)
    private var currentRecordState = mutableStateOf<LocalIncidentRecord?>(null)
    private var submissionStatusState = mutableStateOf(SubmissionStatus.CREATED)
    private var emergencyMessageState = mutableStateOf("")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Wake screen up and show over lockscreen if crash happens while screen is off
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
            keyguardManager?.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }

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
                val isTriggered by isTriggeredState
                val record by currentRecordState
                val status by submissionStatusState
                val message by emergencyMessageState

                if (isTriggered) {
                    ReliableEmergencyStatusView(
                        record = record,
                        status = status,
                        formattedMessage = message,
                        onClose = { finish() }
                    )
                } else {
                    CountdownScreen(
                        initialSeconds = 15,
                        result = detectionResult,
                        onCancel = {
                            Log.d(TAG, "[ResQNet] User confirmed OK - Cancelling alert.")
                            stopSiren()
                            finish()
                        },
                        onSendNow = {
                            stopSiren()
                            isTriggeredState.value = true
                            executeReliableEmergencyTrigger(detectionResult)
                        },
                        onTimeout = {
                            Log.w(TAG, "[ResQNet] User did not respond in 15 seconds. Automatic emergency triggered!")
                            stopSiren()
                            isTriggeredState.value = true
                            executeReliableEmergencyTrigger(detectionResult)
                        }
                    )
                }
            }
        }
    }

    private fun executeReliableEmergencyTrigger(crashResult: CrashDetectionResult) {
        lifecycleScope.launch {
            Log.d(TAG, "[ResQNet] Emergency triggered. Step 1: Acquiring GPS with bounded timeout...")

            locationManager.acquireLatestLocation { loc: LocationData ->
                lifecycleScope.launch {
                    Log.d(TAG, "[ResQNet] Step 2: Saving incident locally FIRST to disk...")
                    val record = repository.createAndSaveLocalIncident(crashResult, loc)
                    currentRecordState.value = record
                    emergencyMessageState.value = repository.generateEmergencyMessage(record)
                    submissionStatusState.value = SubmissionStatus.PENDING_SUBMISSION

                    Log.d(TAG, "[ResQNet] Step 3: Submitting incident ${record.incidentId} to backend...")
                    repository.submitIncidentReliably(record) { updatedStatus, updatedRecord ->
                        submissionStatusState.value = updatedStatus
                        currentRecordState.value = updatedRecord
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
            secondsLeft--
        }
        onTimeout()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF080C16))
            .padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Spacer(modifier = Modifier.height(20.dp))
            Text(
                text = "CRASH DETECTED",
                fontSize = 24.sp,
                fontWeight = FontWeight.Black,
                color = Color(0xFFEF4444),
                letterSpacing = 1.5.sp
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = "ARE YOU OKAY?",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )

            Spacer(modifier = Modifier.height(24.dp))

            // Animated Countdown Circle
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier.size(160.dp)
            ) {
                CircularProgressIndicator(
                    progress = { secondsLeft.toFloat() / initialSeconds.toFloat() },
                    modifier = Modifier.fillMaxSize(),
                    color = Color(0xFFEF4444),
                    strokeWidth = 10.dp,
                    trackColor = Color(0xFF1E293B)
                )
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
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
                        color = Color(0xFF94A3B8)
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Detection Metrics Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF0F172A)),
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(
                        text = "IMPACT TELEMETRY",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF38BDF8),
                        fontFamily = FontFamily.Monospace
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Peak G-Force: ${"%.2f".format(result.peakGForce)}G", color = Color.White, fontSize = 12.sp)
                        Text("Rollover: ${if (result.isRollover) "YES" else "NO"}", color = Color.White, fontSize = 12.sp)
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Confidence: ${(result.confidence * 100).toInt()}%", color = Color(0xFF10B981), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        Text("Severity: ${result.severity} (${result.severityScore}/100)", color = Color(0xFFEF4444), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
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
                Icon(Icons.Default.Check, contentDescription = null, tint = Color.White)
                Spacer(modifier = Modifier.width(8.dp))
                Text("I'M OK — CANCEL ALERT", fontSize = 15.sp, fontWeight = FontWeight.Black, color = Color.White)
            }

            Spacer(modifier = Modifier.height(10.dp))

            OutlinedButton(
                onClick = onSendNow,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFEF4444))
            ) {
                Icon(Icons.Default.Send, contentDescription = null)
                Spacer(modifier = Modifier.width(6.dp))
                Text("SEND EMERGENCY SOS NOW", fontWeight = FontWeight.Bold, fontSize = 13.sp)
            }
            Spacer(modifier = Modifier.height(12.dp))
        }
    }
}

@Composable
fun ReliableEmergencyStatusView(
    record: LocalIncidentRecord?,
    status: SubmissionStatus,
    formattedMessage: String,
    onClose: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF090D16))
            .padding(20.dp)
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Spacer(modifier = Modifier.height(16.dp))

            val (icon, tint, title, subtitle) = when (status) {
                SubmissionStatus.CONFIRMED -> Quadruple(
                    Icons.Default.CheckCircle,
                    Color(0xFF10B981),
                    "EMERGENCY CONFIRMED",
                    "ResQNet Central AI has registered the collision and alerted nearest trauma response units."
                )
                SubmissionStatus.SUBMITTING, SubmissionStatus.PENDING_SUBMISSION, SubmissionStatus.CREATED -> Quadruple(
                    Icons.Default.CloudUpload,
                    Color(0xFF38BDF8),
                    "TRANSMITTING INCIDENT...",
                    "Emergency saved locally on device. Establishing connection to ResQNet Dispatch..."
                )
                SubmissionStatus.RETRY_REQUIRED -> Quadruple(
                    Icons.Default.CloudOff,
                    Color(0xFFF59E0B),
                    "NETWORK UNAVAILABLE — SAVED LOCALLY",
                    "Your emergency is safely stored on this device. ResQNet will automatically retry when connectivity returns."
                )
                SubmissionStatus.FAILED -> Quadruple(
                    Icons.Default.Error,
                    Color(0xFFEF4444),
                    "LOCAL EMERGENCY PRESERVED",
                    "Maximum retries reached. Emergency record preserved in device secure store."
                )
                else -> Quadruple(
                    Icons.Default.Emergency,
                    Color(0xFF38BDF8),
                    "EMERGENCY IN PROGRESS",
                    "Processing emergency response..."
                )
            }

            Icon(
                imageVector = icon,
                contentDescription = title,
                tint = tint,
                modifier = Modifier.size(54.dp)
            )
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = title,
                fontSize = 18.sp,
                fontWeight = FontWeight.Black,
                color = Color.White,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = subtitle,
                fontSize = 12.sp,
                color = Color(0xFF94A3B8),
                textAlign = TextAlign.Center,
                lineHeight = 16.sp
            )

            Spacer(modifier = Modifier.height(16.dp))

            if (status == SubmissionStatus.SUBMITTING || status == SubmissionStatus.PENDING_SUBMISSION) {
                LinearProgressIndicator(
                    modifier = Modifier.fillMaxWidth().height(4.dp),
                    color = Color(0xFF38BDF8),
                    trackColor = Color(0xFF1E293B)
                )
                Spacer(modifier = Modifier.height(16.dp))
            }

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
                        Text(
                            text = "INCIDENT ID: ${record?.incidentId ?: "RNQ-PENDING"}",
                            fontWeight = FontWeight.Black,
                            fontSize = 13.sp,
                            color = Color(0xFF38BDF8),
                            fontFamily = FontFamily.Monospace
                        )
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = tint.copy(alpha = 0.2f)
                        ) {
                            Text(
                                text = status.name,
                                color = tint,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    if (record?.assignedAmbulance != null) {
                        Text(
                            text = "Assigned Unit: ${record.assignedAmbulance}",
                            fontSize = 13.sp,
                            color = Color.White,
                            fontWeight = FontWeight.SemiBold
                        )
                    }

                    if (record?.assignedHospital != null) {
                        Text(
                            text = "Target Trauma Center: ${record.assignedHospital}",
                            fontSize = 13.sp,
                            color = Color(0xFF10B981),
                            fontWeight = FontWeight.SemiBold
                        )
                    }

                    if (record?.retryCount ?: 0 > 0) {
                        Text(
                            text = "Retry Attempts: ${record?.retryCount} (Auto-backoff active)",
                            fontSize = 11.sp,
                            color = Color(0xFFF59E0B)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

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

        Spacer(modifier = Modifier.height(16.dp))

        Button(
            onClick = onClose,
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF3B82F6)),
            shape = RoundedCornerShape(12.dp)
        ) {
            Text("RETURN TO DASHBOARD", fontWeight = FontWeight.Bold)
        }
    }
}

data class Quadruple<A, B, C, D>(val first: A, val second: B, val third: C, val fourth: D)
