package com.resqnet.app.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.resqnet.app.data.api.ApiClient
import com.resqnet.app.data.api.EmergencyPayload
import com.resqnet.app.data.api.IncidentDto
import com.resqnet.app.data.repository.IncidentRepository
import com.resqnet.app.domain.model.CrashDetectionResult
import com.resqnet.app.location.AppLocationManager
import com.resqnet.app.service.CrashDetectionService
import kotlinx.coroutines.launch
import kotlin.math.sqrt

class MainActivity : ComponentActivity(), SensorEventListener {

    private lateinit var sensorManager: SensorManager
    private var accelerometer: Sensor? = null
    private var currentGForce by mutableFloatStateOf(1.0f)
    private var activeIncident by mutableStateOf<IncidentDto?>(null)
    private var isShieldActive by mutableStateOf(true)

    private lateinit var repository: IncidentRepository
    private lateinit var locationManager: AppLocationManager

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val fineLocationGranted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] ?: false
        if (fineLocationGranted) {
            Toast.makeText(this, "GPS Location Access Granted", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        repository = IncidentRepository(this)
        locationManager = AppLocationManager(this)

        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

        requestRequiredPermissions()
        startCrashShieldService()

        // Flush any offline queued incidents on start
        lifecycleScope.launch {
            repository.flushOfflineQueue()
        }

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
                    isShieldActive = isShieldActive,
                    activeIncident = activeIncident,
                    onTriggerSOS = { triggerManualSOS() },
                    onSimulateCrashSpike = { simulateCrashSpike() },
                    onToggleShield = { enabled ->
                        isShieldActive = enabled
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

    private fun requestRequiredPermissions() {
        val needed = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            needed.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        permissionLauncher.launch(needed.toTypedArray())
    }

    override fun onResume() {
        super.onResume()
        accelerometer?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_UI)
        }
        lifecycleScope.launch {
            repository.flushOfflineQueue()
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
        isShieldActive = true
    }

    private fun stopCrashShieldService() {
        stopService(Intent(this, CrashDetectionService::class.java))
        isShieldActive = false
    }

    private fun simulateCrashSpike() {
        val intent = Intent(this, CrashCountdownActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
            putExtra(CrashCountdownActivity.EXTRA_G_FORCE, 5.2f)
            putExtra(CrashCountdownActivity.EXTRA_IS_ROLLOVER, true)
            putExtra(CrashCountdownActivity.EXTRA_CONFIDENCE, 0.96f)
            putExtra(CrashCountdownActivity.EXTRA_SEVERITY_SCORE, 92)
            putExtra(CrashCountdownActivity.EXTRA_DELTA_V, 55.0f)
            putExtra(CrashCountdownActivity.EXTRA_TIMESTAMP, System.currentTimeMillis())
        }
        startActivity(intent)
    }

    private fun triggerManualSOS() {
        lifecycleScope.launch {
            locationManager.acquireLatestLocation { loc ->
                lifecycleScope.launch {
                    val fakeCrash = CrashDetectionResult(
                        isDetected = true,
                        confidence = 1.0f,
                        confidencePercentage = 100,
                        severity = "CRITICAL",
                        severityScore = 95,
                        peakGForce = 1.0f,
                        accelerationMagnitude = 9.8f,
                        speedDeltaKmh = 0f,
                        isRollover = false,
                        gyroMagnitude = 0f
                    )
                    val payload = repository.createPayload(fakeCrash, loc).copy(
                        eventType = "SOS",
                        source = "citizen",
                        title = "1-Tap Driver Emergency SOS"
                    )

                    val result = repository.submitIncident(payload)
                    if (result.isSuccess) {
                        activeIncident = result.getOrNull()
                        Toast.makeText(this@MainActivity, "SOS Dispatched! Unit Assigned: ${activeIncident?.ambulanceId ?: "AMB-01"}", Toast.LENGTH_LONG).show()
                    } else {
                        Toast.makeText(this@MainActivity, "SOS saved offline (Network unreachable)", Toast.LENGTH_LONG).show()
                    }
                }
            }
        }
    }
}

@Composable
fun ResQNetAppUI(
    currentGForce: Float,
    isShieldActive: Boolean,
    activeIncident: IncidentDto?,
    onTriggerSOS: () -> Unit,
    onSimulateCrashSpike: () -> Unit,
    onToggleShield: (Boolean) -> Unit,
    onUpdateBackendUrl: (String) -> Unit
) {
    var backendUrlInput by remember { mutableStateOf(ApiClient.getBaseUrl()) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF060911))
            .padding(18.dp)
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // App Header
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "RESQNET AI",
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Black,
                    color = Color.White,
                    fontFamily = FontFamily.Monospace
                )
                Text(
                    text = "AUTONOMOUS EMERGENCY SENSOR SHIELD",
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF38BDF8)
                )
            }

            Surface(
                shape = RoundedCornerShape(20.dp),
                color = if (isShieldActive) Color(0xFF10B981).copy(alpha = 0.2f) else Color(0xFFEF4444).copy(alpha = 0.2f)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .background(if (isShieldActive) Color(0xFF10B981) else Color(0xFFEF4444), CircleShape)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = if (isShieldActive) "ARMED" else "DISARMED",
                        color = if (isShieldActive) Color(0xFF10B981) else Color(0xFFEF4444),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        // Live G-Force Meter Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF0C1220)),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "LIVE TELEMETRY G-FORCE",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF94A3B8),
                    fontFamily = FontFamily.Monospace
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "${"%.2f".format(currentGForce)} G",
                    fontSize = 44.sp,
                    fontWeight = FontWeight.Black,
                    color = if (currentGForce >= 3.2f) Color(0xFFEF4444) else Color(0xFF38BDF8),
                    fontFamily = FontFamily.Monospace
                )
                Spacer(modifier = Modifier.height(6.dp))
                LinearProgressIndicator(
                    progress = { (currentGForce / 6.0f).coerceIn(0f, 1f) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(8.dp),
                    color = if (currentGForce >= 3.2f) Color(0xFFEF4444) else Color(0xFF3B82F6),
                    trackColor = Color(0xFF1E293B)
                )
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = "Impact Trigger Threshold: 3.20 G (50Hz IMU)",
                    fontSize = 10.sp,
                    color = Color(0xFF64748B)
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Crash Shield Toggle Row
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF0C1220)),
            shape = RoundedCornerShape(14.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text("Continuous Crash Shield", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    Text("50Hz background accelerometer monitor", color = Color(0xFF64748B), fontSize = 11.sp)
                }
                Switch(
                    checked = isShieldActive,
                    onCheckedChange = onToggleShield,
                    colors = SwitchDefaults.colors(checkedThumbColor = Color(0xFF10B981))
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // 1-Tap SOS Button
        Button(
            onClick = onTriggerSOS,
            modifier = Modifier
                .fillMaxWidth()
                .height(64.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444)),
            shape = RoundedCornerShape(16.dp)
        ) {
            Icon(Icons.Default.Sos, contentDescription = null, modifier = Modifier.size(32.dp))
            Spacer(modifier = Modifier.width(10.dp))
            Text("1-TAP EMERGENCY SOS", fontSize = 16.sp, fontWeight = FontWeight.Black)
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Simulate Crash Spike Button (For Hackathon Demo)
        OutlinedButton(
            onClick = onSimulateCrashSpike,
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFF59E0B))
        ) {
            Icon(Icons.Default.Bolt, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text("SIMULATE 5.2G CRASH SPIKE (DEMO)", fontWeight = FontWeight.Bold, fontSize = 12.sp)
        }

        Spacer(modifier = Modifier.height(20.dp))

        // Backend URL Config Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF0C1220)),
            shape = RoundedCornerShape(14.dp)
        ) {
            Column(modifier = Modifier.padding(14.dp)) {
                Text("Backend Server Bridge", color = Color(0xFF94A3B8), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = backendUrlInput,
                    onValueChange = { backendUrlInput = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Server URL", fontSize = 11.sp) },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color(0xFFCBD5E1)
                    )
                )
                Spacer(modifier = Modifier.height(8.dp))
                Button(
                    onClick = { onUpdateBackendUrl(backendUrlInput) },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1E293B)),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text("SAVE SERVER URL", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color(0xFF38BDF8))
                }
            }
        }
    }
}
