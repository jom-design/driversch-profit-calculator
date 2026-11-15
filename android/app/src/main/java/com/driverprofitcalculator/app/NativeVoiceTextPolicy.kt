package com.driverprofitcalculator.app

/** Small pure policy surface so native speech configuration can be tested without Android services. */
object NativeVoiceTextPolicy {
    const val LANGUAGE_TAG = "ar-EG"
    const val MAX_SPEECH_CHARS = 600

    fun sanitizeForSpeech(value: String): String = value.trim().take(MAX_SPEECH_CHARS)

    /** What a speak request does, given the TTS engine state. */
    enum class SpeakAction { SPEAK_NOW, QUEUE_UNTIL_READY, REPORT_UNAVAILABLE }

    /**
     * A request made while TTS initialization is still running waits for it. Once initialization has
     * finished, a request that cannot be spoken is reported at once, so the page never shows speech that will not happen.
     */
    fun speakAction(engineAlive: Boolean, ttsReady: Boolean, initFinished: Boolean): SpeakAction = when {
        !engineAlive -> SpeakAction.REPORT_UNAVAILABLE
        ttsReady -> SpeakAction.SPEAK_NOW
        initFinished -> SpeakAction.REPORT_UNAVAILABLE
        else -> SpeakAction.QUEUE_UNTIL_READY
    }
}
