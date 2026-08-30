package com.example.resqnet

import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CircleNotifications
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.resqnet.ui.theme.ResQColors
import com.example.resqnet.ui.theme.ResQNetTheme
import kotlinx.coroutines.delay
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody

class CrashConfirmationActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }

        setContent {
            ResQNetTheme {
                CrashConfirmationScreen(
                    onSafe = { finish() },
                    onEscalate = {
                        val incidentId = "RQN-${(1000..9999).random()}"
                        escalateEmergency(incidentId)
                        startActivity(
                            Intent(this, DispatchTrackingActivity::class.java).apply {
                                putExtra("emergencyType", "Road Accident")
                                putExtra("incidentId", incidentId)
                            }
                        )
                        finish()
                    }
                )
            }
        }
    }

    private fun escalateEmergency(id: String) {
        Thread {
            try {
                val client = okhttp3.OkHttpClient()
                val json = """
                    {
                      "id": "$id",
                      "latitude": ${AppState.lastLatitude},
                      "longitude": ${AppState.lastLongitude},
                      "accelMagnitude": ${AppState.currentGForce.floatValue * 9.81f},
                      "source": "Smartphone",
                      "type": "Road Accident",
                      "severity": "CRITICAL"
                    }
                """.trimIndent()
                val body = json.toRequestBody("application/json".toMediaType())
                val request = okhttp3.Request.Builder()
                    .url("http://192.168.1.15:5000/api/crash-detection")
                    .post(body)
                    .build()
                client.newCall(request).execute()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }.start()
    }
}

@Composable
fun CrashConfirmationScreen(onSafe: () -> Unit, onEscalate: () -> Unit) {
    var secondsLeft by remember { mutableIntStateOf(30) }
    val totalSeconds = 30

    LaunchedEffect(Unit) {
        while (secondsLeft > 0) {
            delay(1000)
            secondsLeft--
        }
        onEscalate()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(Color(0xFF2A0A0A), ResQColors.Dark, Color.Black)
                )
            )
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Spacer(modifier = Modifier.height(24.dp))
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(ResQColors.Red.copy(alpha = 0.2f))
                    .border(1.dp, ResQColors.Red.copy(alpha = 0.5f), RoundedCornerShape(50))
                    .padding(horizontal = 14.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Filled.CircleNotifications, contentDescription = null, tint = ResQColors.Red, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("HIGH CONFIDENCE CRASH", color = ResQColors.Red, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold)
            }
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                "CRASH DETECTED!",
                color = Color.White,
                fontSize = 26.sp,
                fontWeight = FontWeight.Black,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                "Are you safe? Emergency response will be automatically dispatched if unconfirmed.",
                color = ResQColors.TextSecondary,
                fontSize = 13.sp,
                textAlign = TextAlign.Center
            )
        }

        CountdownRing(secondsLeft = secondsLeft, totalSeconds = totalSeconds)

        Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(
                onClick = onSafe,
                modifier = Modifier.fillMaxWidth().height(54.dp),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(containerColor = ResQColors.Green)
            ) {
                Text("I'M SAFE", fontWeight = FontWeight.Black, fontSize = 15.sp)
            }
            OutlinedButton(
                onClick = onEscalate,
                modifier = Modifier.fillMaxWidth().height(54.dp),
                shape = RoundedCornerShape(16.dp)
            ) {
                Text("SEND HELP NOW", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }
        }
    }
}

@Composable
fun CountdownRing(secondsLeft: Int, totalSeconds: Int) {
    Box(
        modifier = Modifier.size(180.dp),
        contentAlignment = Alignment.Center
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val strokeWidth = 12.dp.toPx()
            drawArc(
                color = ResQColors.Border,
                startAngle = -90f,
                sweepAngle = 360f,
                useCenter = false,
                style = Stroke(width = strokeWidth, cap = StrokeCap.Round),
                size = Size(size.width - strokeWidth, size.height - strokeWidth),
                topLeft = androidx.compose.ui.geometry.Offset(strokeWidth / 2, strokeWidth / 2)
            )
            val sweep = 360f * (secondsLeft.toFloat() / totalSeconds.toFloat())
            drawArc(
                color = ResQColors.Red,
                startAngle = -90f,
                sweepAngle = sweep,
                useCenter = false,
                style = Stroke(width = strokeWidth, cap = StrokeCap.Round),
                size = Size(size.width - strokeWidth, size.height - strokeWidth),
                topLeft = androidx.compose.ui.geometry.Offset(strokeWidth / 2, strokeWidth / 2)
            )
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("$secondsLeft", color = Color.White, fontSize = 48.sp, fontWeight = FontWeight.Black)
            Text("seconds", color = ResQColors.TextSecondary, fontSize = 12.sp)
        }
    }
}