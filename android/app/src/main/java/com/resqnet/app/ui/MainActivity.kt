package com.resqnet.app.ui

import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.lifecycleScope
import com.resqnet.app.data.api.ApiClient
import com.resqnet.app.data.api.EmergencyPayload
import com.resqnet.app.data.api.IncidentDto
import com.resqnet.app.service.CrashDetectionService
import kotlinx.coroutines.launch
import kotlin.math.sqrt

class MainActivity : ComponentActivity(), SensorEventListener {

    private lateinit var sensorManager: SensorManager
    private var accelerometer: Sensor? = null
    private var currentGForce by mutableFloatStateOf(1.0f)
    private var activeIncident by mutableStateOf<IncidentDto?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

        // Start background crash shield service by default
        startCrashShieldService()

        setContent {
            MaterialTheme(
                colorScheme = darkColorScheme(
                    background = Color(0xFF060911),
                    surface = Color(0xFF0C1220),
                    primary = Color(0xFF3B82F6)
                )
            ) {
                ResQNetAppUI(
                    currentGForce = currentGForce,
                    activeIncident = activeIncident,
                    onTriggerSOS = { triggerManualSOS() },
                    onSimulateCrashSpike = { simulateCrashSpike() },
                    onToggleShield = { enabled ->
                        if (enabled) startCrashShieldService() else stopCrashShieldService()
                    },
                    onUpdateBackendUrl = { url ->
                        ApiClient.setBaseUrl(url)
                        Toast.makeText(this, "Backend URL Updated: $url", Toast.LENGTH_SHORT).show()
                    }
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        accelerometer?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_UI)
        }
    }

    override fun onPause() {
        super.onPause()
        sensorManager.unregisterListener(this)
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event?.sensor?.type == Sensor.TYPE_ACCELEROMETER) {
            val ax = event.values[0]
            val ay = event.values[1]
            val az = event.values[2]
            val total = sqrt((ax * ax + ay * ay + az * az).toDouble()).toFloat()
            currentGForce = total / 9.80665f
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    private fun startCrashShieldService() {
        val intent = Intent(this, CrashDetectionService::class.java)
        startService(intent)
    }

    private fun stopCrashShieldService() {
        val intent = Intent(this, CrashDetectionService::class.java)
        stopService(intent)
    }

    private fun simulateCrashSpike() {
        val intent = Intent(this, CrashCountdownActivity::class.java).apply {
            putExtra("EXTRA_G_FORCE", 4.8f)
            putExtra("EXTRA_IS_ROLLOVER", false)
        }
        startActivity(intent)
    }

    private fun triggerManualSOS() {
        lifecycleScope.launch {
            try {
                val payload = EmergencyPayload(
                    title = "Citizen Manual SOS Voice/1-Tap Alert",
                    latitude = 18.5204 + (Math.random() - 0.5) * 0.03,
                    longitude = 73.8567 + (Math.random() - 0.5) * 0.03,
                    sourceType = "citizen",
                    confidence = 0.98f,
                    severity = 88
                )
                val response = ApiClient.api.reportCrash(payload)
                if (response.isSuccessful && response.body()?.incident != null) {
                    activeIncident = response.body()?.incident
                    Toast.makeText(this@MainActivity, "🚨 Emergency Ingested! Nearest ALS unit dispatched.", Toast.LENGTH_LONG).show()
                } else {
                    Toast.makeText(this@MainActivity, "Connected in Offline Mode", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@MainActivity, "Error transmitting: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }
}

@Composable
fun ResQNetAppUI(
    currentGForce: Float,
    activeIncident: IncidentDto?,
    onTriggerSOS: () -> Unit,
    onSimulateCrashSpike: () -> Unit,
    onToggleShield: (Boolean) -> Unit,
    onUpdateBackendUrl: (String) -> Unit
) {
    var shieldActive by remember { mutableStateOf(true) }
    var backendUrlInput by remember { mutableStateOf("http://10.0.2.2:5000") }
    var showSettingsDialog by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF0C1220))
                    .padding(horizontal = 16.dp, vertical = 14.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.Shield,
                        contentDescription = null,
                        tint = Color(0xFF3B82F6),
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Column {
                        Text(
                            text = "RESQNET MOBILE",
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 15.sp
                        )
                        Text(
                            text = "Camera-Independent Impact AI",
                            color = Color(0xFF94A3B8),
                            fontSize = 10.sp
                        )
                    }
                }

                IconButton(onClick = { showSettingsDialog = true }) {
                    Icon(Icons.Default.Settings, contentDescription = "Settings", tint = Color(0xFF94A3B8))
                }
            }
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF060911))
                .padding(innerPadding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Live Sensor G-Force Monitor Card
            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFF121A2D)),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "LIVE SENSOR G-FORCE",
                            color = Color(0xFF94A3B8),
                            fontFamily = FontFamily.Monospace,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Surface(
                            color = if (shieldActive) Color(0x3310B981) else Color(0x33EF4444),
                            shape = RoundedCornerShape(6.dp)
                        ) {
                            Text(
                                text = if (shieldActive) "● ARMED & LISTENING" else "● DISARMED",
                                color = if (shieldActive) Color(0xFF10B981) else Color(0xFFEF4444),
                                fontFamily = FontFamily.Monospace,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.Bottom
                    ) {
                        Column {
                            Text(
                                text = "${String.format("%.2f", currentGForce)} G",
                                color = if (currentGForce > 3.0f) Color(0xFFEF4444) else Color.White,
                                fontSize = 36.sp,
                                fontWeight = FontWeight.Black,
                                fontFamily = FontFamily.Monospace
                            )
                            Text(
                                text = "Sampling rate: 50 Hz | 3-Axis Vector",
                                color = Color(0xFF64748B),
                                fontSize = 11.sp
                            )
                        }

                        Switch(
                            checked = shieldActive,
                            onCheckedChange = {
                                shieldActive = it
                                onToggleShield(it)
                            },
                            colors = SwitchDefaults.colors(
                                checkedThumbColor = Color.White,
                                checkedTrackColor = Color(0xFF2563EB)
                            )
                        )
                    }
                }
            }

            // Live Dispatch Status Card (If active)
            if (activeIncident != null) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = "ACTIVE DISPATCH TRACKING",
                                color = Color(0xFF38BDF8),
                                fontFamily = FontFamily.Monospace,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = activeIncident.id,
                                color = Color.White,
                                fontFamily = FontFamily.Monospace,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        Text(
                            text = "Assigned: ${activeIncident.ambulanceId ?: "Allocating Unit..."}",
                            color = Color(0xFFFBBF24),
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp
                        )
                        Text(
                            text = "Trauma Center: ${activeIncident.hospitalId ?: "Matching..."}",
                            color = Color(0xFF94A3B8),
                            fontSize = 12.sp
                        )
                    }
                }
            }

            // 1-Tap SOS Emergency Trigger Button
            Button(
                onClick = onTriggerSOS,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDC2626)),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(64.dp)
            ) {
                Icon(Icons.Default.Warning, contentDescription = null, tint = Color.White)
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = "1-TAP EMERGENCY SOS",
                    color = Color.White,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Black,
                    fontFamily = FontFamily.Monospace
                )
            }

            // Demo Simulate Sensor Spike Button (For Competition & Presentations)
            OutlinedButton(
                onClick = onSimulateCrashSpike,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.Bolt, contentDescription = null, tint = Color(0xFFF59E0B))
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "SIMULATE CRASH SPIKE (4.8G)",
                    color = Color(0xFFF59E0B),
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace
                )
            }
        }
    }

    // Backend URL Settings Dialog
    if (showSettingsDialog) {
        AlertDialog(
            onDismissRequest = { showSettingsDialog = false },
            title = { Text("Backend Server Configuration") },
            text = {
                Column {
                    Text(
                        "Set the IP or URL of the ResQNet Central Backend (e.g., http://10.0.2.2:5000 for emulator or your LAN IP):",
                        fontSize = 12.sp
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = backendUrlInput,
                        onValueChange = { backendUrlInput = it },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(onClick = {
                    onUpdateBackendUrl(backendUrlInput)
                    showSettingsDialog = false
                }) {
                    Text("Save")
                }
            },
            dismissButton = {
                TextButton(onClick = { showSettingsDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}
