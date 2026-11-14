package com.driverprofitcalculator.app

/** Whitelist supported app voice locales and provide a safe Arabic default. */
internal object NativeVoiceLocalePolicy {
    fun normalize(languageTag: String?): String =
        if (languageTag?.startsWith("en", ignoreCase = true) == true) "en-US" else "ar-EG"
}
