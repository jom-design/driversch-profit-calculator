package com.driverprofitcalculator.app.capture

import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Durable journal behaviour on the JVM. The backend stores the journal as text, like the encrypted
 * blob does, so a "new" journal over the same backend models a process restart.
 * ALL notification values in this file are SYNTHETIC.
 */
class EventJournalTest {

    /** Stores the journal as serialized text, the way the encrypted preference blob does. */
    private class TextBackend(var raw: String = "[]", var highWater: Long = 0L) : JournalBackend {
        var failReads = false
        var failWrites = false
        override fun readJournal(): JSONArray? = if (failReads) null else JSONArray(raw)
        override fun readHighWaterMark(): Long = highWater
        override fun writeJournal(items: JSONArray, highWaterMark: Long): Boolean {
            if (failWrites) return false
            raw = items.toString()
            highWater = maxOf(highWater, highWaterMark)
            return true
        }
    }

    private class Counts : CaptureCounters {
        val values = mutableMapOf<String, Int>()
        override fun increment(name: String) { values[name] = (values[name] ?: 0) + 1 }
        fun get(name: String) = values[name] ?: 0
    }

    private var now = 1794500000000L
    private val clock: () -> Long = { now }

    private fun event(key: String, text: String = "synthetic text $key") = RawNotificationEvent(
        kind = CaptureEventKind.POSTED,
        packageName = "com.ubercab.driver",
        key = key,
        title = "Ride request",
        text = text,
        postedAtMillis = now,
        isGroupSummary = false,
        isMessaging = false,
        removeReason = null,
    )

    @Test
    fun `pending returns events in arrival order`() {
        val counts = Counts()
        val journal = EventJournal(TextBackend(), counts, clock)
        journal.append(event("a"))
        journal.append(event("b"))
        journal.append(event("c"))

        assertEquals(listOf("a", "b", "c"), journal.pending().map { it.event.key })
        assertEquals(3, journal.count())
    }

    @Test
    fun `an appended event survives a restart over the same storage`() {
        val backend = TextBackend()
        val counts = Counts()
        EventJournal(backend, counts, clock).append(event("survives"))

        // A new journal instance models a process killed before the event was processed.
        val afterRestart = EventJournal(backend, counts, clock).pending()

        assertEquals(listOf("survives"), afterRestart.map { it.event.key })
    }

    @Test
    fun `complete removes the event and repeating it is a no-op`() {
        val backend = TextBackend()
        val journal = EventJournal(backend, Counts(), clock)
        val seq = journal.append(event("done"))!!

        assertTrue(journal.complete(seq))
        assertTrue(journal.complete(seq))
        assertEquals(0, journal.count())
        assertTrue(journal.pending().isEmpty())
    }

    @Test
    fun `complete for an unknown sequence changes nothing`() {
        val backend = TextBackend()
        val journal = EventJournal(backend, Counts(), clock)
        journal.append(event("kept"))
        val before = backend.raw

        assertTrue(journal.complete(9_999L))
        assertEquals(before, backend.raw)
    }

    @Test
    fun `a removed sequence number is never reused, so a repeated complete cannot remove a newer event`() {
        val journal = EventJournal(TextBackend(), Counts(), clock)
        val old = journal.append(event("old"))!!
        journal.complete(old)
        val fresh = journal.append(event("fresh"))!!

        // The old sequence is repeated after the new event was journaled, as a replayed call could do.
        assertTrue(journal.complete(old))

        assertTrue(fresh != old)
        assertEquals(listOf("fresh"), journal.pending().map { it.event.key })
    }

    @Test
    fun `the high-water mark survives an empty queue and a restart`() {
        val backend = TextBackend()
        val first = EventJournal(backend, Counts(), clock)
        val seq = first.append(event("a"))!!
        first.complete(seq)

        // A new journal instance over the same storage, with an empty queue, continues the numbering.
        val afterRestart = EventJournal(backend, Counts(), clock).append(event("b"))!!

        assertTrue(afterRestart > seq)
    }

    @Test
    fun `sequence numbers keep increasing after completion`() {
        val journal = EventJournal(TextBackend(), Counts(), clock)
        val first = journal.append(event("1"))!!
        journal.complete(first)
        val second = journal.append(event("2"))!!

        assertTrue(second > first)
    }

    @Test
    fun `a failed event is dropped after the maximum number of attempts, and the queue keeps moving`() {
        val counts = Counts()
        val journal = EventJournal(TextBackend(), counts, clock)
        val bad = journal.append(event("bad"))!!
        journal.append(event("good"))

        repeat(EventJournal.MAX_ATTEMPTS) { journal.recordFailure(bad) }

        assertEquals(listOf("good"), journal.pending().map { it.event.key })
        assertEquals(1, counts.get(CaptureCounterNames.JOURNAL_DROPPED_FAILED))
    }

    @Test
    fun `an event keeps its place until its attempts run out`() {
        val journal = EventJournal(TextBackend(), Counts(), clock)
        val seq = journal.append(event("retry"))!!
        journal.append(event("after"))

        journal.recordFailure(seq)

        val pending = journal.pending()
        assertEquals(listOf("retry", "after"), pending.map { it.event.key })
        assertEquals(1, pending.first().attempts)
    }

    @Test
    fun `events older than the staleness window are dropped, not processed as new`() {
        val counts = Counts()
        val backend = TextBackend()
        val journal = EventJournal(backend, counts, clock)
        journal.append(event("old"))

        now += EventJournal.MAX_AGE_MS + 1
        journal.append(event("fresh"))
        val pending = journal.pending().map { it.event.key }

        assertEquals(listOf("fresh"), pending)
        assertEquals(1, counts.get(CaptureCounterNames.JOURNAL_DROPPED_STALE))
    }

    @Test
    fun `an event exactly at the staleness boundary is still kept`() {
        val counts = Counts()
        val journal = EventJournal(TextBackend(), counts, clock)
        journal.append(event("edge"))

        now += EventJournal.MAX_AGE_MS
        assertEquals(listOf("edge"), journal.pending().map { it.event.key })
        assertEquals(0, counts.get(CaptureCounterNames.JOURNAL_DROPPED_STALE))
    }

    @Test
    fun `a full journal refuses new events and counts the overflow`() {
        val counts = Counts()
        val journal = EventJournal(TextBackend(), counts, clock)
        repeat(EventJournal.MAX_ITEMS) { assertNotNull(journal.append(event("e$it"))) }

        assertNull(journal.append(event("extra")))
        assertEquals(EventJournal.MAX_ITEMS, journal.count())
        assertEquals(1, counts.get(CaptureCounterNames.JOURNAL_OVERFLOW))
    }

    @Test
    fun `a failed write is reported as null and counted, and nothing is queued`() {
        val backend = TextBackend()
        val counts = Counts()
        val journal = EventJournal(backend, counts, clock)
        backend.failWrites = true

        assertNull(journal.append(event("lost")))
        assertEquals(0, journal.count())
        assertEquals(1, counts.get(CaptureCounterNames.JOURNAL_WRITE_FAILED))
    }

    @Test
    fun `an unreadable journal refuses appends and reports no pending events`() {
        val backend = TextBackend()
        val counts = Counts()
        val journal = EventJournal(backend, counts, clock)
        backend.failReads = true

        assertNull(journal.append(event("x")))
        assertTrue(journal.pending().isEmpty())
        assertEquals(0, journal.count())
        assertTrue(counts.get(CaptureCounterNames.JOURNAL_READ_FAILED) >= 1)
    }

    @Test
    fun `a corrupt entry is dropped with a counter and valid entries survive`() {
        val backend = TextBackend(
            """[{"seq":1,"at":1794500000000,"attempts":0},""" +
                """{"seq":2,"at":1794500000000,"attempts":0,"event":{"kind":"POSTED"}}]""",
        )
        val counts = Counts()
        val journal = EventJournal(backend, counts, clock)
        journal.append(event("valid"))

        val keys = journal.pending().map { it.event.key }

        assertEquals(listOf("valid"), keys)
        assertEquals(2, counts.get(CaptureCounterNames.JOURNAL_DROPPED_CORRUPT))
    }

    @Test
    fun `the raw event codec round trips every persisted field`() {
        val original = RawNotificationEvent(
            kind = CaptureEventKind.REMOVED,
            packageName = "sinet.startup.inDriver",
            key = "k-1",
            title = "t",
            text = "x",
            postedAtMillis = 42L,
            isGroupSummary = true,
            isMessaging = true,
            removeReason = 3,
        )

        val decoded = RawEventCodec.fromJson(RawEventCodec.toJson(original))

        assertEquals(original, decoded)
    }

    @Test
    fun `the codec rejects a document that lacks required fields`() {
        assertNull(RawEventCodec.fromJson(org.json.JSONObject().put("kind", "POSTED")))
    }

    @Test
    fun `drainJournal processes all events in order and completes each one`() {
        val journal = EventJournal(TextBackend(), Counts(), clock)
        journal.append(event("1"))
        journal.append(event("2"))
        val seen = mutableListOf<String>()

        val completed = drainJournal(journal) { e ->
            seen += e.key
            CaptureOutcome.UnsupportedPackage
        }

        assertEquals(listOf("1", "2"), seen)
        assertEquals(2, completed)
        assertEquals(0, journal.count())
    }

    @Test
    fun `drainJournal keeps an event whose processing throws, and continues with the next one`() {
        val counts = Counts()
        val journal = EventJournal(TextBackend(), counts, clock)
        journal.append(event("boom"))
        journal.append(event("ok"))

        val completed = drainJournal(journal) { e ->
            if (e.key == "boom") throw IllegalStateException("synthetic failure")
            CaptureOutcome.UnsupportedPackage
        }

        assertEquals(1, completed)
        assertEquals(listOf("boom"), journal.pending().map { it.event.key })
        assertEquals(1, journal.pending().single().attempts)
    }

    @Test
    fun `drainJournal keeps an event that hit a storage failure for a retry`() {
        val journal = EventJournal(TextBackend(), Counts(), clock)
        journal.append(event("storage"))

        val completed = drainJournal(journal) { CaptureOutcome.PersistenceFailure }

        assertEquals(0, completed)
        assertEquals(1, journal.count())
        assertEquals(1, journal.pending().single().attempts)
    }

    @Test
    fun `an event that keeps failing is removed after the attempts run out`() {
        val journal = EventJournal(TextBackend(), Counts(), clock)
        journal.append(event("stuck"))

        repeat(EventJournal.MAX_ATTEMPTS + 1) {
            drainJournal(journal) { CaptureOutcome.PersistenceFailure }
        }

        assertEquals(0, journal.count())
    }

    @Test
    fun `replay after a crash does not store the same offer twice`() {
        val backend = TextBackend()
        val counts = Counts()
        val store = InMemoryStore()
        val journal = EventJournal(backend, counts, clock)
        val processor = NotificationEventProcessor(
            store = store,
            isProviderEnabled = { true },
            counters = counts,
            clock = clock,
        )
        val offer = event(
            "crash-key",
            "Fare: 200 EGP. Pickup distance: 2 km. Trip distance: 18 km. Trip duration: 25 min. Net fare",
        )
        journal.append(offer)

        // Simulated crash: the event was processed and saved, but the process died before complete().
        val first = processor.process(journal.pending().single().event)
        assertTrue(first is CaptureOutcome.Stored)
        assertEquals(1, store.saves)

        // After restart the journal still holds the event. Replay must not create a second result.
        val restarted = EventJournal(backend, counts, clock)
        drainJournal(restarted) { processor.process(it) }

        assertEquals(1, store.saves)
        assertEquals(0, restarted.count())
        assertFalse(restarted.pending().any())
    }

    /** Stores the fingerprint and counts saves, like the encrypted store's contract. */
    private class InMemoryStore : CaptureStore {
        private val seen = mutableMapOf<String, String>()
        var saves = 0
        override fun seenFingerprint(notificationId: String): String? = seen[notificationId]
        override fun save(payload: NormalizedNotificationPayload, fingerprint: String, isUpdate: Boolean): Boolean {
            saves += 1
            seen[payload.notificationId] = fingerprint
            return true
        }
        override fun markRemoved(notificationId: String, reason: Int?): Boolean = true
    }
}
