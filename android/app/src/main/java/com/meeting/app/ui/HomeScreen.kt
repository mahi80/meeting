package com.meeting.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Videocam
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.meeting.app.AppViewModel
import com.meeting.app.data.CreatedMeeting
import com.meeting.app.ui.theme.Ink700
import com.meeting.app.ui.theme.Ink800
import com.meeting.app.ui.theme.Ink850
import com.meeting.app.ui.theme.Ink900
import com.meeting.app.ui.theme.Mist100
import com.meeting.app.ui.theme.Mist300
import com.meeting.app.ui.theme.Mist500
import com.meeting.app.ui.theme.Ok
import com.meeting.app.ui.theme.WhatsAppGreen
import com.meeting.app.ui.theme.ZoomBlue

@Composable
fun meetingFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = Mist100,
    unfocusedTextColor = Mist100,
    focusedBorderColor = ZoomBlue,
    unfocusedBorderColor = Ink700,
    cursorColor = ZoomBlue,
    focusedLabelColor = ZoomBlue,
    unfocusedLabelColor = Mist500,
    focusedContainerColor = Ink850,
    unfocusedContainerColor = Ink850,
)

@Composable
fun HomeScreen(viewModel: AppViewModel) {
    val busy by viewModel.busy.collectAsStateWithLifecycle()
    val created by viewModel.created.collectAsStateWithLifecycle()
    val joinInput by viewModel.joinInput.collectAsStateWithLifecycle()
    val displayName by viewModel.displayName.collectAsStateWithLifecycle()
    val serverUrl by viewModel.serverUrl.collectAsStateWithLifecycle()

    var title by remember { mutableStateOf("Meeting") }
    var createPasscode by remember { mutableStateOf(randomPasscode()) }
    var joinPasscode by remember { mutableStateOf("") }
    var settingsOpen by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .imePadding()
            .statusBarsPadding()
            .navigationBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp),
    ) {
        Spacer(Modifier.height(48.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .clip(CircleShape)
                    .background(ZoomBlue),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Rounded.Videocam, contentDescription = null, tint = Color.White, modifier = Modifier.size(30.dp))
            }
            Spacer(Modifier.width(14.dp))
            Column {
                Text("Meeting", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Text("Video, screen share and chat", color = Mist500, style = MaterialTheme.typography.bodySmall)
            }
        }

        Spacer(Modifier.height(32.dp))
        OutlinedTextField(
            value = displayName,
            onValueChange = viewModel::setDisplayName,
            label = { Text("Your name") },
            singleLine = true,
            colors = meetingFieldColors(),
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth(),
        )

        Spacer(Modifier.height(20.dp))
        SectionCard("Start a meeting", "Create a passcode-protected room and share the link.") {
            OutlinedTextField(
                value = title,
                onValueChange = { title = it },
                label = { Text("Meeting title") },
                singleLine = true,
                colors = meetingFieldColors(),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = createPasscode,
                onValueChange = { createPasscode = it.take(32) },
                label = { Text("Passcode") },
                singleLine = true,
                colors = meetingFieldColors(),
                shape = RoundedCornerShape(12.dp),
                trailingIcon = {
                    IconButton(onClick = { createPasscode = randomPasscode() }) {
                        Icon(Icons.Rounded.Refresh, contentDescription = "New passcode", tint = Mist300)
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(14.dp))
            Button(
                onClick = { viewModel.createMeeting(title, createPasscode) },
                enabled = !busy && createPasscode.length >= 4,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
            ) {
                if (busy) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White)
                } else {
                    Text("New meeting", fontWeight = FontWeight.SemiBold)
                }
            }
        }

        Spacer(Modifier.height(16.dp))
        SectionCard("Join a meeting", "Paste the invite link you received.") {
            OutlinedTextField(
                value = joinInput,
                onValueChange = {
                    viewModel.setJoinInput(it)
                    com.meeting.app.data.MeetingLink.parse(it)?.passcode?.let { found -> joinPasscode = found }
                },
                label = { Text("Meeting link or ID") },
                singleLine = true,
                colors = meetingFieldColors(),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = joinPasscode,
                onValueChange = { joinPasscode = it },
                label = { Text("Passcode") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
                colors = meetingFieldColors(),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(14.dp))
            OutlinedButton(
                onClick = { viewModel.joinMeeting(joinPasscode) },
                enabled = !busy && joinInput.isNotBlank(),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
            ) {
                Text("Join", fontWeight = FontWeight.SemiBold)
            }
        }

        Spacer(Modifier.height(20.dp))
        TextButton(onClick = { settingsOpen = true }, modifier = Modifier.align(Alignment.CenterHorizontally)) {
            Text("Server: $serverUrl", color = Mist500, style = MaterialTheme.typography.bodySmall)
        }
        Spacer(Modifier.height(24.dp))
    }

    created?.let { meeting ->
        CreatedMeetingDialog(
            meeting = meeting,
            busy = busy,
            onDismiss = viewModel::dismissCreated,
            onStart = viewModel::startHostMeeting,
        )
    }

    if (settingsOpen) {
        ServerDialog(
            current = serverUrl,
            onDismiss = { settingsOpen = false },
            onSave = {
                viewModel.setServerUrl(it)
                settingsOpen = false
            },
        )
    }
}

@Composable
private fun SectionCard(
    title: String,
    subtitle: String,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Ink900)
            .border(1.dp, Ink700, RoundedCornerShape(16.dp))
            .padding(16.dp),
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Text(subtitle, color = Mist500, style = MaterialTheme.typography.bodySmall)
        Spacer(Modifier.height(14.dp))
        content()
    }
}

@Composable
private fun CreatedMeetingDialog(
    meeting: CreatedMeeting,
    busy: Boolean,
    onDismiss: () -> Unit,
    onStart: () -> Unit,
) {
    val context = LocalContext.current
    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(20.dp))
                .background(Ink900)
                .padding(20.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.CheckCircle, contentDescription = null, tint = Ok)
                Spacer(Modifier.width(8.dp))
                Text("Meeting is ready", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(16.dp))
            Surface(color = Ink800, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp)) {
                    Text("INVITE LINK", color = Mist500, style = MaterialTheme.typography.labelSmall)
                    Spacer(Modifier.height(4.dp))
                    SelectionContainer {
                        Text(meeting.guestUrl, color = Mist100, style = MaterialTheme.typography.bodySmall)
                    }
                    Spacer(Modifier.height(8.dp))
                    Text("PASSCODE", color = Mist500, style = MaterialTheme.typography.labelSmall)
                    Text(meeting.passcode, color = Mist100, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                }
            }
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = {
                    shareToWhatsApp(
                        context,
                        inviteText(meeting.title, meeting.guestUrl, meeting.passcode),
                    )
                },
                colors = ButtonDefaults.buttonColors(containerColor = WhatsAppGreen, contentColor = Color.Black),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(46.dp),
            ) {
                Text("Share on WhatsApp", fontWeight = FontWeight.SemiBold)
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = {
                        copyToClipboard(
                            context,
                            "Meeting link",
                            inviteText(meeting.title, meeting.guestUrl, meeting.passcode),
                        )
                    },
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.weight(1f),
                ) {
                    Text("Copy link")
                }
                OutlinedButton(onClick = onDismiss, shape = RoundedCornerShape(12.dp), modifier = Modifier.weight(1f)) {
                    Text("Later")
                }
            }
            Spacer(Modifier.height(8.dp))
            Button(
                onClick = onStart,
                enabled = !busy,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
            ) {
                if (busy) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White)
                } else {
                    Text("Start meeting", fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
private fun ServerDialog(current: String, onDismiss: () -> Unit, onSave: (String) -> Unit) {
    var value by remember(current) { mutableStateOf(current) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Meeting server") },
        text = {
            Column {
                Text(
                    "Use your PC's LAN address, for example http://192.168.1.20:8787. The Android emulator uses http://10.0.2.2:8787.",
                    color = Mist300,
                    style = MaterialTheme.typography.bodySmall,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = value,
                    onValueChange = { value = it },
                    singleLine = true,
                    colors = meetingFieldColors(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onSave(value) }) { Text("Save") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

private fun randomPasscode(): String = (100000 + kotlin.random.Random.nextInt(900000)).toString()