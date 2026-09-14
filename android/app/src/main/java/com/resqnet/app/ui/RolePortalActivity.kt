package com.resqnet.app.ui

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.resqnet.app.data.api.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class RolePortalActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(
                colorScheme = darkColorScheme(
                    background = Color(0xFF060911),
                    surface = Color(0xFF0C1220),
                    primary = Color(0xFF38BDF8)
                )
            ) {
                Portal(
                    openMap = { url ->
                        if (!url.isNullOrBlank()) {
                            try {
                                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                            } catch (e: Exception) {
                                Toast.makeText(this, "Cannot open map: ${e.message}", Toast.LENGTH_SHORT).show()
                            }
                        }
                    },
                    dialPhone = { phone ->
                        if (!phone.isNullOrBlank()) {
                            try {
                                startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone")))
                            } catch (e: Exception) {
                                Toast.makeText(this, "Cannot dial: ${e.message}", Toast.LENGTH_SHORT).show()
                            }
                        }
                    },
                    openProtection = {
                        startActivity(Intent(this, MainActivity::class.java))
                    }
                )
            }
        }
    }
}

data class DemoHospitalCredential(
    val id: String,
    val name: String,
    val username: String,
    val pass: String,
    val traumaLevel: String
)

val PUNE_HOSPITALS = listOf(
    DemoHospitalCredential("HOSP-01", "Sassoon General Hospital / BJGMC", "sassoon_trauma01", "Sassoon@RQN26!", "Level 1 Trauma"),
    DemoHospitalCredential("HOSP-02", "Ruby Hall Clinic – Sassoon Road", "rubyhall_emergency01", "Ruby@RQN26#", "Level 1 Trauma"),
    DemoHospitalCredential("HOSP-03", "Jehangir Hospital", "jehangir_trauma01", "Jehangir@RQN26!", "Level 1 Trauma"),
    DemoHospitalCredential("HOSP-04", "Ranka Hospital", "ranka_emergency01", "Ranka@RQN26#", "Level 2 Trauma"),
    DemoHospitalCredential("HOSP-05", "Noble Hospital, Hadapsar", "noble_trauma01", "Noble@RQN26!", "Level 1 Trauma"),
    DemoHospitalCredential("HOSP-06", "Sancheti Hospital", "sancheti_trauma01", "Sancheti@RQN26#", "Level 1 Trauma"),
    DemoHospitalCredential("HOSP-07", "Deenanath Mangeshkar Hospital", "dmh_emergency01", "DMH@RQN26!p7", "Level 1 Trauma"),
    DemoHospitalCredential("HOSP-08", "Sahyadri Super Speciality – Nagar Rd", "sahyadri_emergency01", "Sahyadri@RQN26#", "Level 1 Trauma"),
    DemoHospitalCredential("HOSP-09", "AIMS Hospital, Aundh", "aims_emergency01", "AIMS@RQN26!", "Level 2 Trauma"),
    DemoHospitalCredential("HOSP-10", "Bharati Hospital & Research Centre", "bharati_trauma01", "Bharati@RQN26#", "Level 1 Trauma"),
    DemoHospitalCredential("HOSP-11", "Lokmanya Hospital, Pune", "lokmanya_trauma01", "Lokmanya@RQN26!", "Level 2 Trauma"),
    DemoHospitalCredential("HOSP-12", "Z Plus Accident Hospital, Hadapsar", "zplus_accident01", "ZPlus@RQN26#", "Level 1 Trauma"),
    DemoHospitalCredential("HOSP-13", "Metro Superspeciality & Trauma, Wagholi", "metro_trauma01", "Metro@RQN26!", "Level 1 Trauma"),
    DemoHospitalCredential("HOSP-14", "Global Multispeciality Hospital, Dighi", "global_emergency01", "Global@RQN26#", "Level 2 Trauma"),
    DemoHospitalCredential("HOSP-15", "YCM Hospital, Pimpri", "ycm_emergency01", "YCM@RQN26!", "Level 1 Trauma")
)

@Composable
private fun Portal(
    openMap: (String?) -> Unit,
    dialPhone: (String?) -> Unit,
    openProtection: () -> Unit
) {
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var selectedHospName by remember { mutableStateOf<String?>(null) }
    var showHospSheet by remember { mutableStateOf(false) }
    var token by remember { mutableStateOf<String?>(null) }
    var user by remember { mutableStateOf<SessionUser?>(null) }
    var alerts by remember { mutableStateOf<List<EmergencyAlertDto>>(emptyList()) }
    var userIncidents by remember { mutableStateOf<List<IncidentDto>>(emptyList()) }
    var status by remember { mutableStateOf("Ready") }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val auth = token?.let { "Bearer $it" }

    fun refresh() {
        if (auth == null || user == null) return
        scope.launch {
            try {
                if (user!!.role == "USER") {
                    userIncidents = ApiClient.api.getMyIncidents(auth).body().orEmpty()
                    status = "Emergency Protection: ACTIVE\nIntake Profile: ARMED\nNetwork: CONNECTED"
                } else {
                    alerts = ApiClient.api.getPendingAlerts(auth).body().orEmpty()
                    status = if (user!!.role == "AMBULANCE") {
                        ApiClient.api.getAmbulance(user!!.resourceId ?: "AMB-01", auth).body()?.let {
                            "${it.code ?: it.id} · Status: ${it.status ?: "AVAILABLE"}\nGPS: ${it.lat ?: "LIVE"}, ${it.lng ?: "LIVE"}\nMission: ${it.currentIncidentId ?: "Standby"}"
                        } ?: "Unit Active & Standing By"
                    } else {
                        ApiClient.api.getHospital(user!!.resourceId ?: "HOSP-01", auth).body()?.let {
                            "${it.name ?: "Trauma Center"}\nLevel ${it.traumaLevel ?: 1} Trauma Center · Status: ${it.status ?: "AVAILABLE"}\nCapacity: ${it.emergencyCapacity ?: "8"} Available Bays\nAddress: ${it.address ?: "Pune"}\nPhone: ${it.phone ?: "+91 20 2612 8000"}"
                        } ?: "Hospital Trauma Center Online"
                    }
                }
            } catch (e: Exception) {
                error = e.message ?: "Network refresh failed"
            }
        }
    }

    LaunchedEffect(token) {
        if (token != null) {
            while (true) {
                refresh()
                delay(6000)
            }
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(Color(0xFF060911))
            .padding(18.dp)
            .verticalScroll(rememberScrollState())
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    "RESQNET AI",
                    color = Color.White,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Black,
                    fontFamily = FontFamily.Monospace
                )
                Text(
                    if (user == null) "OPERATIONS LOGIN" else "${user!!.role.replace('_', ' ')} COMMAND PORTAL",
                    color = Color(0xFF38BDF8),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
            }
            if (user != null) {
                Button(
                    onClick = {
                        token = null
                        user = null
                        alerts = emptyList()
                        userIncidents = emptyList()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1E293B)),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                ) {
                    Text("LOG OUT", fontSize = 11.sp, color = Color(0xFF94A3B8))
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        if (error != null) {
            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFF450A0A)),
                modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)
            ) {
                Text(error!!, color = Color(0xFFFCA5A5), fontSize = 12.sp, modifier = Modifier.padding(10.dp))
            }
        }

        if (user == null) {
            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFF0C1220)),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(Modifier.padding(18.dp)) {
                    Text("Portal Sign-In", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    Spacer(Modifier.height(12.dp))

                    // Quick Pune Hospital Auto-Fill Selector
                    Card(
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF070C16)),
                        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF1E293B)),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.fillMaxWidth().padding(bottom = 14.dp)
                    ) {
                        Column(Modifier.padding(10.dp)) {
                            Text(
                                "⚡ QUICK PUNE HOSPITAL LOGIN (15 CENTERS)",
                                color = Color(0xFF38BDF8),
                                fontSize = 10.sp,
                                fontWeight = FontWeight.ExtraBold
                            )
                            Spacer(Modifier.height(6.dp))
                            Button(
                                onClick = { showHospSheet = !showHospSheet },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1E293B)),
                                modifier = Modifier.fillMaxWidth(),
                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp)
                            ) {
                                Text(
                                    selectedHospName ?: "Select Hospital to Auto-Fill Credentials ▼",
                                    fontSize = 11.sp,
                                    color = Color.White,
                                    maxLines = 1
                                )
                            }

                            if (showHospSheet) {
                                Spacer(Modifier.height(8.dp))
                                Column(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .heightIn(max = 220.dp)
                                        .verticalScroll(rememberScrollState())
                                ) {
                                    PUNE_HOSPITALS.forEach { h ->
                                        Surface(
                                            onClick = {
                                                username = h.username
                                                password = h.pass
                                                selectedHospName = h.name
                                                showHospSheet = false
                                            },
                                            color = if (username == h.username) Color(0xFF0369A1) else Color(0xFF0F172A),
                                            shape = RoundedCornerShape(6.dp),
                                            modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp)
                                        ) {
                                            Row(
                                                modifier = Modifier.padding(8.dp),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Column(modifier = Modifier.weight(1f)) {
                                                    Text(h.name, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                                    Text("${h.username} · ${h.traumaLevel}", color = Color(0xFF94A3B8), fontSize = 10.sp)
                                                }
                                                Text("FILL", color = Color(0xFF38BDF8), fontSize = 10.sp, fontWeight = FontWeight.ExtraBold)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    OutlinedTextField(
                        value = username,
                        onValueChange = { username = it },
                        label = { Text("Username") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        label = { Text("Password") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation()
                    )
                    Spacer(Modifier.height(14.dp))
                    Button(
                        onClick = {
                            scope.launch {
                                try {
                                    val r = ApiClient.api.login(LoginRequest(username.trim(), password.trim()))
                                    if (r.isSuccessful && r.body() != null) {
                                        token = r.body()!!.token
                                        user = r.body()!!.user
                                        error = null
                                        refresh()
                                    } else {
                                        error = "Login failed: Check credentials"
                                    }
                                } catch (e: Exception) {
                                    error = "Backend connection error: ${e.message}"
                                }
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF38BDF8))
                    ) {
                        Text("AUTHENTICATE & OPEN PORTAL", color = Color(0xFF060911), fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "Demo credentials: ambulance1 / operator / user1",
                        color = Color(0xFF64748B),
                        fontSize = 11.sp
                    )
                }
            }
        } else {
            // Telemetry & Status
            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFF0C1220)),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(Modifier.padding(14.dp)) {
                    Text("UNIT TELEMETRY & STATUS", color = Color(0xFF38BDF8), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(4.dp))
                    Text(status, color = Color.White, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
                }
            }

            Spacer(Modifier.height(16.dp))

            if (user!!.role == "USER") {
                Button(
                    onClick = openProtection,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444))
                ) {
                    Text("OPEN SENSOR CRASH SHIELD", fontWeight = FontWeight.Bold)
                }
            } else {
                Text(
                    if (user!!.role == "AMBULANCE") "DISPATCH MISSIONS & DUAL-GPS" else "TRAUMA PRE-ALERTS & PATIENT PROFILES",
                    color = Color(0xFFEF4444),
                    fontWeight = FontWeight.Black,
                    fontSize = 13.sp
                )
                Spacer(Modifier.height(8.dp))

                if (alerts.isEmpty()) {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF0C1220)),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            Modifier.padding(24.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                if (user!!.role == "AMBULANCE") "Unit Available & Standing By" else "No Active Trauma Pre-Alerts",
                                color = Color.White,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                "Emergency dispatches will appear here instantly.",
                                color = Color(0xFF64748B),
                                fontSize = 12.sp
                            )
                        }
                    }
                }

                alerts.forEach { alert ->
                    AlertCard(
                        alert = alert,
                        role = user!!.role,
                        openMap = openMap,
                        dialPhone = dialPhone,
                        onAction = { action, reason ->
                            scope.launch {
                                val r = when (action) {
                                    "accept" -> ApiClient.api.acceptDispatch(alert.incidentId, auth!!)
                                    "reject" -> ApiClient.api.rejectDispatch(alert.incidentId, auth!!, mapOf("reason" to reason))
                                    else -> ApiClient.api.acknowledgeHospitalAlert(alert.incidentId, auth!!)
                                }
                                if (!r.isSuccessful) error = "Action failed"
                                refresh()
                            }
                        }
                    )
                    Spacer(Modifier.height(12.dp))
                }
            }
        }

        error?.let {
            Spacer(Modifier.height(10.dp))
            Text(it, color = Color(0xFFEF4444), fontSize = 12.sp)
        }
    }
}

@Composable
private fun AlertCard(
    alert: EmergencyAlertDto,
    role: String,
    openMap: (String?) -> Unit,
    dialPhone: (String?) -> Unit,
    onAction: (String, String) -> Unit
) {
    var rejecting by remember { mutableStateOf(false) }
    var reason by remember { mutableStateOf("") }
    val isHospitalAck = alert.acknowledged == true
    val isAmbAccepted = alert.accepted == true || alert.status == "EN_ROUTE"

    val pSceneLat = alert.accidentLatitude ?: 18.5308
    val pSceneLng = alert.accidentLongitude ?: 73.8290
    val pHospLat = alert.hospitalLatitude ?: 18.5280
    val pHospLng = alert.hospitalLongitude ?: 73.8720
    val hospName = alert.destinationHospital ?: alert.assignedHospital ?: "Pune Trauma Center"

    val sceneMapUrl = alert.mapUrl ?: "https://www.google.com/maps/dir/?api=1&destination=$pSceneLat,$pSceneLng"
    val hospMapUrl = alert.hospitalMapUrl ?: "https://www.google.com/maps/dir/?api=1&destination=$pHospLat,$pHospLng"

    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFF131A2B)),
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, if (role == "HOSPITAL" && isHospitalAck) Color(0xFF10B981) else Color(0xFFEF4444), RoundedCornerShape(14.dp))
    ) {
        Column(Modifier.padding(16.dp)) {
            // Header
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    if (role == "AMBULANCE") "🚨 EMERGENCY DISPATCH" else "🚨 INCOMING TRAUMA ALERT",
                    color = Color(0xFFEF4444),
                    fontWeight = FontWeight.Black,
                    fontSize = 13.sp
                )
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .background(if (role == "HOSPITAL" && isHospitalAck) Color(0xFF065F46) else Color(0xFF7F1D1D))
                        .padding(horizontal = 8.dp, vertical = 3.dp)
                ) {
                    Text(
                        if (role == "HOSPITAL" && isHospitalAck) "BAY PREPARED" else (alert.priority ?: "CRITICAL"),
                        color = Color.White,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            Spacer(Modifier.height(8.dp))
            Text("Incident ID: ${alert.incidentId}", color = Color.White, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
            Text(alert.helpMessage ?: "Automated Multi-Sensor Collision Trigger", color = Color(0xFF94A3B8), fontSize = 12.sp)

            Spacer(Modifier.height(12.dp))

            // =========================================================================
            // AMBULANCE VIEW: DUAL LIVE GPS (PATIENT SCENE + DESTINATION HOSPITAL)
            // =========================================================================
            if (role == "AMBULANCE") {
                Text("DUAL LIVE GPS WAYPOINTS", color = Color(0xFF38BDF8), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(6.dp))

                // Waypoint 1: Patient Scene GPS
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF0C1220)),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
                ) {
                    Column(Modifier.padding(10.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("📍 WAYPOINT 1: PATIENT CRASH SCENE", color = Color(0xFFEF4444), fontWeight = FontWeight.Bold, fontSize = 11.sp)
                        }
                        Text("GPS: $pSceneLat, $pSceneLng", color = Color.White, fontFamily = FontFamily.Monospace, fontSize = 11.sp)
                        Text("ETA: ${alert.etaMinutes ?: 4} min · Distance: ${alert.distanceKm ?: 3.2} km", color = Color(0xFFCBD5E1), fontSize = 11.sp)
                        Spacer(Modifier.height(6.dp))
                        Button(
                            onClick = { openMap(sceneMapUrl) },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444)),
                            modifier = Modifier.fillMaxWidth(),
                            contentPadding = PaddingValues(vertical = 6.dp)
                        ) {
                            Text("🚗 NAVIGATE TO PATIENT SCENE (MAPS)", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }

                // Waypoint 2: Destination Hospital GPS
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF0C1220)),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
                ) {
                    Column(Modifier.padding(10.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("🏥 WAYPOINT 2: DESTINATION HOSPITAL", color = Color(0xFF10B981), fontWeight = FontWeight.Bold, fontSize = 11.sp)
                        }
                        Text(hospName, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                        Text("GPS: $pHospLat, $pHospLng", color = Color.White, fontFamily = FontFamily.Monospace, fontSize = 11.sp)
                        Text(alert.hospitalAddress ?: "Level-1 Trauma & Emergency Resuscitation Bay", color = Color(0xFFCBD5E1), fontSize = 11.sp)
                        Spacer(Modifier.height(6.dp))
                        Button(
                            onClick = { openMap(hospMapUrl) },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981)),
                            modifier = Modifier.fillMaxWidth(),
                            contentPadding = PaddingValues(vertical = 6.dp)
                        ) {
                            Text("🏥 NAVIGATE TO HOSPITAL (MAPS)", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }

                Spacer(Modifier.height(10.dp))

                // Ambulance Action Buttons
                if (!isAmbAccepted) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { onAction("accept", "") },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981)),
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("ACCEPT DISPATCH", fontWeight = FontWeight.Bold, fontSize = 11.sp)
                        }
                        OutlinedButton(
                            onClick = { rejecting = !rejecting },
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("REJECT", fontSize = 11.sp)
                        }
                    }
                    if (rejecting) {
                        Spacer(Modifier.height(8.dp))
                        OutlinedTextField(
                            value = reason,
                            onValueChange = { reason = it },
                            label = { Text("Rejection reason (traffic/delayed)") },
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(Modifier.height(4.dp))
                        Button(
                            onClick = { if (reason.isNotBlank()) onAction("reject", reason) },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("CONFIRM REJECTION", fontWeight = FontWeight.Bold, fontSize = 11.sp)
                        }
                    }
                } else {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color(0xFF065F46))
                            .padding(10.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("✓ ACTIVE MISSION EN ROUTE", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                }
            }

            // =========================================================================
            // HOSPITAL VIEW: PATIENT CLINICAL DOSSIER ON ACKNOWLEDGEMENT
            // =========================================================================
            if (role == "HOSPITAL") {
                // Inbound Unit & Trauma Stats
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(
                        Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color(0xFF0C1220))
                            .padding(8.dp)
                    ) {
                        Column {
                            Text("INBOUND AMBULANCE", color = Color(0xFF64748B), fontSize = 9.sp, fontWeight = FontWeight.Bold)
                            Text(alert.incomingAmbulance ?: "AMB-01 (ALS Unit)", color = Color(0xFF38BDF8), fontWeight = FontWeight.Bold, fontSize = 12.sp)
                        }
                    }
                    Box(
                        Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color(0xFF0C1220))
                            .padding(8.dp)
                    ) {
                        Column {
                            Text("ESTIMATED ETA", color = Color(0xFF64748B), fontSize = 9.sp, fontWeight = FontWeight.Bold)
                            Text("${alert.etaMinutes ?: 4} MINUTES", color = Color(0xFFF59E0B), fontWeight = FontWeight.Bold, fontSize = 12.sp)
                        }
                    }
                }

                Spacer(Modifier.height(10.dp))

                // Patient Information Dossier (Filled from Intake / Google Form)
                val prof = alert.patientProfile
                val medSummary = alert.patientMedicalInfo ?: "Citizen Emergency Record Connected"

                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF0A101D)),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, Color(0xFF1E293B), RoundedCornerShape(10.dp))
                ) {
                    Column(Modifier.padding(12.dp)) {
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("📋 PATIENT CLINICAL DOSSIER (INTAKE FORM)", color = Color(0xFF38BDF8), fontSize = 11.sp, fontWeight = FontWeight.Black)
                            // Blood Group Badge
                            val blood = prof?.bloodGroup ?: "O+ POSITIVE"
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(Color(0xFFDC2626))
                                    .padding(horizontal = 8.dp, vertical = 2.dp)
                            ) {
                                Text("BLOOD: $blood", color = Color.White, fontWeight = FontWeight.Black, fontSize = 10.sp)
                            }
                        }

                        Spacer(Modifier.height(8.dp))

                        val patName = prof?.fullName ?: "Citizen Patient (Registered Profile)"
                        Text("Patient Name: $patName", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                        if (prof?.gender != null || prof?.dateOfBirth != null) {
                            Text("Gender / DOB: ${prof?.gender ?: "N/A"} · ${prof?.dateOfBirth ?: "N/A"}", color = Color(0xFF94A3B8), fontSize = 11.sp)
                        }

                        // Next-of-Kin Emergency Contact
                        val iceName = prof?.primaryContact?.name ?: "Family Next-of-Kin"
                        val icePhone = prof?.primaryContact?.phone ?: "+91 9876543210"
                        Spacer(Modifier.height(6.dp))
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(6.dp))
                                .background(Color(0xFF1E293B))
                                .padding(8.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text("EMERGENCY NEXT-OF-KIN", color = Color(0xFF64748B), fontSize = 9.sp, fontWeight = FontWeight.Bold)
                                Text("$iceName ($icePhone)", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                            Button(
                                onClick = { dialPhone(icePhone) },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF38BDF8)),
                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp)
                            ) {
                                Text("DIAL", fontSize = 10.sp, color = Color(0xFF060911), fontWeight = FontWeight.Bold)
                            }
                        }

                        Spacer(Modifier.height(6.dp))

                        // Allergies & Medical Conditions
                        val allergies = prof?.allergies?.joinToString(", ") ?: "None Reported"
                        val conditions = prof?.chronicConditions?.joinToString(", ") ?: "None Reported"
                        val meds = prof?.currentMedications ?: "None"

                        Text("⚠️ Known Allergies: $allergies", color = Color(0xFFFCA5A5), fontSize = 11.sp)
                        Text("🏥 Chronic Conditions: $conditions", color = Color(0xFFCBD5E1), fontSize = 11.sp)
                        Text("💊 Active Medications: $meds", color = Color(0xFFCBD5E1), fontSize = 11.sp)
                        if (!prof?.specialNotes.isNullOrBlank()) {
                            Text("📝 Clinical Notes: ${prof?.specialNotes}", color = Color(0xFFFDE047), fontSize = 11.sp)
                        }
                    }
                }

                Spacer(Modifier.height(10.dp))

                // Trauma Bay Directives
                Box(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(6.dp))
                        .background(Color(0xFF07101E))
                        .padding(8.dp)
                ) {
                    Text(
                        "✓ Trauma Bay Directives: Blood Bank reserved • CT Scanner locked • Surgery on standby.",
                        color = Color(0xFF4ADE80),
                        fontSize = 10.sp
                    )
                }

                Spacer(Modifier.height(12.dp))

                // Hospital Acknowledgement Action
                if (!isHospitalAck) {
                    Button(
                        onClick = { onAction("ack", "") },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("✓ ACKNOWLEDGE ALERT & PREP TRAUMA BAY", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                } else {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color(0xFF065F46))
                            .padding(10.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("✓ TRAUMA BAY PREPARED & CONFIRMED", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}
