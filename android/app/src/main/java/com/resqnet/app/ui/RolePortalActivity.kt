package com.resqnet.app.ui

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.lifecycleScope
import com.resqnet.app.data.api.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class RolePortalActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { MaterialTheme(colorScheme = darkColorScheme(background = Color(0xFF060911), surface = Color(0xFF0C1220), primary = Color(0xFF38BDF8))) { RolePortal(::openMap) } }
    }
    private fun openMap(url: String?) { if (!url.isNullOrBlank()) startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
}

@Composable
private fun RolePortal(openMap: (String?) -> Unit) {
    var username by remember { mutableStateOf("") }; var password by remember { mutableStateOf("") }
    var token by remember { mutableStateOf<String?>(null) }; var user by remember { mutableStateOf<SessionUser?>(null) }
    var alerts by remember { mutableStateOf<List<EmergencyAlertDto>>(emptyList()) }; var resource by remember { mutableStateOf("") }; var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val auth = token?.let { "Bearer $it" }
    fun refresh() { if (auth == null || user == null) return; scope.launch { try { alerts = ApiClient.api.getPendingAlerts(auth).body().orEmpty(); resource = when (user!!.role) { "AMBULANCE" -> ApiClient.api.getAmbulance(user!!.resourceId!!, auth).body()?.let { "${it.code ?: it.id} · ${it.status ?: "UNAVAILABLE"}\nLocation: ${it.lat ?: "UNAVAILABLE"}, ${it.lng ?: "UNAVAILABLE"}\nAssignment: ${it.currentIncidentId ?: "NONE"}" } ?: "UNAVAILABLE"; "HOSPITAL" -> ApiClient.api.getHospital(user!!.resourceId!!, auth).body()?.let { "${it.name ?: it.id}\n${it.status ?: "UNAVAILABLE"} · Trauma level ${it.traumaLevel ?: "UNAVAILABLE"}\nEmergency capacity: ${it.emergencyCapacity ?: "UNAVAILABLE"}" } ?: "UNAVAILABLE"; else -> "Unsupported role" } } catch (e: Exception) { error = e.message ?: "Unable to reach ResQNet" } } }
    LaunchedEffect(token) { if (token != null) while (true) { refresh(); delay(10_000) } }
    Column(Modifier.fillMaxSize().background(Color(0xFF060911)).padding(18.dp).verticalScroll(rememberScrollState())) {
        Text("RESQNET", color = Color.White, fontSize = 25.sp, fontWeight = FontWeight.Black, fontFamily = FontFamily.Monospace)
        Text(if (user == null) "OPERATIONS PORTAL SIGN-IN" else "${user!!.role.replace('_', ' ')} PORTAL", color = Color(0xFF38BDF8), fontSize = 11.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(18.dp))
        if (user == null) {
            OutlinedTextField(username, { username = it }, label = { Text("Username") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            Spacer(Modifier.height(8.dp)); OutlinedTextField(password, { password = it }, label = { Text("Password") }, modifier = Modifier.fillMaxWidth(), singleLine = true, visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation())
            Spacer(Modifier.height(12.dp)); Button(onClick = { scope.launch { val response = ApiClient.api.login(LoginRequest(username, password)); if (response.isSuccessful && response.body() != null) { token = response.body()!!.token; user = response.body()!!.user; error = null } else error = "Invalid credentials" } }, modifier = Modifier.fillMaxWidth()) { Text("SIGN IN") }
            Text("Use ambulance1 or hospital1 with the server-configured demo password.", color = Color(0xFF94A3B8), fontSize = 11.sp)
        } else {
            Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF0C1220)), shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp)) { Text("CURRENT STATUS", color = Color(0xFF94A3B8), fontSize = 11.sp, fontWeight = FontWeight.Bold); Spacer(Modifier.height(6.dp)); Text(resource, color = Color.White, fontFamily = FontFamily.Monospace) } }
            Spacer(Modifier.height(12.dp)); Text(if (user!!.role == "AMBULANCE") "EMERGENCY DISPATCHES" else "INCOMING TRAUMA ALERTS", color = Color(0xFFEF4444), fontWeight = FontWeight.Black)
            if (alerts.isEmpty()) Text("No pending targeted alerts.", color = Color(0xFF94A3B8), modifier = Modifier.padding(vertical = 16.dp))
            alerts.forEach { alert -> AlertCard(alert, user!!.role, openMap) { action, reason -> scope.launch { val result = when (action) { "accept" -> ApiClient.api.acceptDispatch(alert.incidentId, auth!!); "reject" -> ApiClient.api.rejectDispatch(alert.incidentId, auth!!, mapOf("reason" to reason)); else -> ApiClient.api.acknowledgeHospitalAlert(alert.incidentId, auth!!) }; if (!result.isSuccessful) error = "Action could not be completed"; refresh() } } }
            OutlinedButton(onClick = { token = null; user = null; alerts = emptyList() }, modifier = Modifier.fillMaxWidth()) { Text("LOG OUT") }
        }
        error?.let { Text(it, color = Color(0xFFEF4444), modifier = Modifier.padding(top = 12.dp)) }
    }
}

@Composable private fun AlertCard(alert: EmergencyAlertDto, role: String, openMap: (String?) -> Unit, action: (String, String) -> Unit) {
    var reject by remember { mutableStateOf(false) }; var reason by remember { mutableStateOf("") }
    Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF20111A)), shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) { Column(Modifier.padding(16.dp)) {
        Text(if (role == "AMBULANCE") "🚨 EMERGENCY DISPATCH" else "🚨 INCOMING TRAUMA ALERT", color = Color(0xFFEF4444), fontWeight = FontWeight.Black)
        Text("${alert.priority ?: "UNAVAILABLE"} · ${alert.incidentId}", color = Color.White, fontFamily = FontFamily.Monospace); Text("Location: ${alert.accidentLatitude ?: "UNAVAILABLE"}, ${alert.accidentLongitude ?: "UNAVAILABLE"}", color = Color(0xFFCBD5E1)); Text(alert.helpMessage ?: "NOT PROVIDED", color = Color(0xFFCBD5E1)); Text(if (role == "AMBULANCE") "Distance: ${alert.distanceKm ?: "UNAVAILABLE"} km · ETA: ${alert.etaMinutes ?: "UNAVAILABLE"} min" else "Incoming unit: ${alert.incomingAmbulance ?: "UNAVAILABLE"} · ETA: ${alert.etaMinutes ?: "UNAVAILABLE"} min\nPatient information: ${alert.patientCount ?: "NOT PROVIDED"}", color = Color(0xFFCBD5E1)); OutlinedButton(onClick = { openMap(alert.mapUrl) }) { Text("OPEN ACCIDENT LOCATION") }
        if (role == "AMBULANCE") { Row { Button(onClick = { action("accept", "") }, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981))) { Text("ACCEPT") }; Spacer(Modifier.width(8.dp)); OutlinedButton(onClick = { reject = !reject }) { Text("REJECT") } }; if (reject) { OutlinedTextField(reason, { reason = it }, label = { Text("Rejection reason") }); Button(onClick = { if (reason.isNotBlank()) action("reject", reason) }) { Text("CONFIRM REJECTION") } } } else Button(onClick = { action("ack", "") }, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981))) { Text("ACKNOWLEDGE ALERT") }
    } }
}
