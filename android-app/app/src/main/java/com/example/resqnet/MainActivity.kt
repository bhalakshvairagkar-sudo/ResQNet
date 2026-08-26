package com.example.resqnet

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.example.resqnet.ui.theme.ResQColors
import com.example.resqnet.ui.theme.ResQNetTheme
import kotlin.math.roundToInt

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        NotificationHelper.createChannels(this)

        setContent {
            ResQNetTheme {
                DashboardScreen()
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen() {
    val context = LocalContext.current
    var monitoring by remember { mutableStateOf(false) }
    var showReportSheet by remember { mutableStateOf(false) }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { }

    LaunchedEffect(Unit) {
        val permissions = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.POST_NOTIFICATIONS)
        } else {
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
        }
        permissionLauncher.launch(permissions)
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(ResQColors.Dark)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Spacer(modifier = Modifier.height(8.dp))

            BrandHeader()

            ProtectionStatusCard(
                monitoring = monitoring,
                onToggle = {
                    monitoring = !monitoring
                    val serviceIntent = Intent(context, CrashDetectionService::class.java)
                    if (monitoring) {
                        ContextCompat.startForegroundService(context, serviceIntent)
                    } else {
                        context.stopService(serviceIntent)
                    }
                }
            )

            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                MetricCard(
                    modifier = Modifier.weight(1f),
                    label = "SPEED",
                    icon = Icons.Filled.Speed,
                    iconColor = ResQColors.Blue,
                    value = AppState.currentSpeedKmh.floatValue.roundToInt().toString(),
                    unit = "km/h",
                    footer = if (AppState.gpsLockGood.value) "GPS Lock: High" else "GPS Lock: Weak",
                    footerColor = if (AppState.gpsLockGood.value) ResQColors.Green else ResQColors.Orange
                )
                MetricCard(
                    modifier = Modifier.weight(1f),
                    label = "ACCELERATION",
                    icon = Icons.Filled.Layers,
                    iconColor = ResQColors.Orange,
                    value = String.format("%.1f", AppState.currentGForce.floatValue),
                    unit = "g",
                    footer = if (AppState.currentGForce.floatValue > 3.5f) "High Impact" else "Normal Inertia",
                    footerColor = if (AppState.currentGForce.floatValue > 3.5f) ResQColors.Red else ResQColors.TextSecondary
                )
            }

            AxisBreakdownCard()

            DebugSimulateButton(
                onClick = { context.startActivity(Intent(context, CrashConfirmationActivity::class.java)) }
            )

            Button(
                onClick = { showReportSheet = true },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(containerColor = ResQColors.Red)
            ) {
                Icon(Icons.Filled.Warning, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("REPORT EMERGENCY MANUALLY", fontWeight = FontWeight.Bold, fontSize = 13.sp)
            }

            Spacer(modifier = Modifier.height(20.dp))
        }

        if (showReportSheet) {
            ManualReportSheet(
                onDismiss = { showReportSheet = false },
                onSelect = { type ->
                    showReportSheet = false
                    context.startActivity(
                        Intent(context, DispatchTrackingActivity::class.java).apply {
                            putExtra("emergencyType", type)
                        }
                    )
                }
            )
        }
    }
}

@Composable
fun BrandHeader() {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(ResQColors.Red.copy(alpha = 0.15f))
                .border(1.dp, ResQColors.Red.copy(alpha = 0.4f), RoundedCornerShape(12.dp)),
            contentAlignment = Alignment.Center
        ) {
            Icon(Icons.Filled.Shield, contentDescription = null, tint = ResQColors.Red)
        }
        Column {
            Text("RESQNET", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp, letterSpacing = 1.sp)
            Text("Smartphone Crash Detection & Dispatch", color = ResQColors.TextSecondary, fontSize = 11.sp)
        }
    }
}

@Composable
fun ProtectionStatusCard(monitoring: Boolean, onToggle: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(ResQColors.Card)
            .border(1.dp, ResQColors.Border, RoundedCornerShape(18.dp))
            .padding(16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(RoundedCornerShape(50))
                    .background(if (monitoring) ResQColors.Green.copy(alpha = 0.15f) else ResQColors.Border.copy(alpha = 0.3f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Filled.Radar,
                    contentDescription = null,
                    tint = if (monitoring) ResQColors.Green else ResQColors.TextSecondary
                )
            }
            Column {
                Text("SYSTEM PROTECTION", color = ResQColors.TextSecondary, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                Text(
                    if (monitoring) "ACTIVE & MONITORING" else "MONITORING OFF",
                    color = Color.White,
                    fontWeight = FontWeight.Black,
                    fontSize = 14.sp
                )
            }
        }
        Switch(
            checked = monitoring,
            onCheckedChange = { onToggle() },
            colors = SwitchDefaults.colors(checkedTrackColor = ResQColors.Green)
        )
    }
}

@Composable
fun MetricCard(
    modifier: Modifier = Modifier,
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    iconColor: Color,
    value: String,
    unit: String,
    footer: String,
    footerColor: Color
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(ResQColors.Card)
            .border(1.dp, ResQColors.Border, RoundedCornerShape(16.dp))
            .padding(14.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(label, color = ResQColors.TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            Icon(icon, contentDescription = null, tint = iconColor, modifier = Modifier.size(16.dp))
        }
        Row(verticalAlignment = Alignment.Bottom) {
            Text(value, color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Black)
            Spacer(modifier = Modifier.width(4.dp))
            Text(unit, color = ResQColors.TextSecondary, fontSize = 12.sp, modifier = Modifier.padding(bottom = 4.dp))
        }
        Text(footer, color = footerColor, fontSize = 10.sp, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace)
    }
}

@Composable
fun AxisBreakdownCard() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(ResQColors.Card)
            .border(1.dp, ResQColors.Border, RoundedCornerShape(16.dp))
            .padding(14.dp)
    ) {
        Text("RAW AXIS BREAKDOWN", color = ResQColors.TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        Spacer(modifier = Modifier.height(10.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            AxisChip("AXIS X", AppState.axisX.floatValue, Modifier.weight(1f))
            AxisChip("AXIS Y", AppState.axisY.floatValue, Modifier.weight(1f))
            AxisChip("AXIS Z", AppState.axisZ.floatValue, Modifier.weight(1f))
        }
    }
}

@Composable
fun AxisChip(label: String, value: Float, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(ResQColors.Dark)
            .border(1.dp, ResQColors.Border.copy(alpha = 0.6f), RoundedCornerShape(10.dp))
            .padding(vertical = 10.dp, horizontal = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(label, color = ResQColors.TextSecondary, fontSize = 9.sp)
        Text(
            String.format("%+.2f", value),
            color = Color.White,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace
        )
    }
}

@Composable
fun DebugSimulateButton(onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .height(48.dp),
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(containerColor = ResQColors.Card),
        border = androidx.compose.foundation.BorderStroke(1.dp, ResQColors.Border)
    ) {
        Icon(Icons.Filled.Science, contentDescription = null, tint = ResQColors.Orange, modifier = Modifier.size(16.dp))
        Spacer(modifier = Modifier.width(8.dp))
        Text("DEBUG: SIMULATE CRASH", color = ResQColors.TextSecondary, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
    }
}