package com.driverprofitcalculator.app

import org.junit.Assert.assertEquals
import org.junit.Test

class NativeVoiceTextPolicyTest {
    @Test fun appLocaleSelectsArabicOrEnglishSpeechRecognition() {
        assertEquals("ar-EG", NativeVoiceLocalePolicy.normalize("ar"))
        assertEquals("ar-EG", NativeVoiceLocalePolicy.normalize("ar-EG"))
        assertEquals("en-US", NativeVoiceLocalePolicy.normalize("en"))
        assertEquals("en-US", NativeVoiceLocalePolicy.normalize("en-GB"))
        assertEquals("ar-EG", NativeVoiceLocalePolicy.normalize("unsupported"))
    }

    @Test fun recognitionUsesEgyptianArabicLocale() {
        assertEquals("ar-EG", NativeVoiceTextPolicy.LANGUAGE_TAG)
    }

    @Test fun speechTextIsTrimmedAndBounded() {
        assertEquals("صافي الربح 50 جنيه", NativeVoiceTextPolicy.sanitizeForSpeech("  صافي الربح 50 جنيه  "))
        assertEquals(600, NativeVoiceTextPolicy.sanitizeForSpeech("أ".repeat(800)).length)
        assertEquals("", NativeVoiceTextPolicy.sanitizeForSpeech("   "))
    }

    @Test fun mixedArabicEnglishAndDigitsAreNeverDropped() {
        val text = "Trip مشوار ١٢٫٥ km ۳۰"
        assertEquals(text, NativeVoiceTextPolicy.sanitizeForSpeech(text))
    }

    @Test fun persianAndArabicDigitsSurviveTheSpeechPath() {
        assertEquals("صافي ٦١٫٠٥ جنيه", NativeVoiceTextPolicy.sanitizeForSpeech("صافي ٦١٫٠٥ جنيه"))
    }
}
