package com.resqnet.app.ui

import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.LocalHospital
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.resqnet.app.data.api.ApiClient
import com.resqnet.app.data.api.DispatchUpdatePayload
import kotlinx.coroutines.delay

private const val TAG = "DispatchTracking"

class DispatchTrackingActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val emergencyType =
            intent.getStringExtra("emergencyType") ?: "Road Accident"

        val incidentId =
            intent.getStringExtra("incidentId")
                ?: "RNQ-${System.currentTimeMillis().toString().takeLast(6)}"

        val latitude =
            intent.getDoubleExtra("latitude", 0.0)

        val longitude =
            intent.getDoubleExtra("longitude", 0.0)

        setContent {
            MaterialTheme {

                DispatchTrackingScreen(
                    emergencyType = emergencyType,
                    incidentId = incidentId,
                    latitude = latitude,
                    longitude = longitude,
                    onReturn = {
                        finish()
                    }
                )
            }
        }
    }
}

data class DispatchStep(
    val title: String,
    val description: String,
    val state: StepState
)

enum class StepState {
    DONE,
    ACTIVE,
    PENDING
}

@Composable
fun DispatchTrackingScreen(
    emergencyType: String,
    incidentId: String,
    latitude: Double,
    longitude: Double,
    onReturn: () -> Unit
) {

    var stepIndex by remember {
        mutableIntStateOf(0)
    }

    /*
     * Automatically progresses through the emergency dispatch workflow.
     *
     * IMPORTANT:
     * These updates are sent to the real ResQNet backend.
     */
    LaunchedEffect(incidentId) {

        // STEP 1
        updateBackendStatus(
            incidentId = incidentId,
            step = "TELEMETRY_VERIFIED",
            message = "Telemetry verified by on-device AI",
            latitude = latitude,
            longitude = longitude
        )

        delay(3000)

        // STEP 2
        stepIndex = 1

        updateBackendStatus(
            incidentId = incidentId,
            step = "COMMAND_CENTER_ALERTED",
            message = "Command center received tactical alert",
            latitude = latitude,
            longitude = longitude
        )

        delay(3000)

        // STEP 3
        stepIndex = 2

        updateBackendStatus(
            incidentId = incidentId,
            step = "AMBULANCE_DISPATCHED",
            message = "Ambulance dispatched via fastest route",
            latitude = latitude,
            longitude = longitude
        )

        delay(3000)

        // STEP 4
        stepIndex = 3

        updateBackendStatus(
            incidentId = incidentId,
            step = "HOSPITAL_NOTIFIED",
            message = "Trauma center notified and preparing",
            latitude = latitude,
            longitude = longitude
        )
    }

    val backgroundColor = Color(0xFF070C15)
    val cardColor = Color(0xFF111B2B)
    val borderColor = Color(0xFF253247)

    val blueColor = Color(0xFF29B6F6)
    val greenColor = Color(0xFF22C55E)
    val orangeColor = Color(0xFFFFA726)
    val secondaryText = Color(0xFF9AA7B8)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(backgroundColor)
            .padding(
                top = 40.dp,
                start = 16.dp,
                end = 16.dp,
                bottom = 16.dp
            )
    ) {

        // ---------------------------------------------------------
        // HEADER
        // ---------------------------------------------------------

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {

            Column {

                Text(
                    text = "Incident $incidentId",
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp
                )

                Text(
                    text = emergencyType,
                    color = secondaryText,
                    fontSize = 12.sp
                )
            }

            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {

                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(orangeColor)
                )

                Spacer(
                    modifier = Modifier.width(6.dp)
                )

                Text(
                    text = "DISPATCHING",
                    color = orangeColor,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }

        Spacer(
            modifier = Modifier.height(20.dp)
        )

        // ---------------------------------------------------------
        // DISPATCH STEPS
        // ---------------------------------------------------------

        val steps = listOf(

            DispatchStep(
                title = "Crash Telemetry Verified",
                description = "Impact recorded via sensors + GPS",
                state = if (stepIndex >= 0) {
                    StepState.DONE
                } else {
                    StepState.PENDING
                }
            ),

            DispatchStep(
                title = "Command Center Alerted",
                description = "Emergency transmitted to dispatch backend",
                state = when {
                    stepIndex >= 1 -> StepState.DONE
                    stepIndex == 0 -> StepState.ACTIVE
                    else -> StepState.PENDING
                }
            ),

            DispatchStep(
                title = "Ambulance Unit Dispatched",
                description = "Nearest available emergency unit assigned",
                state = when {
                    stepIndex >= 2 -> StepState.DONE
                    stepIndex == 1 -> StepState.ACTIVE
                    else -> StepState.PENDING
                }
            ),

            DispatchStep(
                title = "Trauma Center Notified",
                description = "Hospital preparing for patient arrival",
                state = when {
                    stepIndex >= 3 -> StepState.DONE
                    stepIndex == 2 -> StepState.ACTIVE
                    else -> StepState.PENDING
                }
            )
        )

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(
                    RoundedCornerShape(16.dp)
                )
                .background(cardColor)
                .border(
                    width = 1.dp,
                    color = borderColor,
                    shape = RoundedCornerShape(16.dp)
                )
                .padding(16.dp),

            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {

            Text(
                text = "DISPATCH PROGRESS",
                color = secondaryText,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold
            )

            steps.forEach { step ->

                DispatchStepRow(
                    step = step,
                    greenColor = greenColor,
                    orangeColor = orangeColor,
                    borderColor = borderColor,
                    secondaryText = secondaryText
                )
            }
        }

        Spacer(
            modifier = Modifier.height(16.dp)
        )

        // ---------------------------------------------------------
        // AMBULANCE / HOSPITAL CARD
        // ---------------------------------------------------------

        if (stepIndex >= 2) {

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(
                        RoundedCornerShape(16.dp)
                    )
                    .background(cardColor)
                    .border(
                        width = 1.dp,
                        color = borderColor,
                        shape = RoundedCornerShape(16.dp)
                    )
                    .padding(14.dp),

                verticalAlignment = Alignment.CenterVertically,

                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {

                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .clip(
                            RoundedCornerShape(10.dp)
                        )
                        .background(
                            blueColor.copy(alpha = 0.15f)
                        ),

                    contentAlignment = Alignment.Center
                ) {

                    Icon(
                        imageVector = Icons.Filled.LocalHospital,
                        contentDescription = "Hospital",
                        tint = blueColor
                    )
                }

                Column {

                    Text(
                        text = "City General Trauma Center",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp
                    )

                    Text(
                        text = "Assigned Unit: EMS-402 • ETA: 6 mins",
                        color = secondaryText,
                        fontSize = 11.sp
                    )
                }
            }
        }

        Spacer(
            modifier = Modifier.weight(1f)
        )

        // ---------------------------------------------------------
        // RETURN BUTTON
        // ---------------------------------------------------------

        Button(
            onClick = onReturn,

            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp),

            shape = RoundedCornerShape(14.dp),

            colors = ButtonDefaults.buttonColors(
                containerColor = borderColor
            )
        ) {

            Icon(
                imageVector = Icons.Filled.ArrowBack,
                contentDescription = "Return",
                modifier = Modifier.size(16.dp),
                tint = secondaryText
            )

            Spacer(
                modifier = Modifier.width(6.dp)
            )

            Text(
                text = "Return to Monitoring",
                color = secondaryText,
                fontSize = 13.sp
            )
        }
    }
}

@Composable
private fun DispatchStepRow(
    step: DispatchStep,
    greenColor: Color,
    orangeColor: Color,
    borderColor: Color,
    secondaryText: Color
) {

    val bgColor = when (step.state) {

        StepState.DONE ->
            greenColor

        StepState.ACTIVE ->
            orangeColor

        StepState.PENDING ->
            borderColor
    }

    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {

        Box(
            modifier = Modifier
                .size(26.dp)
                .clip(CircleShape)
                .background(bgColor),

            contentAlignment = Alignment.Center
        ) {

            Icon(
                imageVector =
                    if (step.state == StepState.DONE) {
                        Icons.Filled.Check
                    } else {
                        Icons.Filled.MoreHoriz
                    },

                contentDescription = null,

                tint = Color.Black,

                modifier = Modifier.size(14.dp)
            )
        }

        Column {

            Text(
                text = step.title,

                color =
                    if (step.state == StepState.PENDING) {
                        secondaryText
                    } else {
                        Color.White
                    },

                fontWeight = FontWeight.Bold,
                fontSize = 13.sp
            )

            Text(
                text = step.description,
                color = secondaryText,
                fontSize = 10.sp
            )
        }
    }
}

/**
 * Sends dispatch progress to the ResQNet backend.
 *
 * This replaces the old hardcoded:
 *
 * http://192.168.1.15:5000/api/dispatch-update
 *
 * which only works when your phone and computer are on the
 * same LAN.
 */
private suspend fun updateBackendStatus(
    incidentId: String,
    step: String,
    message: String,
    latitude: Double,
    longitude: Double
) {

    try {

        val payload = DispatchUpdatePayload(
            id = incidentId,
            step = step,
            statusMsg = message,
            ambulanceLat = latitude,
            ambulanceLng = longitude
        )

        val response =
            ApiClient.api.updateDispatchStatus(payload)

        if (response.isSuccessful) {

            Log.d(
                TAG,
                "Dispatch update successful: $step"
            )

        } else {

            Log.e(
                TAG,
                "Dispatch update failed: HTTP ${response.code()}"
            )
        }

    } catch (e: Exception) {

        Log.e(
            TAG,
            "Dispatch update network error: ${e.message}",
            e
        )
    }
}