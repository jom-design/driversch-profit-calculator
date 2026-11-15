package com.driverprofitcalculator.app.capture

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Synthetic queue entries only; these tests cover acknowledgement semantics, not provider payloads. */
class PendingNotificationAcknowledgerTest {

    private fun item(id: String) = JSONObject().put("notificationId", id)

    @Test
    fun removesTheRequestedIdAndPreservesOtherLiveEntries() {
        val source = JSONArray().put(item("first")).put(item("target")).put(item("last"))

        val result = PendingNotificationAcknowledger.remove(source, "target") { false }

        assertTrue(result.found)
        assertEquals(listOf("first", "last"), (0 until result.pending.length()).map {
            result.pending.getJSONObject(it).getString("notificationId")
        })
        // The source is immutable from the caller's perspective.
        assertEquals(3, source.length())
    }

    @Test
    fun missingIdIsNotReportedAsAcknowledgedAndDoesNotChangeQueue() {
        val source = JSONArray().put(item("first")).put(item("last"))

        val result = PendingNotificationAcknowledger.remove(source, "missing") { false }

        assertFalse(result.found)
        assertEquals(source.toString(), result.pending.toString())
    }

    @Test
    fun blankIdIsRejectedWithoutChangingQueue() {
        val source = JSONArray().put(item("first"))

        val result = PendingNotificationAcknowledger.remove(source, "   ") { false }

        assertFalse(result.found)
        assertEquals(source.toString(), result.pending.toString())
    }

    @Test
    fun acknowledgementAlsoPrunesExpiredUnrelatedEntries() {
        val source = JSONArray()
            .put(item("expired"))
            .put(item("target"))
            .put(item("live"))

        val result = PendingNotificationAcknowledger.remove(source, "target") {
            it.optString("notificationId") == "expired"
        }

        assertTrue(result.found)
        assertEquals(listOf("live"), (0 until result.pending.length()).map {
            result.pending.getJSONObject(it).getString("notificationId")
        })
    }
}
