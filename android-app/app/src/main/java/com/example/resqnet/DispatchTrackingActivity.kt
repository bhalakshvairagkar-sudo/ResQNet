package com.example.resqnet

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import android.app.Activity
import com.example.resqnet.ui.theme.ResQColors
import com.example.resqnet.ui.theme.ResQNetTheme
import kotlinx.coroutines.delay

class DispatchTrackingActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val emergencyType = intent.getStringExtra("emergencyType") ?: "Road Accident"

        setContent {
            ResQNetTheme {
                DispatchTrackingScreen(
                    emergencyType = emergencyType,
                    onReturn = { finish() }
                )
            }
        }
    }
}

data class DispatchStep(val title: String, val description: String, val state: StepState)
enum class StepState { DONE, ACTIVE, PENDING }

@Composable
fun DispatchTrackingScreen(emergencyType: String, onReturn: () -> Unit) {
    var stepIndex by remember { mutableIntStateOf(0) }
    val context = LocalContext.current
    val intent = (context as? Activity)?.intent
    val incidentId = remember { intent?.getStringExtra("incidentId") ?: "RQN-${(1000..9999).random()}" }

    LaunchedEffect(Unit) {
        val delayTime = 3000L
        updateBackendStatus(incidentId, "TELEMETRY_VERIFIED", "Telemetry verified by on-device AI")
        delay(delayTime)
        stepIndex = 1
        updateBackendStatus(incidentId, "COMMAND_CENTER_ALERTED", "Command center received tactical alert")
        delay(delayTime)
        stepIndex = 2
        updateBackendStatus(incidentId, "AMBULANCE_DISPATCHED", "Ambulance EMS-402 dispatched via fastest route")
        delay(delayTime)
        stepIndex = 3
        updateBackendStatus(incidentId, "HOSPITAL_NOTIFIED", "City General Trauma Center notified and ready")
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ResQColors.Dark)
            .padding(top = 40.dp, start = 16.dp, end = 16.dp, bottom = 16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text("Incident $incidentId", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                Text(emergencyType, color = ResQColors.TextSecondary, fontSize = 12.sp)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(ResQColors.Orange)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text("DISPATCHING", color = ResQColors.Orange, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        val steps = listOf(
            DispatchStep("Crash Telemetry Verified", "Impact recorded via sensors + GPS", if (stepIndex >= 0) StepState.DONE else StepState.PENDING),
            DispatchStep("Command Center Alerted", "Transmitted to dispatch backend", if (stepIndex >= 1) StepState.DONE else StepState.PENDING),
            DispatchStep("Ambulance Unit Dispatched", "Nearest available unit assigned", if (stepIndex >= 2) StepState.DONE else if (stepIndex == 1) StepState.ACTIVE else StepState.PENDING),
            DispatchStep("Trauma Center Notified", "Hospital preparing for arrival", if (stepIndex >= 3) StepState.DONE else if (stepIndex == 2) StepState.ACTIVE else StepState.PENDING)
        )

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(ResQColors.Card)
                .border(1.dp, ResQColors.Border, RoundedCornerShape(16.dp))
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text("DISPATCH PROGRESS", color = ResQColors.TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            steps.forEach { step -> DispatchStepRow(step) }
        }

        Spacer(modifier = Modifier.height(16.dp))

        if (stepIndex >= 2) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(ResQColors.Card)
                    .border(1.dp, ResQColors.Border, RoundedCornerShape(16.dp))
                    .padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(ResQColors.Blue.copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Filled.LocalHospital, contentDescription = null, tint = ResQColors.Blue)
                }
                Column {
                    Text("City General Trauma Center", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    Text("Assigned Unit: EMS-402 • ETA: 6 mins", color = ResQColors.TextSecondary, fontSize = 11.sp)
                }
            }
        }

        Spacer(modifier = Modifier.weight(1f))

        Button(
            onClick = onReturn,
            modifier = Modifier.fillMaxWidth().height(48.dp),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(containerColor = ResQColors.Border)
        ) {
            Icon(Icons.Filled.ArrowBack, contentDescription = null, modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.width(6.dp))
            Text("Return to Monitoring", color = ResQColors.TextSecondary, fontSize = 13.sp)
        }
    }
}

fun updateBackendStatus(id: String, step: String, msg: String) {
    Thread {
        try {
            val client = okhttp3.OkHttpClient()
            val json = """
                {
                  "id": "$id",
                  "step": "$step",
                  "statusMsg": "$msg",
                  "ambulanceLat": ${AppState.lastLatitude + 0.01},
                  "ambulanceLng": ${AppState.lastLongitude + 0.01}
                }
            """.trimIndent()
            val body = json.toRequestBody("application/json".toMediaType())
            val request = okhttp3.Request.Builder()
                .url("http://192.168.1.15:5000/api/dispatch-update")
                .post(body)
                .build()
            client.newCall(request).execute()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }.start()
}

@Composable
fun DispatchStepRow(step: DispatchStep) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        val bgColor = when (step.state) {
            StepState.DONE -> ResQColors.Green
            StepState.ACTIVE -> ResQColors.Orange
            StepState.PENDING -> ResQColors.Border
        }
        Box(
            modifier = Modifier
                .size(26.dp)
                .clip(CircleShape)
                .background(bgColor),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                if (step.state == StepState.DONE) Icons.Filled.Check else Icons.Filled.MoreHoriz,
                contentDescription = null,
                tint = Color.Black,
                modifier = Modifier.size(14.dp)
            )
        }
        Column {
            Text(
                step.title,
                color = if (step.state == StepState.PENDING) ResQColors.TextSecondary else Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp
            )
            Text(step.description, color = ResQColors.TextSecondary, fontSize = 10.sp)
        }
    }
}