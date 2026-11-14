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

    private class FakeCounters : CaptureCounters {
        val counts = mutableMapOf<String, Int>()
        override fun increment(name: String) { counts[name] = (counts[name] ?: 0) + 1 }
        fun get(name: String) = counts[name] ?: 0
    }

    private fun event(
        packageName: String = uber,
        key: String = this.key,
        title: String = "Ride request",
        text: String = "Fare 95 EGP, pickup 3 min", // SYNTHETIC
        kind: CaptureEventKind = CaptureEventKind.POSTED,
        groupSummary: Boolean = false,
        reason: Int? = null,
    ) = RawNotificationEvent(kind, packageName, key, title, text, 1794500000000L, groupSummary, reason)

    private fun processor(
        store: FakeStore = FakeStore(),
        counters: FakeCounters = FakeCounters(),
        enabled: Set<String> = setOf("uber", "indrive", "didi"),
    ) = Triple(NotificationEventProcessor(store, { it in enabled }, counters), store, counters)

    @Test
    fun newOfferIsStoredOnce() {
        val (p, store, c) = processor()
        val outcome = p.process(event())
        assertTrue(outcome is CaptureOutcome.Stored && !outcome.isUpdate)
        assertEquals(1, store.saved.size)
        assertEquals(1, c.get(CaptureCounterNames.STORED))
    }

    @Test
    fun identicalRedeliveryIsDuplicateAndCreatesNoSecondResult() {
        val (p, store, c) = processor()
        p.process(event())
        val second = p.process(event())
        assertTrue(second is CaptureOutcome.Duplicate)
        assertEquals("duplicate delivery must not be saved twice", 1, store.saved.size)
        assertEquals(1, c.get(CaptureCounterNames.DUPLICATE))
    }

    @Test
    fun changedUpdateOfSameNotificationIsProcessedAsUpdate() {
        val (p, store, c) = processor()
        p.process(event(text = "Fare 95 EGP, pickup 3 min")) // SYNTHETIC
        val update = p.process(event(text = "Fare 80 EGP, pickup 3 min")) // SYNTHETIC
        assertTrue(update is CaptureOutcome.Stored && update.isUpdate)
        assertEquals(2, store.saved.size)
        assertTrue(store.saved[1].second)
        assertEquals(1, c.get(CaptureCounterNames.UPDATED))
    }

    @Test
    fun repeatedUpdatesWithSameContentAfterChangeAreDeduplicated() {
        val (p, store, _) = processor()
        p.process(event(text = "Fare 95 EGP")) // SYNTHETIC
        p.process(event(text = "Fare 80 EGP")) // SYNTHETIC
        val again = p.process(event(text = "Fare 80 EGP")) // SYNTHETIC
        assertTrue(again is CaptureOutcome.Duplicate)
        assertEquals(2, store.saved.size)
    }

    @Test
    fun removalOfKnownOfferIsRecorded() {
        val (p, store, _) = processor()
        p.process(event())
        val id = NotificationPayloadNormalizer.idFor(uber, key)
        val outcome = p.process(event(kind = CaptureEventKind.REMOVED, reason = 1))
        assertTrue(outcome is CaptureOutcome.Removed && outcome.known)
        assertEquals(listOf(id), store.removed)
    }

    @Test
    fun removalOfUnknownOfferIsCountedButNotStored() {
        val (p, store, c) = processor()
        val outcome = p.process(event(kind = CaptureEventKind.REMOVED))
        assertTrue(outcome is CaptureOutcome.Removed && !outcome.known)
        assertTrue(store.removed.isEmpty())
        assertEquals(1, c.get(CaptureCounterNames.REMOVED_UNKNOWN))
    }

    @Test
    fun messagingStyleNotificationsAreIgnoredEvenWhenTheyContainRideKeywords() {
        val (p, store, counters) = processor()
        val outcome = p.process(event(text = "Fare 95 EGP, pickup 3 min").copy(isMessaging = true))
        assertTrue(outcome is CaptureOutcome.NotRelevant)
        assertTrue(store.saved.isEmpty())
        assertEquals(1, counters.get(CaptureCounterNames.NOT_RELEVANT))
    }

    @Test
    fun unsupportedPackageIsIgnoredAndCounted() {
        val (p, store, c) = processor()
        assertTrue(p.process(event(packageName = passengerApp)) is CaptureOutcome.UnsupportedPackage)
        assertTrue(store.saved.isEmpty())
        assertEquals(1, c.get(CaptureCounterNames.UNSUPPORTED_PACKAGE))
    }

    @Test
    fun disabledProviderIsNeverProcessed() {
        val (p, store, c) = processor(enabled = emptySet())
        assertTrue(p.process(event()) is CaptureOutcome.ProviderDisabled)
        assertTrue(store.saved.isEmpty())
        assertEquals(1, c.get(CaptureCounterNames.PROVIDER_DISABLED))
    }

    @Test
    fun groupSummaryIsSkippedBecauseChildrenCarryTheOffer() {
        val (p, store, c) = processor()
        assertTrue(p.process(event(groupSummary = true)) is CaptureOutcome.GroupSummary)
        assertTrue(store.saved.isEmpty())
        assertEquals(1, c.get(CaptureCounterNames.GROUP_SUMMARY))
    }

    @Test
    fun emptyTextIsRejectedWithoutInventingValues() {
        val (p, store, c) = processor()
        assertTrue(p.process(event(text = "   ")) is CaptureOutcome.EmptyPayload)
        assertTrue(store.saved.isEmpty())
        assertEquals(1, c.get(CaptureCounterNames.EMPTY_PAYLOAD))
    }

    @Test
    fun missingTitleStillProcessesWhenTextIsRelevant() {
        val (p, store, _) = processor()
        val outcome = p.process(event(title = "", text = "Fare 95 EGP, pickup 3 min")) // SYNTHETIC
        assertTrue(outcome is CaptureOutcome.Stored)
        assertEquals("", store.saved[0].first.title)
    }

    @Test
    fun irrelevantNotificationIsRejected() {
        val (p, store, c) = processor()
        val outcome = p.process(event(title = "Account", text = "Settings updated")) // SYNTHETIC
        assertTrue(outcome is CaptureOutcome.NotRelevant)
        assertTrue(store.saved.isEmpty())
        assertEquals(1, c.get(CaptureCounterNames.NOT_RELEVANT))
    }

    @Test
    fun persistenceFailureIsReportedNotSwallowed() {
        val store = FakeStore().apply { failSave = true }
        val (p, _, c) = processor(store = store)
        assertTrue(p.process(event()) is CaptureOutcome.PersistenceFailure)
        assertEquals(1, c.get(CaptureCounterNames.PERSISTENCE_FAILURE))
    }

    @Test
    fun sameKeyFromDifferentProvidersDoesNotCollide() {
        val (p, store, _) = processor()
        p.process(event(packageName = uber))
        p.process(event(packageName = indrive))
        assertEquals(2, store.saved.size)
    }

    @Test
    fun notificationIdIsStableAcrossUpdates() {
        val first = NotificationPayloadNormalizer.idFor(uber, key)
        val second = NotificationPayloadNormalizer.idFor(uber, key)
        assertEquals(first, second)
        assertTrue(first.startsWith("$uber:"))
        assertFalse(first.contains(key))
    }

    @Test
    fun countersContainOnlyKnownAggregateNames() {
        val (p, _, c) = processor()
        p.process(event())
        p.process(event(packageName = passengerApp))
        assertTrue(c.counts.keys.all { it in CaptureCounterNames.ALL })
        assertTrue(c.counts.values.all { it > 0 })
    }
}
