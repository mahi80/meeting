package com.meeting.app.ui

import android.app.Activity
import android.content.Context
import android.media.projection.MediaProjectionManager
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CallEnd
import androidx.compose.material.icons.rounded.ChatBubbleOutline
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.MicOff
import androidx.compose.material.icons.rounded.People
import androidx.compose.material.icons.rounded.ScreenShare
import androidx.compose.material.icons.rounded.Send
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.StopScreenShare
import androidx.compose.material.icons.rounded.Videocam
import androidx.compose.material.icons.rounded.VideocamOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.meeting.app.AppViewModel
import com.meeting.app.Screen
import com.meeting.app.data.ChatMessage
import com.meeting.app.data.ParticipantUi
import com.meeting.app.data.WaitingRequest
import com.meeting.app.ui.theme.Danger
import com.meeting.app.ui.theme.Ink700
import com.meeting.app.ui.theme.Ink800
import com.meeting.app.ui.theme.Ink900
import com.meeting.app.ui.theme.Ink950
import com.meeting.app.ui.theme.Mist100
import com.meeting.app.ui.theme.Mist300
import com.meeting.app.ui.theme.Mist500
import com.meeting.app.ui.theme.Ok
import com.meeting.app.ui.theme.WhatsAppGreen
import com.meeting.app.ui.theme.ZoomBlue
import io.livekit.android.room.Room
import io.livekit.android.room.track.VideoTrack
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private enum class Panel { Chat, People }

private val WarningAmber = Color(0xFFF5A524)
private val HostGold = Color(0xFFF5C451)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MeetingScreen(viewModel: AppViewModel, state: Screen.InMeeting) {
    val controller = viewModel.controller
    val participants by controller.participants.collectAsStateWithLifecycle()
    val messages by controller.messages.collectAsStateWithLifecycle()
    val micOn by controller.micOn.collectAsStateWithLifecycle()
    val camOn by controller.camOn.collectAsStateWithLifecycle()
    val sharing by controller.sharing.collectAsStateWithLifecycle()
    val connected by controller.connected.collectAsStateWithLifecycle()
    val activeScreen by controller.activeScreen.collectAsStateWithLifecycle()
    val waitingRequests by viewModel.waitingRequests.collectAsStateWithLifecycle()
    val room = controller.room

    var panel by remember { mutableStateOf<Panel?>(null) }
    var inviteOpen by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val projectionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            result.data?.let(viewModel::startScreenShare)
        }
    }

    BackHandler { viewModel.leaveMeeting() }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = Ink950,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            MeetingTopBar(
                title = state.title,
                meetingId = state.meetingId,
                count = participants.size,
                isHost = state.role == "host",
            )
        },
        bottomBar = {
            MeetingToolbar(
                micOn = micOn,
                camOn = camOn,
                sharing = sharing,
                canInvite = state.inviteUrl != null,
                onMic = viewModel::toggleMic,
                onCamera = viewModel::toggleCamera,
                onShare = {
                    if (sharing) {
                        viewModel.stopScreenShare()
                    } else {
                        val manager = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
                        projectionLauncher.launch(manager.createScreenCaptureIntent())                    }
                },
                onChat = { panel = Panel.Chat },
                onPeople = { panel = Panel.People },
                onInvite = { inviteOpen = true },
                onLeave = viewModel::leaveMeeting,
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize(),
        ) {
            if (!connected) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(WarningAmber.copy(alpha = 0.18f))
                        .padding(vertical = 6.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("Reconnecting…", color = WarningAmber, fontSize = 12.sp)
                }
            }
            Box(modifier = Modifier.weight(1f)) {
                val screen = activeScreen
                if (screen != null && room != null) {
                    ScreenStage(
                        room = room,
                        screenTrack = screen,
                        participants = participants,
                        localSharing = sharing,
                        onStop = viewModel::stopScreenShare,
                    )
                } else {
                    Gallery(participants = participants, room = room)
                }
            }
        }
    }

    when (panel) {
        Panel.Chat -> ChatSheet(
            messages = messages,
            onSend = viewModel::sendChat,
            onDismiss = { panel = null },
        )
        Panel.People -> PeopleSheet(
            participants = participants,
            waiting = waitingRequests,
            isHost = state.role == "host",
            inviteUrl = state.inviteUrl,
            passcode = state.passcode,
            title = state.title,
            onDecide = viewModel::decide,
            onDismiss = { panel = null },
        )
        null -> Unit
    }

    if (inviteOpen && state.inviteUrl != null) {
        InviteDialog(
            title = state.title,
            url = state.inviteUrl,
            passcode = state.passcode,
            onDismiss = { inviteOpen = false },
        )
    }
}

@Composable
private fun MeetingTopBar(title: String, meetingId: String, count: Int, isHost: Boolean) {
    Surface(color = Ink900, shadowElevation = 2.dp) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    title,
                    color = Mist100,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text("ID: $meetingId", color = Mist500, fontSize = 11.sp)
            }
            if (isHost) {
                Surface(color = ZoomBlue.copy(alpha = 0.16f), shape = RoundedCornerShape(6.dp)) {
                    Text(
                        "HOST",
                        color = ZoomBlue,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp),
                    )
                }
                Spacer(Modifier.width(10.dp))
            }
            Icon(Icons.Rounded.People, contentDescription = null, tint = Mist300, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(5.dp))
            Text("$count", color = Mist300, fontSize = 13.sp)
        }
    }
}

@Composable
private fun MeetingToolbar(
    micOn: Boolean,
    camOn: Boolean,
    sharing: Boolean,
    canInvite: Boolean,
    onMic: () -> Unit,
    onCamera: () -> Unit,
    onShare: () -> Unit,
    onChat: () -> Unit,
    onPeople: () -> Unit,
    onInvite: () -> Unit,
    onLeave: () -> Unit,
) {
    Surface(color = Ink900) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 4.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            ToolButton(if (micOn) Icons.Rounded.Mic else Icons.Rounded.MicOff, if (micOn) "Mute" else "Unmute", !micOn, onMic)
            ToolButton(if (camOn) Icons.Rounded.Videocam else Icons.Rounded.VideocamOff, if (camOn) "Stop video" else "Start video", !camOn, onCamera)
            ToolButton(
                if (sharing) Icons.Rounded.StopScreenShare else Icons.Rounded.ScreenShare,
                if (sharing) "Stop share" else "Share",
                sharing,
                onShare,
            )
            ToolButton(Icons.Rounded.ChatBubbleOutline, "Chat", false, onChat)
            ToolButton(Icons.Rounded.People, "People", false, onPeople)
            if (canInvite) {
                ToolButton(Icons.Rounded.Link, "Invite", false, onInvite)
            }
            ToolButton(Icons.Rounded.CallEnd, "Leave", false, onLeave, danger = true)
        }
    }
}

@Composable
private fun RowScope.ToolButton(
    icon: ImageVector,
    label: String,
    active: Boolean,
    onClick: () -> Unit,
    danger: Boolean = false,
) {
    Column(modifier = Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            modifier = Modifier
                .size(46.dp)
                .clip(CircleShape)
                .background(
                    when {
                        danger -> Danger
                        active -> ZoomBlue
                        else -> Ink800
                    },
                )
                .clickable(onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = label, tint = Color.White, modifier = Modifier.size(21.dp))
        }
        Spacer(Modifier.height(3.dp))
        Text(label, color = Mist300, fontSize = 10.sp, maxLines = 1)
    }
}

@Composable
private fun Gallery(participants: List<ParticipantUi>, room: Room?) {
    if (room == null || participants.isEmpty()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = ZoomBlue)
        }
        return
    }

    BoxWithConstraints(modifier = Modifier.fillMaxSize().padding(8.dp)) {
        val landscape = maxWidth > maxHeight
        if (participants.size == 1) {
            VideoTile(participants.first(), room, Modifier.fillMaxSize())
        } else {
            LazyVerticalGrid(
                columns = GridCells.Fixed(if (landscape) 3 else 2),
                modifier = Modifier.fillMaxSize(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(participants, key = { it.key }) { participant ->
                    VideoTile(
                        participant = participant,
                        room = room,
                        modifier = Modifier
                            .fillMaxWidth()
                            .aspectRatio(if (landscape) 16f / 9f else 3f / 4f),
                    )
                }
            }
        }
    }
}

@Composable
private fun ScreenStage(
    room: Room,
    screenTrack: VideoTrack,
    participants: List<ParticipantUi>,
    localSharing: Boolean,
    onStop: () -> Unit,
) {
    val owner = participants.firstOrNull { it.screenTrack == screenTrack }
    Column(modifier = Modifier.fillMaxSize()) {
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(8.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(Color.Black)
                .border(1.dp, Ok.copy(alpha = 0.45f), RoundedCornerShape(12.dp)),
        ) {
            VideoSurface(room, screenTrack, Modifier.fillMaxSize())
            Row(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(8.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color.Black.copy(alpha = 0.7f))
                    .padding(horizontal = 8.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Rounded.ScreenShare, contentDescription = null, tint = Ok, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(6.dp))
                Text(
                    if (localSharing) "You are sharing your screen" else "${owner?.name ?: "Someone"} is sharing",
                    color = Mist100,
                    fontSize = 11.sp,
                )
                if (localSharing) {
                    Spacer(Modifier.width(6.dp))
                    TextButton(
                        onClick = onStop,
                        contentPadding = PaddingValues(horizontal = 6.dp, vertical = 0.dp),
                    ) {
                        Text("Stop", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
        LazyRow(
            modifier = Modifier
                .fillMaxWidth()
                .height(96.dp)
                .padding(horizontal = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            items(participants, key = { it.key }) { participant ->
                VideoTile(
                    participant = participant,
                    room = room,
                    modifier = Modifier
                        .width(128.dp)
                        .height(80.dp),
                    compact = true,
                )
            }
        }
    }
}

@Composable
fun VideoTile(
    participant: ParticipantUi,
    room: Room,
    modifier: Modifier = Modifier,
    compact: Boolean = false,
) {
    val shape = RoundedCornerShape(if (compact) 10.dp else 14.dp)
    Box(
        modifier = modifier
            .clip(shape)
            .background(Ink800)
            .border(
                width = if (participant.isSpeaking && !compact) 2.dp else 1.dp,
                color = if (participant.isSpeaking) Ok else Ink700,
                shape = shape,
            ),
    ) {
        val track = participant.videoTrack
        if (track != null) {
            VideoSurface(room, track, Modifier.fillMaxSize())
        } else {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Avatar(participant.name, if (compact) 28 else 64)
            }
        }

        Row(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .background(
                    Brush.verticalGradient(
                        listOf(Color.Transparent, Color.Black.copy(alpha = 0.72f)),
                    ),
                )
                .padding(
                    horizontal = if (compact) 6.dp else 8.dp,
                    vertical = if (compact) 4.dp else 8.dp,
                ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                if (participant.micOn) Icons.Rounded.Mic else Icons.Rounded.MicOff,
                contentDescription = null,
                tint = if (participant.micOn) Mist300 else Danger,
                modifier = Modifier.size(if (compact) 10.dp else 13.dp),
            )
            Spacer(Modifier.width(4.dp))
            Text(
                participant.name + if (participant.isLocal) " (You)" else "",
                color = Mist100,
                fontSize = if (compact) 9.sp else 11.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            if (participant.isHost) {
                Spacer(Modifier.width(3.dp))
                Icon(
                    Icons.Rounded.Star,
                    contentDescription = "Host",
                    tint = HostGold,
                    modifier = Modifier.size(if (compact) 9.dp else 12.dp),
                )
            }
        }
    }
}

@Composable
private fun Avatar(name: String, size: Int) {
    val palette = listOf(
        Color(0xFF2D8CFF),
        Color(0xFF9B5DE5),
        Color(0xFF2FBF71),
        Color(0xFFF5A524),
        Color(0xFFE5678F),
    )
    val background = palette[(name.hashCode() and Int.MAX_VALUE) % palette.size]
    Box(
        modifier = Modifier
            .size(size.dp)
            .clip(CircleShape)
            .background(background.copy(alpha = 0.3f)),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            initials(name),
            color = Mist100,
            fontWeight = FontWeight.SemiBold,
            fontSize = (size * 0.36f).sp,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChatSheet(messages: List<ChatMessage>, onSend: (String) -> Unit, onDismiss: () -> Unit) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val listState = rememberLazyListState()
    var draft by remember { mutableStateOf("") }

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) listState.animateScrollToItem(messages.lastIndex)
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, containerColor = Ink900) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.8f)
                .padding(horizontal = 16.dp)
                .navigationBarsPadding(),
        ) {
            Text("Chat", color = Mist100, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(10.dp))
            if (messages.isEmpty()) {
                Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Text("No messages yet", color = Mist500, fontSize = 13.sp)
                }
            } else {
                LazyColumn(state = listState, modifier = Modifier.weight(1f).fillMaxWidth()) {
                    items(messages, key = { it.id }) { message ->
                        MessageRow(message)
                        Spacer(Modifier.height(12.dp))
                    }
                }
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedTextField(
                    value = draft,
                    onValueChange = { draft = it },
                    placeholder = { Text("Message everyone", color = Mist500, fontSize = 13.sp) },
                    maxLines = 4,
                    colors = meetingFieldColors(),
                    shape = RoundedCornerShape(20.dp),
                    modifier = Modifier.weight(1f),
                )
                IconButton(
                    onClick = {
                        if (draft.isNotBlank()) {
                            onSend(draft)
                            draft = ""
                        }
                    },
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(ZoomBlue),
                ) {
                    Icon(Icons.Rounded.Send, contentDescription = "Send message", tint = Color.White)
                }
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun MessageRow(message: ChatMessage) {
    Row(modifier = Modifier.fillMaxWidth()) {
        Avatar(message.sender, 30)
        Spacer(Modifier.width(8.dp))
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(message.sender, color = Mist100, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.width(6.dp))
                Text(formatTime(message.timestamp), color = Mist500, fontSize = 10.sp)
            }
            Spacer(Modifier.height(2.dp))
            Text(message.text, color = Mist300, fontSize = 13.sp)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PeopleSheet(
    participants: List<ParticipantUi>,
    waiting: List<WaitingRequest>,
    isHost: Boolean,
    inviteUrl: String?,
    passcode: String?,
    title: String,
    onDecide: (String, Boolean) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val context = LocalContext.current

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, containerColor = Ink900) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.85f)
                .padding(horizontal = 16.dp)
                .navigationBarsPadding(),
        ) {
            Text("People", color = Mist100, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(12.dp))

            if (isHost) {
                Text("WAITING TO JOIN (${waiting.size})", color = Mist500, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(6.dp))
                if (waiting.isEmpty()) {
                    Text(
                        "No one is waiting. Share the invite link to bring people in.",
                        color = Mist500,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(bottom = 12.dp),
                    )
                } else {
                    waiting.forEach { request ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Avatar(request.name, 34)
                            Spacer(Modifier.width(10.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(request.name, color = Mist100, fontSize = 13.sp)
                                Text("Guest", color = Mist500, fontSize = 11.sp)
                            }
                            Button(
                                onClick = { onDecide(request.id, true) },
                                shape = RoundedCornerShape(10.dp),
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                                modifier = Modifier.height(34.dp),
                            ) {
                                Text("Admit", fontSize = 12.sp)
                            }
                            Spacer(Modifier.width(4.dp))
                            TextButton(onClick = { onDecide(request.id, false) }) {
                                Text("Deny", color = Mist300, fontSize = 12.sp)
                            }
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                }
            }

            Text("IN THE MEETING (${participants.size})", color = Mist500, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(4.dp))
            LazyColumn(modifier = Modifier.weight(1f).fillMaxWidth()) {
                items(participants, key = { it.key }) { participant ->
                    ParticipantRow(participant)
                }
            }

            if (inviteUrl != null) {
                Spacer(Modifier.height(8.dp))
                Surface(color = Ink800, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text("INVITE PEOPLE", color = Mist500, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(4.dp))
                        SelectionContainer {
                            Text(inviteUrl, color = Mist300, fontSize = 11.sp)
                        }
                        if (!passcode.isNullOrBlank()) {
                            Text("Passcode: $passcode", color = Mist300, fontSize = 11.sp)
                        }
                        Spacer(Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(
                                onClick = { copyToClipboard(context, "Meeting invite", inviteText(title, inviteUrl, passcode)) },
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.weight(1f),
                            ) {
                                Icon(Icons.Rounded.ContentCopy, contentDescription = null, modifier = Modifier.size(14.dp))
                                Spacer(Modifier.width(6.dp))
                                Text("Copy", fontSize = 12.sp)
                            }
                            Button(
                                onClick = { shareToWhatsApp(context, inviteText(title, inviteUrl, passcode)) },
                                colors = ButtonDefaults.buttonColors(containerColor = WhatsAppGreen, contentColor = Color.Black),
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.weight(1f),
                            ) {
                                Text("WhatsApp", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }
                Spacer(Modifier.height(10.dp))
            }
        }
    }
}

@Composable
private fun ParticipantRow(participant: ParticipantUi) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(participant.name, 36)
        Spacer(Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    participant.name + if (participant.isLocal) " (You)" else "",
                    color = Mist100,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                )
                if (participant.isHost) {
                    Spacer(Modifier.width(6.dp))
                    Text("HOST", color = HostGold, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                }
            }
            Text(if (participant.isHost) "Meeting host" else "Guest", color = Mist500, fontSize = 11.sp)
        }
        Icon(
            if (participant.micOn) Icons.Rounded.Mic else Icons.Rounded.MicOff,
            contentDescription = null,
            tint = if (participant.micOn) Mist500 else Danger,
            modifier = Modifier.size(16.dp),
        )
        Spacer(Modifier.width(10.dp))
        Icon(
            if (participant.videoTrack != null) Icons.Rounded.Videocam else Icons.Rounded.VideocamOff,
            contentDescription = null,
            tint = Mist500,
            modifier = Modifier.size(16.dp),
        )
    }
}

@Composable
private fun InviteDialog(title: String, url: String, passcode: String?, onDismiss: () -> Unit) {
    val context = LocalContext.current
    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(20.dp))
                .background(Ink900)
                .padding(20.dp),
        ) {
            Text("Invite people", color = Mist100, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(14.dp))
            Surface(color = Ink800, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text("INVITE LINK", color = Mist500, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(4.dp))
                    SelectionContainer {
                        Text(url, color = Mist100, fontSize = 12.sp)
                    }
                    if (!passcode.isNullOrBlank()) {
                        Spacer(Modifier.height(8.dp))
                        Text("PASSCODE", color = Mist500, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                        Text(passcode, color = Mist100, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = { shareToWhatsApp(context, inviteText(title, url, passcode)) },
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
                    onClick = { copyToClipboard(context, "Meeting invite", inviteText(title, url, passcode)) },
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.weight(1f),
                ) {
                    Text("Copy link")
                }
                OutlinedButton(onClick = onDismiss, shape = RoundedCornerShape(12.dp), modifier = Modifier.weight(1f)) {
                    Text("Close")
                }
            }
        }
    }
}

private fun initials(name: String): String {
    val parts = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
    return when {
        parts.isEmpty() -> "?"
        parts.size == 1 -> parts[0].take(2).uppercase()
        else -> (parts[0].take(1) + parts[1].take(1)).uppercase()
    }
}

private fun formatTime(timestamp: Long): String {
    val formatter = DateTimeFormatter.ofPattern("HH:mm")
    return formatter.format(Instant.ofEpochMilli(timestamp).atZone(ZoneId.systemDefault()))
}