package com.driverprofitcalculator.app

/** Small pure policy surface so native speech configuration can be tested without Android services. */
object NativeVoiceTextPolicy {
    const val LANGUAGE_TAG = "ar-EG"
    const val MAX_SPEECH_CHARS = 600

    fun sanitizeForSpeech(value: String): String = value.trim().take(MAX_SPEECH_CHARS)
}
