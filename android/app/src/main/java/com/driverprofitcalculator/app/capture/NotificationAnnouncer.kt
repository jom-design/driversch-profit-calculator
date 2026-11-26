package com.driverprofitcalculator.app.capture

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import java.util.Locale

/** Reads only notification text explicitly selected by the user through per-app opt-in controls. */
class NotificationAnnouncer(context: Context) : TextToSpeech.OnInitListener {
    private val appContext = context.applicationContext
    private val main = Handler(Looper.getMainLooper())
    private var engine: TextToSpeech? = null
    private var ready = false
    private var pending = ArrayDeque<Triple<String, String, String>>()
    private val prefs = appContext.getSharedPreferences("notification_speech_dedupe", Context.MODE_PRIVATE)

    init { main.post { engine = TextToSpeech(appContext, this) } }

    fun announce(eventId: String, packageName: String, appLabel: String, title: String, body: String) {
        if (eventId.isBlank() || !NotificationSpeechPreferences.shouldSpeak(appContext, packageName) || !NotificationSpeechText.hasContent(title, body)) return
        val text = NotificationSpeechText.build(appLabel, title, body) ?: return
        main.post {
            if (prefs.getString("last_event", null) == eventId) return@post
            if (!NotificationSpeechPreferences.shouldSpeak(appContext, packageName)) return@post\n            if (ready) speak(eventId, text) else if (pending.size < 8) pending.addLast(Triple(eventId, packageName, text))
        }
    }


    override fun onInit(status: Int) {
        main.post {
            if (status != TextToSpeech.SUCCESS) { pending.clear(); return@post }
            val result = engine?.setLanguage(Locale.forLanguageTag("ar-EG")) ?: TextToSpeech.ERROR
            ready = result != TextToSpeech.LANG_MISSING_DATA &&
                result != TextToSpeech.LANG_NOT_SUPPORTED && result != TextToSpeech.ERROR
            if (!ready) { pending.clear(); return@post }
            while (pending.isNotEmpty()) {
                val item = pending.removeFirst()
                if (NotificationSpeechPreferences.shouldSpeak(appContext, item.second)) speak(item.first, item.third)
            }
        }
    }

    private fun speak(eventId: String, text: String) {
        if (!prefs.edit().putString("last_event", eventId).commit()) return
        engine?.speak(text, TextToSpeech.QUEUE_ADD, null, "notification-" + eventId.hashCode())
    }

    fun stop() {
        main.post { pending.clear(); engine?.stop() }
    }

    fun shutdown() {
        main.post { pending.clear(); engine?.stop(); engine?.shutdown(); engine = null; ready = false }
    }
}

internal object NotificationSpeechText {
    fun hasContent(title: String, body: String): Boolean = title.isNotBlank() || body.isNotBlank()

    fun build(appLabel: String, title: String, body: String): String? {
        val parts = listOf(appLabel.trim(), title.trim(), body.trim())
            .filter { it.isNotBlank() }
            .distinct()
        if (parts.isEmpty()) return null
        return parts.joinToString("، ").take(600)
    }
}
