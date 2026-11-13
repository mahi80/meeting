package com.meeting.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import io.livekit.android.renderer.SurfaceViewRenderer
import io.livekit.android.room.Room
import io.livekit.android.room.track.VideoTrack

@Composable
fun VideoSurface(room: Room, track: VideoTrack, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val renderer = remember { SurfaceViewRenderer(context) }
    DisposableEffect(room, track) {
        room.initVideoRenderer(renderer)
        track.addRenderer(renderer)
        onDispose { track.removeRenderer(renderer) }
    }
    AndroidView(factory = { renderer }, modifier = modifier)
}