package com.driverprofitcalculator.app.capture

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

/** Synthetic queue entries: dismissing a system notification must not acknowledge a captured offer. */
class PendingNotificationRemovalTest {
    private fun item(id: String) = JSONObject().put("notificationId", id)

    @Test
    fun trayRemovalKeepsTheCapturedOfferUntilExplicitAcknowledgement() {
        val source = JSONArray().put(item("offer-1")).put(item("offer-2"))

        val retained = PendingNotificationRemoval.preserveCapturedOffer(source) { false }

        assertEquals(source.toString(), retained.toString())
    }

    @Test
    fun trayRemovalOnlyPrunesExpiredEntries() {
        val source = JSONArray().put(item("expired")).put(item("still-reviewable"))

        val retained = PendingNotificationRemoval.preserveCapturedOffer(source) {
            it.optString("notificationId") == "expired"
        }

        assertEquals(listOf("still-reviewable"), (0 until retained.length()).map {
            retained.getJSONObject(it).getString("notificationId")
        })
    }
}
