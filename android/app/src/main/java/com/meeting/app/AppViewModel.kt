package com.meeting.app

import android.app.Application
import android.content.Intent
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.meeting.app.data.Api
import com.meeting.app.data.ApiException
import com.meeting.app.data.CreatedMeeting
import com.meeting.app.data.MeetingLink
import com.meeting.app.data.SessionStore
import com.meeting.app.data.WaitingRequest
import com.meeting.app.meeting.RoomController
import java.net.URLEncoder
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

sealed interface Screen {
    data object Home : Screen
    data class Waiting(
        val meetingId: String,
        val title: String,
        val requestId: String,
        val status: String,
    ) : Screen

    data class InMeeting(
        val role: String,
        val meetingId: String,
        val title: String,
        val inviteUrl: String?,
        val passcode: String?,
    ) : Screen
}

class AppViewModel(application: Application) : AndroidViewModel(application) {
    private val store = SessionStore(application)
    private val api = Api(store)
    val controller = RoomController(application)

    val screen = MutableStateFlow<Screen>(Screen.Home)
    val busy = MutableStateFlow(false)
    val error = MutableStateFlow<String?>(null)
    val created = MutableStateFlow<CreatedMeeting?>(null)
    val waitingRequests = MutableStateFlow<List<WaitingRequest>>(emptyList())
    val joinInput = MutableStateFlow("")
    val displayName = MutableStateFlow(store.displayName)
    val serverUrl = MutableStateFlow(store.serverUrl)

    private var guestPollJob: Job? = null
    private var hostPollJob: Job? = null

    fun setDisplayName(value: String) {
        displayName.value = value
        store.displayName = value
    }

    fun setServerUrl(value: String) {
        serverUrl.value = value
        store.serverUrl = value
        serverUrl.value = store.serverUrl
    }

    fun setJoinInput(value: String) {
        joinInput.value = value
    }

    fun consumeInviteLink(url: String?) {
        if (url.isNullOrBlank()) return
        if (screen.value is Screen.InMeeting) return
        joinInput.value = url
        screen.value = Screen.Home
    }

    fun clearError() {
        error.value = null
    }

    fun createMeeting(title: String, passcode: String) {
        if (busy.value) return
        viewModelScope.launch {
            busy.value = true
            error.value = null
            runCatching { api.createMeeting(title.ifBlank { "Meeting" }, passcode) }
                .onSuccess {
                    store.saveHostKey(it.meetingId, it.hostKey)
                    store.savePasscode(it.meetingId, it.passcode)
                    created.value = it
                }
                .onFailure { error.value = it.friendly() }
            busy.value = false
        }
    }

    fun dismissCreated() {
        created.value = null
        error.value = null
    }

    fun startHostMeeting() {
        val meeting = created.value ?: return
        if (busy.value) return
        viewModelScope.launch {
            busy.value = true
            error.value = null
            val hostName = displayName.value.ifBlank { "Host" }
            runCatching { api.hostSession(meeting.meetingId, meeting.hostKey, hostName) }
                .onSuccess { session ->
                    runCatching {
                        controller.connect(session.serverUrl, session.token, startMic = true, startCam = true)
                    }.onSuccess {
                        created.value = meeting
                        screen.value = Screen.InMeeting(
                            role = "host",
                            meetingId = meeting.meetingId,
                            title = session.title,
                            inviteUrl = meeting.guestUrl,
                            passcode = meeting.passcode,
                        )
                        startHostPolling(meeting.meetingId, meeting.hostKey)
                    }.onFailure {
                        controller.disconnect()
                        error.value = "Could not connect to LiveKit: ${it.message ?: "unknown error"}"
                    }
                }
                .onFailure { error.value = it.friendly() }
            busy.value = false
        }
    }

    fun joinMeeting(passcodeInput: String) {
        val link = MeetingLink.parse(joinInput.value)
        if (link == null) {
            error.value = "Paste a meeting link or meeting ID"
            return
        }
        val passcode = link.passcode ?: passcodeInput.trim()
        if (passcode.isBlank()) {
            error.value = "Enter the meeting passcode"
            return
        }
        val name = displayName.value.trim()
        if (name.isBlank()) {
            error.value = "Enter your name"
            return
        }
        if (busy.value) return

        viewModelScope.launch {
            busy.value = true
            error.value = null
            runCatching { api.requestJoin(link.meetingId, name, passcode) }
                .onSuccess { requestId ->
                    store.savePasscode(link.meetingId, passcode)
                    screen.value = Screen.Waiting(
                        meetingId = link.meetingId,
                        title = "Meeting",
                        requestId = requestId,
                        status = "pending",
                    )
                    startGuestPolling(link.meetingId, requestId)
                }
                .onFailure { error.value = it.friendly() }
            busy.value = false
        }
    }

    fun cancelWaiting() {
        guestPollJob?.cancel()
        screen.value = Screen.Home
    }

    fun decide(requestId: String, approve: Boolean) {
        val meeting = created.value ?: return
        viewModelScope.launch {
            runCatching { api.decide(meeting.meetingId, meeting.hostKey, requestId, approve) }
                .onSuccess {
                    waitingRequests.update { requests -> requests.filterNot { it.id == requestId } }
                }
                .onFailure { error.value = it.friendly() }
        }
    }

    fun toggleMic() {
        viewModelScope.launch {
            runCatching { controller.setMic(!controller.micOn.value) }
                .onFailure { error.value = "Could not toggle microphone" }
        }
    }

    fun toggleCamera() {
        viewModelScope.launch {
            runCatching { controller.setCamera(!controller.camOn.value) }
                .onFailure { error.value = "Could not toggle camera" }
        }
    }

    fun sendChat(text: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return
        viewModelScope.launch {
            runCatching { controller.sendChat(trimmed) }
                .onFailure { error.value = "Message was not sent" }
        }
    }

    fun startScreenShare(permissionResult: Intent) {
        viewModelScope.launch {
            runCatching { controller.startScreenShare(permissionResult) }
                .onFailure { error.value = "Screen share could not start" }
        }
    }

    fun stopScreenShare() {
        viewModelScope.launch {
            runCatching { controller.stopScreenShare() }
        }
    }

    fun leaveMeeting() {
        guestPollJob?.cancel()
        hostPollJob?.cancel()
        controller.disconnect()
        created.value = null
        waitingRequests.value = emptyList()
        screen.value = Screen.Home
    }

    override fun onCleared() {
        controller.disconnect()
        super.onCleared()
    }

    private fun startGuestPolling(meetingId: String, requestId: String) {
        guestPollJob?.cancel()
        guestPollJob = viewModelScope.launch {
            while (isActive) {
                delay(2000)
                val current = screen.value as? Screen.Waiting ?: break
                val result = runCatching { api.getRequest(requestId) }
                if (result.isFailure) {
                    screen.value = current.copy(status = "offline")
                    continue
                }
                val status = result.getOrThrow()
                screen.value = current.copy(title = status.title, status = status.status)

                if (status.status == "approved" && status.token != null) {
                    val server = status.serverUrl
                    if (server == null) {
                        error.value = "Server did not return a LiveKit URL"
                        screen.value = Screen.Home
                        break
                    }
                    val joined = runCatching {
                        controller.connect(server, status.token, startMic = true, startCam = true)
                    }.isSuccess
                    screen.value = if (joined) {
                        val passcode = store.passcode(meetingId).orEmpty()
                        Screen.InMeeting(
                            role = "guest",
                            meetingId = meetingId,
                            title = status.title,
                            inviteUrl = inviteUrl(meetingId, passcode),
                            passcode = passcode,
                        )
                    } else {
                        error.value = "Could not connect to the meeting"
                        Screen.Home
                    }
                    break
                }
                if (status.status == "denied" || status.status == "expired") break
            }
        }
    }

    private fun startHostPolling(meetingId: String, hostKey: String) {
        hostPollJob?.cancel()
        hostPollJob = viewModelScope.launch {
            while (isActive) {
                runCatching { api.listRequests(meetingId, hostKey) }
                    .onSuccess { waitingRequests.value = it }
                delay(2500)
            }
        }
    }

    private fun inviteUrl(meetingId: String, passcode: String): String {
        val base = store.serverUrl.trimEnd('/')
        val encoded = URLEncoder.encode(passcode, "UTF-8")
        return "$base/m/$meetingId#p=$encoded"
    }

    private fun Throwable.friendly(): String = when (this) {
        is ApiException -> message ?: "Request failed"
        else -> "Could not reach the server at ${store.serverUrl}. Check the server URL and that both devices are online."
    }
}