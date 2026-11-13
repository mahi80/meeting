package com.meeting.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val ZoomBlue = Color(0xFF2D8CFF)
val ZoomBlueDark = Color(0xFF1B6FD6)
val Ink950 = Color(0xFF0B0E11)
val Ink900 = Color(0xFF11151B)
val Ink850 = Color(0xFF141A21)
val Ink800 = Color(0xFF171D25)
val Ink700 = Color(0xFF232B36)
val Mist100 = Color(0xFFF1F4F8)
val Mist300 = Color(0xFFB3BECC)
val Mist500 = Color(0xFF7B8798)
val Danger = Color(0xFFE5484D)
val Ok = Color(0xFF2FBF71)
val WhatsAppGreen = Color(0xFF25D366)

private val Colors = darkColorScheme(
    primary = ZoomBlue,
    onPrimary = Color.White,
    primaryContainer = ZoomBlueDark,
    onPrimaryContainer = Color.White,
    secondary = Mist300,
    onSecondary = Ink950,
    background = Ink950,
    onBackground = Mist100,
    surface = Ink900,
    onSurface = Mist100,
    surfaceVariant = Ink800,
    onSurfaceVariant = Mist300,
    outline = Ink700,
    error = Danger,
    onError = Color.White,
)

@Composable
fun MeetingTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) Colors else Colors,
        typography = Typography(),
        content = content,
    )
}