package com.driverprofitcalculator.app

import org.junit.Assert.assertEquals
import org.junit.Test

class NativeVoiceTextPolicyTest {
    @Test fun recognitionUsesEgyptianArabicLocale() {
        assertEquals("ar-EG", NativeVoiceTextPolicy.LANGUAGE_TAG)
    }

    @Test fun speechTextIsTrimmedAndBounded() {
        assertEquals("صافي الربح 50 جنيه", NativeVoiceTextPolicy.sanitizeForSpeech("  صافي الربح 50 جنيه  "))
        assertEquals(600, NativeVoiceTextPolicy.sanitizeForSpeech("أ".repeat(800)).length)
        assertEquals("", NativeVoiceTextPolicy.sanitizeForSpeech("   "))
    }
}
