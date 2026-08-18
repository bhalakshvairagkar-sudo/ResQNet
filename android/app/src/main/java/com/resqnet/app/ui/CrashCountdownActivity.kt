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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Warning
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
import com.resqnet.app.data.api.ApiClient
import com.resqnet.app.data.api.EmergencyPayload
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class CrashCountdownActivity : ComponentActivity() {

    private var ringtone: Ringtone? = null
    private var vibrator: Vibrator? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val gForce = intent.getFloatExtra("EXTRA_G_FORCE", 4.2f)
        val isRollover = intent.getBooleanExtra("EXTRA_IS_ROLLOVER", false)

        startSirenAndVibration()

        setContent {
            MaterialTheme {
                CountdownScreen(
                    initialSeconds = 15,
                    gForce = gForce,
                    isRollover = isRollover,
                    onCancel = {
                        stopSiren()
                        finish()
                    },
                    onTransmitNow = {
                        stopSiren()
                        transmitEmergency(gForce, isRollover)
                    },
                    onTimeout = {
                        stopSiren()
                        transmitEmergency(gForce, isRollover)
                    }
                )
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
                vibrator?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 500, 200, 500), 0))
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(longArrayOf(0, 500, 200, 500), 0)
            }
        } catch (e: Exception) {
            Log.e("CrashCountdown", "Audio alert error", e)
        }
    }

    private fun stopSiren() {
        ringtone?.stop()
        vibrator?.cancel()
    }

    private fun transmitEmergency(gForce: Float, isRollover: Boolean) {
        lifecycleScope.launch {
            try {
                // Approximate Pune Demo coordinates (or fetch from FusedLocationClient in production)
                val payload = EmergencyPayload(
                    title = if (isRollover) "Severe Vehicle Rollover Crash (Android Sensor)" else "High-Impact Collision Detected (Android Sensor)",
                    latitude = 18.5204 + (Math.random() - 0.5) * 0.03,
                    longitude = 73.8567 + (Math.random() - 0.5) * 0.03,
                    sourceType = "smartphone",
                    gForce = gForce,
                    speedDeltaKmh = 45f,
                    rollover = isRollover,
                    confidence = 0.96f
                )

                val response = ApiClient.api.reportCrash(payload)
                if (response.isSuccessful) {
                    Log.i("CrashCountdown", "🚨 Emergency transmitted to ResQNet Hub: ${response.body()?.incident?.id}")
                }
            } catch (e: Exception) {
                Log.e("CrashCountdown", "Failed to transmit emergency payload", e)
            } finally {
                finish()
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        stopSiren()
    }
}

@Composable
fun CountdownScreen(
    initialSeconds: Int,
    gForce: Float,
    isRollover: Boolean,
    onCancel: () -> Unit,
    onTransmitNow: () -> Unit,
    onTimeout: () -> Unit
) {
    var secondsRemaining by remember { mutableIntStateOf(initialSeconds) }

    LaunchedEffect(key1 = true) {
        while (secondsRemaining > 0) {
            delay(1000L)
            secondsRemaining--
        }
        onTimeout()
    }

    val pulseScale by rememberInfiniteTransition(label = "pulse").animateFloat(
        initialValue = 0.95f,
        targetValue = 1.05f,
        animationSpec = infiniteRepeatable(
            animation = tween(600, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "scale"
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0F172A))
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier.fillMaxHeight()
        ) {
            // Header Tag
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(top = 16.dp)) {
                Surface(
                    color = Color(0x33EF4444),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(
                        text = "🚨 IMPACT DETECTED [${String.format("%.1f", gForce)}G]",
                        color = Color(0xFFEF4444),
                        fontWeight = FontWeight.Bold,
                        fontSize = 12.sp,
                        fontFamily = FontFamily.Monospace,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "ARE YOU OKAY?",
                    color = Color.White,
                    fontSize = 26.sp,
                    fontWeight = FontWeight.Black
                )
                Text(
                    text = "ResQNet will automatically dispatch nearest ALS trauma ambulance if you don't respond.",
                    color = Color(0xFF94A3B8),
                    fontSize = 13.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)
                )
            }

            // Big Pulsing Countdown Timer Circle
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .size((160 * pulseScale).dp)
                    .background(Color(0xFF1E293B), CircleShape)
            ) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .size(130.dp)
                        .background(Color(0xFFDC2626), CircleShape)
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = "$secondsRemaining",
                            color = Color.White,
                            fontSize = 48.sp,
                            fontWeight = FontWeight.Black,
                            fontFamily = FontFamily.Monospace
                        )
                        Text(
                            text = "SECONDS",
                            color = Color(0xFFFFCDD2),
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                }
            }

            // Action Buttons
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // False Alarm Button
                Button(
                    onClick = onCancel,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981)),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp)
                ) {
                    Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color.White)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "I'M OK - FALSE ALARM",
                        color = Color.White,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                // Immediate Dispatch Button
                Button(
                    onClick = onTransmitNow,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444)),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp)
                ) {
                    Icon(Icons.Default.Warning, contentDescription = null, tint = Color.White)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "DISPATCH AMBULANCE NOW",
                        color = Color.White,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}
