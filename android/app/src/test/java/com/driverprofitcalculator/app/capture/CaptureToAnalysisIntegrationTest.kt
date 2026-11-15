package com.driverprofitcalculator.app.capture

import com.driverprofitcalculator.app.calc.CalcSettings
import com.driverprofitcalculator.app.calc.FareMode
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * End-to-end path on the JVM: synthetic platform event -> processor -> provider parser ->
 * normalized offer -> TripCalculator-backed analysis -> persisted payload JSON.
 * Android services, the Keystore-backed store and the WebView bridge are not exercised here.
 * ALL notification values in this file are SYNTHETIC.
 */
class CaptureToAnalysisIntegrationTest {

    /** In-memory store with the same contract as EncryptedNotificationStore. */
    private class MemoryStore(
        private val seen: MutableMap<String, String> = mutableMapOf(),
    ) : CaptureStore {
        val saved = mutableListOf<JSONObject>()
        val removed = mutableListOf<String>()
        var failNextSave = false

        override fun seenFingerprint(notificationId: String): String? = seen[notificationId]

        override fun save(payload: NormalizedNotificationPayload, fingerprint: String, isUpdate: Boolean): Boolean {
            if (failNextSave) {
                failNextSave = false
                return false
            }
            saved += payload.toJson()
            seen[payload.notificationId] = fingerprint
            return true
        }

        override fun markRemoved(notificationId: String, reason: Int?): Boolean {
            removed += notificationId
            return true
        }
    }

    private class Counts : CaptureCounters {
        val values = mutableMapOf<String, Int>()
        override fun increment(name: String) { values[name] = (values[name] ?: 0) + 1 }
        fun get(name: String) = values[name] ?: 0
    }

    private val settings = CalcSettings(22.25, 10.0, 2.5, 50.0, 75.0)
    private val completeConfig = TripAnalysisConfig(
        settings = settings,
        commissionRates = mapOf("uber" to 10.0, "didi" to 10.0, "indrive" to 10.0),
        fareModes = mapOf("uber" to FareMode.NET),
        returnKm = 5.0,
        extraExpenses = 0.0,
    )

    private fun event(
        kind: CaptureEventKind = CaptureEventKind.POSTED,
        packageName: String = "com.ubercab.driver",
        key: String = "synthetic-key-1",
        title: String = "Ride request",
        text: String = "Fare: 200 EGP. Pickup distance: 2 km. Trip distance: 18 km. Trip duration: 25 min. Pickup time: 5 min. Net fare",
        reason: Int? = null,
    ) = RawNotificationEvent(kind, packageName, key, title, text, 1794500000000L, false, reason)

    private fun processor(
        store: CaptureStore,
        counts: Counts,
        enabled: Boolean = true,
        config: TripAnalysisConfig? = completeConfig,
    ) = NotificationEventProcessor(
        store = store,
        isProviderEnabled = { enabled },
        counters = counts,
        analysisConfig = { config },
        clock = { 1794500001000L },
    )

    @Test fun `complete synthetic Uber offer is analysed, persisted, and carries no raw text`() {
        val store = MemoryStore()
        val counts = Counts()
        val outcome = processor(store, counts).process(event())
        assertTrue(outcome is CaptureOutcome.Stored)
        assertEquals(1, store.saved.size)
        val analysis = store.saved[0].getJSONObject("analysis")
        assertEquals("accept", analysis.getString("recommendation"))
        assertEquals(81.87, analysis.getDouble("netProfit"), 0.001)
        assertFalse(store.saved[0].has("text"))
        assertFalse(store.saved[0].has("title"))
        assertEquals(1, counts.get(CaptureCounterNames.STORED))
    }

    @Test fun `identical redelivery is a duplicate and produces no second analysis`() {
        val store = MemoryStore()
        val counts = Counts()
        val p = processor(store, counts)
        p.process(event())
        assertTrue(p.process(event()) is CaptureOutcome.Duplicate)
        assertEquals(1, store.saved.size)
        assertEquals(1, counts.get(CaptureCounterNames.DUPLICATE))
    }

    @Test fun `changed content of the same notification is an update that is analysed again`() {
        val store = MemoryStore()
        val counts = Counts()
        val p = processor(store, counts)
        p.process(event())
        val update = p.process(event(text = "Fare: 120 EGP. Pickup distance: 2 km. Trip distance: 18 km. Trip duration: 25 min. Pickup time: 5 min. Net fare"))
        assertTrue(update is CaptureOutcome.Stored && update.isUpdate)
        assertEquals("reject", store.saved[1].getJSONObject("analysis").getString("recommendation"))
        assertEquals(1, counts.get(CaptureCounterNames.UPDATED))
    }

    @Test fun `removal of a known offer is recorded and removal of an unknown one is counted separately`() {
        val store = MemoryStore()
        val counts = Counts()
        val p = processor(store, counts)
        p.process(event())
        val known = p.process(event(kind = CaptureEventKind.REMOVED, reason = 1))
        assertTrue(known is CaptureOutcome.Removed && known.known)
        val unknown = p.process(event(kind = CaptureEventKind.REMOVED, key = "never-seen", reason = 1))
        assertTrue(unknown is CaptureOutcome.Removed && !unknown.known)
        assertEquals(1, counts.get(CaptureCounterNames.REMOVED_UNKNOWN))
        assertEquals(1, store.removed.size)
    }

    @Test fun `process recreation keeps duplicate detection because the fingerprint is persisted`() {
        val store = MemoryStore()
        processor(store, Counts()).process(event())
        // A new processor instance stands in for a recreated process that shares the same store.
        val afterRecreation = processor(store, Counts()).process(event())
        assertTrue(afterRecreation is CaptureOutcome.Duplicate)
        assertEquals(1, store.saved.size)
    }

    @Test fun `persistence failure is reported and the same content is retried on the next delivery`() {
        val store = MemoryStore()
        store.failNextSave = true
        val counts = Counts()
        val p = processor(store, counts)
        assertTrue(p.process(event()) is CaptureOutcome.PersistenceFailure)
        assertEquals(1, counts.get(CaptureCounterNames.PERSISTENCE_FAILURE))
        assertTrue(p.process(event()) is CaptureOutcome.Stored)
    }

    @Test fun `disabled provider and unsupported package never reach the analysis`() {
        val store = MemoryStore()
        assertTrue(processor(store, Counts(), enabled = false).process(event()) is CaptureOutcome.ProviderDisabled)
        assertTrue(processor(store, Counts()).process(event(packageName = "com.example.fake")) is CaptureOutcome.UnsupportedPackage)
        assertTrue(store.saved.isEmpty())
    }

    @Test fun `missing vehicle settings store an insufficient-data result instead of a profit`() {
        val store = MemoryStore()
        processor(store, Counts(), config = null).process(event())
        val analysis = store.saved[0].getJSONObject("analysis")
        assertEquals("insufficient_data", analysis.getString("recommendation"))
        assertTrue(analysis.isNull("netProfit"))
    }

    @Test fun `DiDi offers are analysed but always marked as unverified`() {
        val store = MemoryStore()
        processor(store, Counts()).process(
            event(packageName = "com.didiglobal.driver", key = "didi-synthetic", title = "DiDi trip request",
                text = "Trip fare: 200 EGP; pickup distance 2 km; passenger distance 18 km; estimated trip time 25 min; pickup time 5 min"),
        )
        assertFalse(store.saved[0].getJSONObject("analysis").getBoolean("payloadVerified"))
    }
}
