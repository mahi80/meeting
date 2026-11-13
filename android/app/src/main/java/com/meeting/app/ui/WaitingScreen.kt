package com.meeting.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.meeting.app.AppViewModel
import com.meeting.app.Screen
import com.meeting.app.ui.theme.Ink800
import com.meeting.app.ui.theme.Mist100
import com.meeting.app.ui.theme.Mist300
import com.meeting.app.ui.theme.Mist500
import com.meeting.app.ui.theme.ZoomBlue

@Composable
fun WaitingScreen(viewModel: AppViewModel, state: Screen.Waiting) {
    val waiting = state.status == "pending" || state.status == "offline"
    val message = when (state.status) {
        "pending" -> "Waiting for the host to let you in"
        "offline" -> "Can't reach the server. Retrying…"
        "denied" -> "The host denied your request"
        "expired" -> "Your request expired. Ask the host to send the link again."
        else -> "Waiting for the host"
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(28.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                modifier = Modifier
                    .size(96.dp)
                    .clip(CircleShape)
                    .background(Ink800),
                contentAlignment = Alignment.Center,
            ) {
                if (waiting) {
                    CircularProgressIndicator(color = ZoomBlue, modifier = Modifier.size(40.dp))
                } else {
                    Icon(Icons.Rounded.Schedule, contentDescription = null, tint = Mist300, modifier = Modifier.size(40.dp))
                }
            }
            Spacer(Modifier.height(24.dp))
            Text(
                state.title,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = Mist100,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(10.dp))
            Text(
                message,
                color = if (waiting) Mist300 else Mist500,
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
            )
            if (waiting) {
                Spacer(Modifier.height(6.dp))
                Text(
                    "Keep this screen open — you'll join automatically.",
                    color = Mist500,
                    style = MaterialTheme.typography.bodySmall,
                    textAlign = TextAlign.Center,
                )
            }
            Spacer(Modifier.height(28.dp))
            OutlinedButton(
                onClick = viewModel::cancelWaiting,
                shape = RoundedCornerShape(12.dp),
            ) {
                Text(if (waiting) "Cancel" else "Back")
            }
        }
    }
}