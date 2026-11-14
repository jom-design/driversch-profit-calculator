package com.driverprofitcalculator.app.capture

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/*
 * All notification fixtures below are SYNTHETIC. They exercise pipeline logic only and are not
 * evidence of how real Uber, DiDi or inDrive notifications are structured.
 */
class NotificationEventProcessorTest {

    private val uber = "com.ubercab.driver"
    private val indrive = "sinet.startup.inDriver"
    private val passengerApp = "com.example.synthetic.passenger" // SYNTHETIC unsupported package
    private val key = "0|com.ubercab.driver|1001|null|10001"

    private class FakeStore : CaptureStore {
        val fingerprints = mutableMapOf<String, String>()
        val saved = mutableListOf<Pair<NormalizedNotificationPayload, Boolean>>()
        val removed = mutableListOf<String>()
        var failSave = false

        override fun seenFingerprint(notificationId: String): String? = fingerprints[notificationId]
        override fun save(payload: NormalizedNotificationPayload, fingerprint: String, isUpdate: Boolean): Boolean {
            if (failSave) return false
            fingerprints[payload.notificationId] = fingerprint
            saved += payload to isUpdate
            return true
        }
        override fun markRemoved(notificationId: String, reason: Int?): Boolean {
            removed += notificationId
            return true
        }
    }

    private class FakeCounters¶»§q«^