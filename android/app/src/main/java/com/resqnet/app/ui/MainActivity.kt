package com.resqnet.app.ui

import android.Manifest
import android.content.Context
import android.content.Intent
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.lifecycleScope
import com.resqnet.app.data.api.ApiClient
import com.resqnet.app.data.api.AppEnvironment
import com.resqnet.app.data.repository.IncidentRepository
import com.resqnet.app.domain.model.CrashDetectionResult
import com.resqnet.app.domain.model.SubmissionStatus
import com.resqnet.app.location.AppLocationManager
import com.resqnet.app.network.NetworkMonitor
import com.resqnet.app.service.CrashDetectionService
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.sqrt

class MainActivity : ComponentActivity(), SensorEventListener {

    private lateinit var sensorManager: SensorManager
    private var accelerometer: Sensor? = null
    private var gyroscope: Sensor? = null

    // Live raw sensor telemetry states for UI Test Mode
    private var rawAx by mutableFloatStateOf(0.0f)
    private var rawAy by mutableFloatStateOf(0.0f)
    private var rawAz by mutableFloatStateOf(9.81f)
    private var rawMagnitude by mutableFloatStateOf(9.81f)
    private var currentGForce by mutableFloatStateOf(1.0f)

    private var rawGx by mutableFloatStateOf(0.0f)
    private var rawGy by mutableFloatStateOf(0.0f)
    private var rawGz by mutableFloatStateOf(0.0f)
    private var rawAngularVelocity by mutableFloatStateOf(0.0f)

    // Measured sensor frequency
    private var accelHz by mutableFloatStateOf(0.0f)
    private var gyroHz by mutableFloatStateOf(0.0f)
    private var procHz by mutableFloatStateOf(0.0f)

    private var isGyroAvailable by mutableStateOf(false)
    private var isAccelAvailable by mutableStateOf(false)

    private var isShieldActive by mutableStateOf(true)
    private var pendingCountState by mutableIntStateOf(0)

    private lateinit var repository: IncidentRepository
    private lateinit var locationManager: AppLocationManager
    private lateinit var networkMonitor: NetworkMonitor

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
        networkMonitor = NetworkMonitor.getInstance(this)

        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        gyroscope = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)

        isAccelAvailable = (accelerometer != null)
        isGyroAvailable = (gyroscope != null)

        requestRequiredPermissions()
        startCrashShieldService()

        refreshPendingCount()
        lifecycleScope.launch {
            repository.flushPendingRetries()
            refreshPendingCount()
        }

        // Periodic UI frequency updater
        lifecycleScope.launch {
            while (true) {
                delay(500L)
                accelHz = CrashDetectionService.measuredAccelHz
                gyroHz = CrashDetectionService.measuredGyroHz
                procHz = CrashDetectionService.measuredProcessingHz
            }
        }

        setContent {
            MaterialTheme(
                colorScheme = darkColorScheme(
                    background = Color(0xFF060911),
                    surface = Color(0xFF0C1220),
                    primary = Color(0xFF3B82F6)
                )
            ) {
                val isOnline by networkMonitor.isOnline.collectAsState()

                ResQNetAppUI(
                    rawAx = rawAx,
                    rawAy = rawAy,
                    rawAz = rawAz,
                    rawMagnitude = rawMagnitude,
                    currentGForce = currentGForce,
                    rawGx = rawGx,
                    rawGy = rawGy,
                    rawGz = rawGz,
                    rawAngularVelocity = rawAngularVelocity,
                    accelHz = accelHz,
                    gyroHz = gyroHz,
                    procHz = procHz,
                    isAccelAvailable = isAccelAvailable,
                    isGyroAvailable = isGyroAvailable,
                    isShieldActive = isShieldActive,
                    isOnline = isOnline,
                    pendingIncidentCount = pendingCountState,
                    onTriggerSOS = { triggerReliableSOS() },
                    onSimulateCrashSpike = { simulateCrashSpike() },
                    onToggleShield = { enabled ->
                        isShieldActive = enabled
                        if (enabled) startCrashShieldService() else stopCrashShieldService()
                    },
                    onSelectEnvironment = { env ->
                        ApiClient.setEnvironment(env)
                        Toast.makeText(this, "Environment Set: ${env.name} (${ApiClient.getBaseUrl()})", Toast.LENGTH_SHORT).show()
                    },
                    onUpdateBackendUrl = { url ->
                        ApiClient.setBaseUrl(url)
                        Toast.makeText(this, "Custom URL Updated: $url", Toast.LENGTH_SHORT).show()
                    },
                    onOpenCitizenWebPortal = {
                        val intent = Intent(this, CitizenWebPortalActivity::class.java).apply {
                            putExtra(CitizenWebPortalActivity.EXTRA_URL, ApiClient.getBaseUrl())
                        }
                        startActivity(intent)
                    },
                    onOpenOperationsPortal = { startActivity(Intent(this, RolePortalActivity::class.java)) },
                    onFlushRetries = {
                        lifecycleScope.launch {
                            val flushed = repository.flushPendingRetries()
                            refreshPendingCount()
                            Toast.makeText(this@MainActivity, "Flushed $flushed pending incidents", Toast.LENGTH_SHORT).show()
                        }
                    }
                )
            }
        }
    }

    private fun refreshPendingCount() {
        pendingCountState = repository.getAllLocalIncidents().count {
            it.submissionStatus != SubmissionStatus.CONFIRMED
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
        gyroscope?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_UI)
        }
        refreshPendingCount()
        lifecycleScope.launch {
            repository.flushPendingRetries()
            refreshPendingCount()
        }
    }

    override fun onPause() {
        super.onPause()
        sensorManager.unregisterListener(this)
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event == null) return
        when (event.sensor.type) {
            Sensor.TYPE_ACCELEROMETER -> {
                rawAx = event.values[0]
                rawAy = event.values[1]
                rawAz = event.values[2]
                rawMagnitude = sqrt((rawAx * rawAx + rawAy * rawAy + rawAz * rawAz).toDouble()).toFloat()
                currentGForce = rawMagnitude / 9.80665f
            }
            Sensor.TYPE_GYROSCOPE -> {
                rawGx = event.values[0]
                rawGy = event.values[1]
                rawGz = event.values[2]
                rawAngularVelocity = sqrt((rawGx * rawGx + rawGy * rawGy + rawGz * rawGz).toDouble()).toFloat()
            }
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

    private fun triggerReliableSOS() {
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

                    val record = repository.createAndSaveLocalIncident(fakeCrash, loc)
                    refreshPendingCount()

                    val result = repository.submitIncidentReliably(record)
                    refreshPendingCount()

                    if (result.isSuccess) {
                        Toast.makeText(this@MainActivity, "SOS Dispatched & Confirmed! (ID: ${record.incidentId})", Toast.LENGTH_LONG).show()
                    } else {
                        Toast.makeText(this@MainActivity, "SOS saved locally on device. Will auto-retry.", Toast.LENGTH_LONG).show()
                    }
                }
            }
        }
    }
}

@Composable
fun ResQNetAppUI(
    rawAx: Float,
    rawAy: Float,
    rawAz: Float,
    rawMagnitude: Float,
    currentGForce: Float,
    rawGx: Float,
    rawGy: Float,
    rawGz: Float,
    rawAngularVelocity: Float,
    accelHz: Float,
    gyroHz: Float,
    procHz: Float,
    isAccelAvailable: Boolean,
    isGyroAvailable: Boolean,
    isShieldActive: Boolean,
    isOnline: Boolean,
    pendingIncidentCount: Int,
    onTriggerSOS: () -> Unit,
    onSimulateCrashSpike: () -> Unit,
    onToggleShield: (Boolean) -> Unit,
    onSelectEnvironment: (AppEnvironment) -> Unit,
    onUpdateBackendUrl: (String) -> Unit,
    onOpenCitizenWebPortal: () -> Unit,
    onOpenOperationsPortal: () -> Unit,
    onFlushRetries: () -> Unit
) {
    var backendUrlInput by remember { mutableStateOf(ApiClient.getBaseUrl()) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF060911))
            .padding(16.dp)
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
                    text = "MEASURED SENSOR CADENCE & SHIELD",
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF38BDF8)
                )
            }

            Row {
                Surface(
                    shape = RoundedCornerShape(20.dp),
                    color = if (isOnline) Color(0xFF10B981).copy(alpha = 0.2f) else Color(0xFFF59E0B).copy(alpha = 0.2f)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .background(if (isOnline) Color(0xFF10B981) else Color(0xFFF59E0B), CircleShape)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = if (isOnline) "ONLINE" else "OFFLINE",
                            color = if (isOnline) Color(0xFF10B981) else Color(0xFFF59E0B),
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                Spacer(modifier = Modifier.width(6.dp))

                Surface(
                    shape = RoundedCornerShape(20.dp),
                    color = if (isShieldActive) Color(0xFF3B82F6).copy(alpha = 0.2f) else Color(0xFFEF4444).copy(alpha = 0.2f)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = if (isShieldActive) "ARMED" else "DISARMED",
                            color = if (isShieldActive) Color(0xFF38BDF8) else Color(0xFFEF4444),
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // SENSOR TEST MODE & MEASURED FREQUENCY HUD
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF0C1220)),
            shape = RoundedCornerShape(14.dp)
        ) {
            Column(modifier = Modifier.padding(14.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "RESQNET SENSOR TEST MODE",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Black,
                        color = Color(0xFF38BDF8),
                        fontFamily = FontFamily.Monospace
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .background(Color(0xFF10B981), CircleShape)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "LIVE SENSORS",
                            color = Color(0xFF10B981),
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                Spacer(modifier = Modifier.height(6.dp))

                // Measured Real Frequencies
                Surface(
                    color = Color(0xFF060911),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Accel: ${"%.1f".format(accelHz)} Hz", color = Color(0xFF38BDF8), fontSize = 10.sp, fontFamily = FontFamily.Monospace)
                        Text("Gyro: ${"%.1f".format(gyroHz)} Hz", color = Color(0xFFF59E0B), fontSize = 10.sp, fontFamily = FontFamily.Monospace)
                        Text("Proc: ${"%.1f".format(procHz)} Hz", color = Color(0xFF10B981), fontSize = 10.sp, fontFamily = FontFamily.Monospace)
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                // Accelerometer Diagnostics
                Text(
                    text = "ACCELEROMETER ${if (isAccelAvailable) "(ACTIVE)" else "(UNAVAILABLE)"}",
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF94A3B8)
                )
                Spacer(modifier = Modifier.height(2.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("X: ${"%.2f".format(rawAx)}", color = Color.White, fontSize = 11.sp, fontFamily = FontFamily.Monospace)
                    Text("Y: ${"%.2f".format(rawAy)}", color = Color.White, fontSize = 11.sp, fontFamily = FontFamily.Monospace)
                    Text("Z: ${"%.2f".format(rawAz)}", color = Color.White, fontSize = 11.sp, fontFamily = FontFamily.Monospace)
                    Text("Mag: ${"%.2f".format(rawMagnitude)} m/s²", color = Color(0xFF38BDF8), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Gyroscope Diagnostics
                Text(
                    text = "GYROSCOPE ${if (isGyroAvailable) "(ACTIVE)" else "(NOT DETECTED / ACCEL FALLBACK)"}",
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF94A3B8)
                )
                Spacer(modifier = Modifier.height(2.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Gx: ${"%.2f".format(rawGx)}", color = Color.White, fontSize = 11.sp, fontFamily = FontFamily.Monospace)
                    Text("Gy: ${"%.2f".format(rawGy)}", color = Color.White, fontSize = 11.sp, fontFamily = FontFamily.Monospace)
                    Text("Gz: ${"%.2f".format(rawGz)}", color = Color.White, fontSize = 11.sp, fontFamily = FontFamily.Monospace)
                    Text("Rot: ${"%.2f".format(rawAngularVelocity)} rad/s", color = Color(0xFFF59E0B), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // Live G-Force Meter Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF0C1220)),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "LIVE TOTAL G-FORCE",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF94A3B8),
                    fontFamily = FontFamily.Monospace
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "${"%.2f".format(currentGForce)} G",
                    fontSize = 42.sp,
                    fontWeight = FontWeight.Black,
                    color = if (currentGForce >= 3.2f) Color(0xFFEF4444) else Color(0xFF38BDF8),
                    fontFamily = FontFamily.Monospace
                )
                Spacer(modifier = Modifier.height(6.dp))
                LinearProgressIndicator(
                    progress = { (currentGForce / 6.0f).coerceIn(0f, 1f) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(6.dp),
                    color = if (currentGForce >= 3.2f) Color(0xFFEF4444) else Color(0xFF3B82F6),
                    trackColor = Color(0xFF1E293B)
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Crash Threshold: ≥ 3.20 G (Shake hard or tap to test)",
                    fontSize = 10.sp,
                    color = Color(0xFF64748B)
                )
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // Shield Toggle Row
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF0C1220)),
            shape = RoundedCornerShape(12.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(14.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text("Continuous Crash Shield Service", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    Text("Multi-sensor background kinematic evaluation", color = Color(0xFF64748B), fontSize = 11.sp)
                }
                Switch(
                    checked = isShieldActive,
                    onCheckedChange = onToggleShield,
                    colors = SwitchDefaults.colors(checkedThumbColor = Color(0xFF10B981))
                )
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // 1-Tap SOS Button
        Button(
            onClick = onTriggerSOS,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444)),
            shape = RoundedCornerShape(14.dp)
        ) {
            Icon(Icons.Default.Sos, contentDescription = null, modifier = Modifier.size(28.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text("1-TAP EMERGENCY SOS", fontSize = 15.sp, fontWeight = FontWeight.Black)
        }

        Spacer(modifier = Modifier.height(10.dp))

        // Simulate Crash Spike Button
        OutlinedButton(
            onClick = onSimulateCrashSpike,
            modifier = Modifier
                .fillMaxWidth()
                .height(46.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFF59E0B))
        ) {
            Icon(Icons.Default.Bolt, contentDescription = null)
            Spacer(modifier = Modifier.width(6.dp))
            Text("SIMULATE 5.2G CRASH SPIKE (DEMO)", fontWeight = FontWeight.Bold, fontSize = 11.sp)
        }

        Spacer(modifier = Modifier.height(14.dp))

        OutlinedButton(
            onClick = onOpenOperationsPortal,
            modifier = Modifier.fillMaxWidth().height(46.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF38BDF8))
        ) {
            Icon(Icons.Default.LocalHospital, contentDescription = null)
            Spacer(modifier = Modifier.width(6.dp))
            Text("AMBULANCE / HOSPITAL OPERATIONS PORTAL", fontWeight = FontWeight.Bold, fontSize = 11.sp)
        }

        Spacer(modifier = Modifier.height(10.dp))

        Button(
            onClick = onOpenCitizenWebPortal,
            modifier = Modifier.fillMaxWidth().height(48.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7))
        ) {
            Icon(Icons.Default.AccountBox, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text("CITIZEN MEDICAL VAULT & REGISTRATION", fontWeight = FontWeight.Bold, fontSize = 11.sp)
        }

        Spacer(modifier = Modifier.height(14.dp))

        // Environment & Backend URL Config Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF0C1220)),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                Text("Environment & Backend Bridge", color = Color(0xFF94A3B8), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(6.dp))

                // Environment selector buttons
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Button(
                        onClick = { onSelectEnvironment(AppEnvironment.LOCAL_LAN); backendUrlInput = ApiClient.getBaseUrl() },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1E293B)),
                        contentPadding = PaddingValues(2.dp)
                    ) {
                        Text("LAN IP", fontSize = 9.sp, color = Color(0xFF38BDF8))
                    }
                    Button(
                        onClick = { onSelectEnvironment(AppEnvironment.EMULATOR); backendUrlInput = ApiClient.getBaseUrl() },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1E293B)),
                        contentPadding = PaddingValues(2.dp)
                    ) {
                        Text("EMULATOR", fontSize = 9.sp, color = Color(0xFF38BDF8))
                    }
                    Button(
                        onClick = { onSelectEnvironment(AppEnvironment.PRODUCTION); backendUrlInput = ApiClient.getBaseUrl() },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1E293B)),
                        contentPadding = PaddingValues(2.dp)
                    ) {
                        Text("PROD", fontSize = 9.sp, color = Color(0xFF38BDF8))
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = backendUrlInput,
                    onValueChange = { backendUrlInput = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Custom Server URL", fontSize = 10.sp) },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color(0xFFCBD5E1)
                    )
                )
                Spacer(modifier = Modifier.height(6.dp))
                Button(
                    onClick = { onUpdateBackendUrl(backendUrlInput) },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1E293B)),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text("SAVE SERVER URL", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color(0xFF38BDF8))
                }
            }
        }
    }
}
