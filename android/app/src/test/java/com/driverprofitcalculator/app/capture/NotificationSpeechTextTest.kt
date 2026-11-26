package com.driverprofitcalculator.app.capture

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationSpeechTextTest {
    @Test
    fun combinesAppNameTitleAndBodyWithoutInventingContent() {
        assertEquals(
            "WhatsApp، رسالة جديدة، عندك رسالة من أحمد",
            NotificationSpeechText.build("WhatsApp", "رسالة جديدة", "عندك رسالة من أحمد")
        )
    }

    @Test
    fun ignoresBlankPartsAndCapsLongNotifications() {
        val text = NotificationSpeechText.build("Maps", "", "x".repeat(900))
        assertEquals(600, text?.length)
        assertEquals("Maps، " + "x".repeat(594), text)
    }

    @Test
    fun returnsNullWhenNotificationHasNoText() {
        assertNull(NotificationSpeechText.build("", " ", ""))
        assertTrue(!NotificationSpeechText.hasContent("", "  "))
    }
}
