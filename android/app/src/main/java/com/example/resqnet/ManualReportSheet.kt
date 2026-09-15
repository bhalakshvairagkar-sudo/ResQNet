package com.example.resqnet

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.resqnet.ui.theme.ResQColors

data class EmergencyOption(
    val label: String,
    val description: String,
    val icon: ImageVector,
    val color: Color
)

val emergencyOptions = listOf(
    EmergencyOption("Road Accident", "Vehicular crash, rollover or impact", Icons.Filled.CarCrash, ResQColors.Red),
    EmergencyOption("Medical Emergency", "Injury, unconsciousness, or illness", Icons.Filled.MedicalServices, ResQColors.Blue),
    EmergencyOption("Fire", "Vehicle or roadside fire", Icons.Filled.LocalFireDepartment, ResQColors.Orange),
    EmergencyOption("Other", "Any other roadside emergency", Icons.Filled.MoreHoriz, ResQColors.TextSecondary)
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ManualReportSheet(onDismiss: () -> Unit, onSelect: (String) -> Unit) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = ResQColors.Card
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Filled.Warning, contentDescription = null, tint = ResQColors.Red)
                    Text("Manual Emergency Report", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                "Select the emergency type to immediately alert dispatch with your location.",
                color = ResQColors.TextSecondary,
                fontSize = 12.sp
            )
            Spacer(modifier = Modifier.height(16.dp))

            emergencyOptions.forEach { option ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 10.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(ResQColors.Dark)
                        .border(1.dp, ResQColors.Border, RoundedCornerShape(16.dp))
                        .clickable { onSelect(option.label) }
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(option.color.copy(alpha = 0.15f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(option.icon, contentDescription = null, tint = option.color, modifier = Modifier.size(18.dp))
                    }
                    Column {
                        Text(option.label, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        Text(option.description, color = ResQColors.TextSecondary, fontSize = 10.sp)
                    }
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
        }
    }
}