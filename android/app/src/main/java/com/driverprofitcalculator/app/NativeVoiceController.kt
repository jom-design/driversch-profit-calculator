package com.driverprofitcalculator.app

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.webkit.WebView
import org.json.JSONObject
import java.util.Locale

/** Native push-to-talk adapter. It only returns transcripts and speaks user-requested text. */
class NativeVoiceController(
    private val activity: Activity,
    private val webView: WebView
) : TextToSpeech.OnInitListener {
    private val main = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var tts: TextToSpeech? = TextToSpeech(activity.applicationContext, this)
    private var ttsReady = false
    private var pendingSpeech: String? = null

    fun startListening() {
        main.post {
            if (!SpeechRecognizer.isRecognitionAvailable(activity)) {
                emit("error", "recognition-unavailable")
                return@post
            }
            if (activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                activity.requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQUEST_AUDIO_PERMISSION)
                return@post
            }
            startRecognizer()
        }
    }

    fun onAudioPermissionResult(granted: Boolean) {
        main.post { if (granted) startRecognizer() else emit("error", "not-allowed") }
    }

    private fun startRecognizer() {
        stopRecognizer()
        try {
            val engine = SpeechRecognizer.createSpeechRecognizer(activity)
            recognizer = engine
            engine.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) { emit("listening", "") }
                override fun onBeginningOfSpeech() = Unit
                override fun onRmsChanged(rmsdB: Float) = Unit
                override fun onBufferReceived(buffer: ByteArray?) = Unit
                override fun onEndOfSpeech() = Unit
                override fun onError(error: Int) {
                    recognizer = null
                    engine.destroy()
                    emit("error", errorName(error))
                }
                override fun onResults(results: Bundle?) {
                    val transcript = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                    recognizer = null
                    engine.destroy()
                    if (transcript.isBlank()) emit("error", "no-speech") else emit("result", transcript)
                }
                override fun onPartialResults(partialResults: Bundle?) = Unit
                override fun onEvent(eventType: Int, params: Bundle?) = Unit
            })
            val request = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, NativeVoiceTextPolicy.LANGUAGE_TAG)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, NativeVoiceTextPolicy.LANGUAGE_TAG)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
                putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
                putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, activity.packageName)
            }
            engine.startListening(request)
        } catch (_: Exception) {
            stopRecognizer()
            emit("error", "recognition-start-failed")
        }
    }

    fun stopListening() {
        main.post {
            stopRecognizer()
            emit("stopped", "")
        }
    }

    private fun stopRecognizer() {
        recognizer?.let { engine ->
            try { engine.cancel() } catch (_: Exception) { }
            try { engine.destroy() } catch (_: Exception) { }
        }
        recognizer = null
    }

    fun speak(text: String) {
        val safeText = NativeVoiceTextPolicy.sanitizeForSpeech(text)
        if (safeText.isBlank()) return
        main.post {
            if (!ttsReady) { pendingSpeech = safeText; return@post }
            speakNow(safeText)
        }
    }

    fun stopSpeaking() {
        main.post {
            pendingSpeech = null
            tts?.stop()
            emit("speak-stopped", "")
        }
    }

    private fun speakNow(text: String) {
        val engine = tts ?: run { emit("speak-error", "tts-unavailable"); return }
        val result = engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, UTTERANCE_ID)
        if (result == TextToSpeech.ERROR) emit("speak-error", "tts-failed") else emit("speaking", "")
    }

    override fun onInit(status: Int) {
        main.post {
            if (status != TextToSpeech.SUCCESS) { emit("speak-error", "tts-unavailable"); return@post }
            val languageResult = tts?.setLanguage(Locale("ar", "EG")) ?: TextToSpeech.ERROR
            ttsReady = languageResult != TextToSpeech.LANG_MISSING_DATA &&
                languageResult != TextToSpeech.LANG_NOT_SUPPORTED && languageResult != TextToSpeech.ERROR
            if (!ttsReady) { emit("speak-error", "arabic-tts-unavailable"); return@post }
            tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) { emit("speaking", "") }
                override fun onDone(utteranceId: String?) { emit("speak-ended", "") }
                @Deprecated("Deprecated in Java")
                override fun onError(utteranceId: String?) { emit("speak-error", "tts-failed") }
            })
            pendingSpeech?.also { pendingSpeech = null; speakNow(it) }
        }
    }

    fun destroy() {
        main.post {
            stopRecognizer()
            pendingSpeech = null
            tts?.stop()
            tts?.shutdown()
            tts = null
            ttsReady = false
        }
    }

    private fun emit(type: String, value: String) {
        val script = "window.dispatchEvent(new CustomEvent('driverandroidvoice',{detail:{type:${JSONObject.quote(type)},value:${JSONObject.quote(value)}}}));"
        webView.post { webView.evaluateJavascript(script, null) }
    }

    private fun errorName(error: Int): String = when (error) {
        SpeechRecognizer.ERROR_AUDIO -> "audio"
        SpeechRecognizer.ERROR_CLIENT -> "client"
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "not-allowed"
        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "network"
        SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "no-speech"
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "busy"
        SpeechRecognizer.ERROR_SERVER -> "server"
        else -> "recognition-failed"
    }

    companion object {
        const val REQUEST_AUDIO_PERMISSION = 4207
        private const val UTTERANCE_ID = "driver-profit-result"
    }
}
