package com.meeting.app.ui

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.core.content.getSystemService

fun inviteText(title: String, url: String, passcode: String?): String = buildString {
    append("Join my meeting \"")
    append(title)
    append("\"\n")
    append(url)
    if (!passcode.isNullOrBlank()) {
        append("\nPasscode: ")
        append(passcode)
    }
}

fun shareToWhatsApp(context: Context, text: String) {
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
    }
    val direct = Intent(send).apply { setPackage("com.whatsapp") }
    try {
        context.startActivity(direct)
    } catch (_: ActivityNotFoundException) {
        context.startActivity(Intent.createChooser(send, "Share meeting link"))
    }
}

fun copyToClipboard(context: Context, label: String, text: String) {
    val clipboard = context.getSystemService<ClipboardManager>() ?: return
    clipboard.setPrimaryClip(ClipData.newPlainText(label, text))
}