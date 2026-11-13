package com.meeting.app.meeting

import android.content.Context
import android.content.Intent
import com.meeting.app.data.ChatMessage
import com.meeting.app.data.ParticipantUi
import io.livekit.android.LiveKit
import io.livekit.android.events.RoomEvent
import io.livekit.android.room.Room
import io.livekit.android.room.participant.Participant
import io.livekit.android.room.track.DataPublishReliability
import io.livekit.android.room.track.Track
import io.livekit.android.room.track.VideoTrack
import io.livekit.android.room.track.screencapture.ScreenCaptureParams
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class RoomController(context: Context) {
    private val appContext = context.applicationContext
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    var room: Room? = null
        private set

    val participants = MutableStateFlow<List<ParticipantUi>>(emptyList())
    val messages = MutableStateFlow<List<ChatMessage>>(emptyList())
    val micOn = MutableStateFlow(true)
    val camOn = MutableStateFlow(true)
    val sharing = MutableStateFlow(false)
    val connected = MutableStateFlow(false)
    val activeScreen = MutableStateFlow<VideoTrack?>(null)

    private var eventsJob: Job? = null
    private var tickerJob: Job? = null
    private val participantJobs = mutableMapOf<String, Job>()
    private val videoTracks = mutableMapOf<String, VideoTrack?>()
    private val screenTracks = mutableMapOf<String, VideoTrack?>()
    private val micStates = mutableMapOf<String, Boolean>()

    suspend fun connect(serverUrl: String, token: String, startMic: Boolean, startCam: Boolean) {
        disconnect()
        clearState()

        val newRoom = LiveKit.create(appContext)
        room = newRoom
        eventsJob = scope.launch { newRoom.events.collect { event -> onEvent(newRoom, event) } }

        newRoom.connect(serverUrl, token)
        connected.value = true

        newRoom.localParticipant.setMicrophoneEnabled(startMic)
        newRoom.localParticipant.setCameraEnabled(startCam)
        micOn.value = startMic
        camOn.value = startCam

        observe(newRoom.localParticipant, isLocal = true)
        newRoom.remoteParticipants.values.forEach { observe(it, isLocal = false) }
        sync(newRoom)

        tickerJob = scope.launch {
            while (isActive) {
                delay(600)
                room?.let(::sync)
            }
        }
    }

    suspend fun setMic(enabled: Boolean) {
        room?.localParticipant?.setMicrophoneEnabled(enabled)
        micOn.value = enabled
    }

    suspend fun setCamera(enabled: Boolean) {
        room?.localParticipant?.setCameraEnabled(enabled)
        camOn.value = enabled
    }

    suspend fun startScreenShare(permissionResult: Intent) {
        val target = room ?: return
        target.localParticipant.setScreenShareEnabled(
            true,
            ScreenCaptureParams(mediaProjectionPermissionResultData = permissionResult),
        )
        sharing.value = true
    }

    suspend fun stopScreenShare() {
        room?.localParticipant?.setScreenShareEnabled(false)
        sharing.value = false
    }

    suspend fun sendChat(text: String) {
        val target = room ?: return
        target.localParticipant.publishData(
            text.toByteArray(Charsets.UTF_8),
            DataPublishReliability.RELIABLE,
            CHAT_TOPIC,
            null,
        )
        messages.update {
            it + ChatMessage(
                id = "local-${System.nanoTime()}",
                sender = "You",
                text = text,
                timestamp = System.currentTimeMillis(),
                local = true,
            )
        }
    }

    fun disconnect() {
        val target = room
        room = null
        eventsJob?.cancel()
        tickerJob?.cancel()
        participantJobs.values.forEach { it.cancel() }
        participantJobs.clear()
        if (target != null) {
            scope.launch { runCatching { target.disconnect() } }
        }
        clearState()
        connected.value = false
    }

    private fun clearState() {
        participantJobs.values.forEach { it.cancel() }
        participantJobs.clear()
        videoTracks.clear()
        screenTracks.clear()
        micStates.clear()
        participants.value = emptyList()
        messages.value = emptyList()
        activeScreen.value = null
        sharing.value = false
        micOn.value = true
        camOn.value = true
    }

    private fun onEvent(room: Room, event: RoomEvent) {
        when (event) {
            is RoomEvent.ParticipantConnected -> {
                observe(event.participant, isLocal = false)
                sync(room)
            }
            is RoomEvent.ParticipantDisconnected -> {
                val key = event.participant.identity?.toString().orEmpty()
                participantJobs.remove(key)?.cancel()
                videoTracks.remove(key)
                screenTracks.remove(key)
                micStates.remove(key)
                sync(room)
            }
            is RoomEvent.TrackSubscribed,
            is RoomEvent.TrackUnsubscribed,
            is RoomEvent.TrackMuted,
            is RoomEvent.TrackUnmuted,
            is RoomEvent.LocalTrackPublished,
            is RoomEvent.LocalTrackUnpublished,
            is RoomEvent.ActiveSpeakersChanged -> sync(room)

            is RoomEvent.DataReceived -> {
                if (event.topic == CHAT_TOPIC) {
                    val text = event.data.toString(Charsets.UTF_8)
                    if (text.isNotBlank()) {
                        messages.update {
                            it + ChatMessage(
                                id = "remote-${System.nanoTime()}",
                                sender = event.participant?.name ?: "Guest",
                                text = text,
                                timestamp = System.currentTimeMillis(),
                                local = false,
                            )
                        }
                    }
                }
            }
            is RoomEvent.Reconnected -> {
                connected.value = true
                sync(room)
            }
            is RoomEvent.Reconnecting -> connected.value = false
            is RoomEvent.Disconnected -> connected.value = false
            else -> Unit
        }
    }

    private fun observe(participant: Participant, isLocal: Boolean) {
        val key = participant.identity?.toString() ?: return
        participantJobs[key]?.cancel()
        participantJobs[key] = scope.launch {
            combine(
                participant.videoTrackPublications,
                participant.audioTrackPublications,
            ) { videos, audios ->
                val camera = videos
                    .firstOrNull { (publication, track) ->
                        publication.source == Track.Source.CAMERA && track != null && !publication.isMuted
                    }
                    ?.second as? VideoTrack
                val screen = videos
                    .firstOrNull { (publication, track) ->
                        publication.source == Track.Source.SCREEN_SHARE && track != null
                    }
                    ?.second as? VideoTrack
                val mic = audios.any { (publication, track) -> track != null && !publication.isMuted }
                Triple(camera, screen, mic)
            }.collect { (camera, screen, mic) ->
                videoTracks[key] = camera
                screenTracks[key] = screen
                micStates[key] = mic
                if (isLocal) {
                    camOn.value = camera != null
                    sharing.value = screen != null
                }
                room?.let(::sync)
            }
        }
    }

    private fun sync(room: Room) {
        val local = room.localParticipant
        val list = buildList {
            add(local.toUi(isLocal = true))
            room.remoteParticipants.values.forEach { add(it.toUi(isLocal = false)) }
        }.sortedWith(compareByDescending<ParticipantUi> { it.isLocal }.thenBy { it.name.lowercase() })

        participants.value = list
        activeScreen.value = list.firstOrNull { it.screenTrack != null }?.screenTrack
    }

    private fun Participant.toUi(isLocal: Boolean): ParticipantUi {
        val key = identity?.toString().orEmpty()
        val video = videoTracks[key]
        return ParticipantUi(
            key = key,
            name = name?.takeIf { it.isNotBlank() } ?: if (isLocal) "You" else "Guest",
            isLocal = isLocal,
            isHost = metadata?.contains("\"host\"") == true || key.contains("host"),
            isSpeaking = isSpeaking,
            micOn = micStates[key] ?: !isLocal,
            videoTrack = video,
            screenTrack = screenTracks[key],
        )
    }

    companion object {
        private const val CHAT_TOPIC = "meet-chat"
    }
}