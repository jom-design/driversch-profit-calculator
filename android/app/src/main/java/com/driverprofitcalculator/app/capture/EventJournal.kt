package com.driverprofitcalculator.app.capture

import org.json.JSONArray
import org.json.JSONObject

/**
 * Storage port for the journal. The encrypted store implements it on device; tests use memory.
 * Both methods work on the whole journal array, so every write replaces it atomically.
 */
interface JournalBackend {
    /** The journal array, or null when the stored state cannot be read. */
    fun readJournal(): JSONArray?
    fun writeJournal(items: JSONArray): Boolean
}

/** An event that was accepted but not yet processed. */
data class JournaledEvent(val seq: Long, val enqueuedAtMillis: Long, val attempts: Int, val event: RawNotificationEvent)

/** Serializes a raw event for the encrypted journal. Only fields needed to process it are kept. */
object RawEventCodec {
    fun toJson(event: RawNotificationEvent): JSONObject = JSONObject()
        .put("kind", event.kind.name)
        .put("packageName", event.packageName)
        .put("key", event.key)
        .put("title", event.title)
        .put("text", event.text)
        .put("postedAtMillis", event.postedAtMillis)
        .put("isGroupSummary", event.isGroupSummary)
        .put("isMessaging", event.isMessaging)
        .also { if (event.removeReason != null) it.put("removeReason", event.removeReason) }

    fun fromJson(json: JSONObject): RawNotificationEvent? = try {
        RawNotificationEvent(
            kind = CaptureEventKind.valueOf(json.getString("kind")),
            packageName = json.getString("packageName"),
            key = json.getString("key"),
            title = json.getString("title"),
            text = json.getString("text"),
            postedAtMillis = json.getLong("postedAtMillis"),
            isGroupSummary = json.getBoolean("isGroupSummary"),
            isMessaging = json.optBoolean("isMessaging", false),
            removeReason = if (json.has("removeReason")) json.getInt("removeReason") else null,
        )
    } catch (_: Exception) { null }
}

/**
 * Durable, ordered queue of raw events waiting for processing.
 *
 * An event is appended before it is processed and removed only after processing succeeds. If the
 * process dies in between, the event is still in the journal and is processed again after restart.
 * Replay is safe because NotificationEventProcessor deduplicates by fingerprint.
 *
 * Failure policy: a failed attempt is retried up to [MAX_ATTEMPTS] times, then dropped with a counter,
 * so one bad event cannot block the queue. Events older than [MAX_AGE_MS] are dropped as stale rather
 * than processed as if they were new. Every drop and failure increments a visible counter.
 */
class EventJournal(
    private val backend: JournalBackend,
    private val counters: CaptureCounters,
    private val clock: () -> Long = { System.currentTimeMillis() },
) {
    /** Appends an event. Returns its sequence number, or null when it could not be stored. */
    fun append(event: RawNotificationEvent): Long? {
        val items = readOrCount() ?: return null
        if (items.length() >= MAX_ITEMS) {
            counters.increment(CaptureCounterNames.JOURNAL_OVERFLOW)
            return null
        }
        val seq = nextSequence(items)
        val next = copyOf(items)
        next.put(JSONObject().put("seq", seq).put("at", clock()).put("attempts", 0).put("event", RawEventCodec.toJson(event)))
        if (!backend.writeJournal(next)) {
            counters.increment(CaptureCounterNames.JOURNAL_WRITE_FAILED)
            return null
        }
        return seq
    }

    /** Pending events in arrival order. Stale, corrupt and exhausted items are removed here, with a counter. */
    fun pending(): List<JournaledEvent> {
        val items = readOrCount() ?: return emptyList()
        val now = clock()
        val kept = JSONArray()
        val result = mutableListOf<JournaledEvent>()
        for (i in 0 until items.length()) {
            val item = items.optJSONObject(i)
            val event = item?.optJSONObject("event")?.let { RawEventCodec.fromJson(it) }
            if (item == null || event == null || !item.has("seq")) {
                counters.increment(CaptureCounterNames.JOURNAL_DROPPED_CORRUPT)
                continue
            }
            val enqueuedAt = item.optLong("at", 0L)
            val attempts = item.optInt("attempts", 0)
            when {
                enqueuedAt <= 0L || now - enqueuedAt > MAX_AGE_MS -> counters.increment(CaptureCounterNames.JOURNAL_DROPPED_STALE)
                attempts >= MAX_ATTEMPTS -> counters.increment(CaptureCounterNames.JOURNAL_DROPPED_FAILED)
                else -> {
                    kept.put(item)
                    result += JournaledEvent(item.getLong("seq"), enqueuedAt, attempts, event)
                }
            }
        }
        if (kept.length() != items.length() && !backend.writeJournal(kept)) {
            counters.increment(CaptureCounterNames.JOURNAL_WRITE_FAILED)
        }
        return result
    }

    /** Number of queued events, read without changing the journal. Used for status only. */
    fun count(): Int = readOrCount()?.length() ?: 0

    /** Removes a processed event. An unknown sequence is a no-op, so repeating this call is safe. */
    fun complete(seq: Long): Boolean {
        val items = readOrCount() ?: return false
        val next = JSONArray()
        for (i in 0 until items.length()) {
            val item = items.optJSONObject(i) ?: continue
            if (item.optLong("seq", -1L) != seq) next.put(item)
        }
        if (next.length() == items.length()) return true
        return backend.writeJournal(next).also { if (!it) counters.increment(CaptureCounterNames.JOURNAL_WRITE_FAILED) }
    }

    /** Counts one failed attempt. The event stays queued until its attempts are exhausted. */
    fun recordFailure(seq: Long): Boolean {
        val items = readOrCount() ?: return false
        val next = JSONArray()
        var found = false
        for (i in 0 until items.length()) {
            val item = items.optJSONObject(i) ?: continue
            if (item.optLong("seq", -1L) == seq) {
                found = true
                next.put(JSONObject(item.toString()).put("attempts", item.optInt("attempts", 0) + 1))
                counters.increment(CaptureCounterNames.RETRY_SCHEDULED)
            } else {
                next.put(item)
            }
        }
        if (!found) return true
        return backend.writeJournal(next).also { if (!it) counters.increment(CaptureCounterNames.JOURNAL_WRITE_FAILED) }
    }

    private fun readOrCount(): JSONArray? =
        backend.readJournal().also { if (it == null) counters.increment(CaptureCounterNames.JOURNAL_READ_FAILED) }

    private fun nextSequence(items: JSONArray): Long {
        var max = 0L
        for (i in 0 until items.length()) max = maxOf(max, items.optJSONObject(i)?.optLong("seq", 0L) ?: 0L)
        return max + 1
    }

    private fun copyOf(items: JSONArray): JSONArray {
        val copy = JSONArray()
        for (i in 0 until items.length()) items.optJSONObject(i)?.let { copy.put(it) }
        return copy
    }

    companion object {
        const val MAX_ITEMS = 200
        const val MAX_ATTEMPTS = 3
        const val MAX_AGE_MS = 6 * 60 * 60 * 1000L
    }
}

/**
 * Processes pending events in arrival order. Each event is removed only after a definitive outcome.
 * A thrown exception, or a storage failure, keeps the event for another attempt, and the event
 * journal drops it after [EventJournal.MAX_ATTEMPTS]. One bad event therefore never blocks the events
 * behind it for longer than its bounded retries. Returns how many events were completed.
 */
fun drainJournal(journal: EventJournal, process: (RawNotificationEvent) -> CaptureOutcome?): Int {
    var completed = 0
    for (item in journal.pending()) {
        val outcome = try { process(item.event) } catch (_: Exception) { null }
        when (outcome) {
            null, CaptureOutcome.PersistenceFailure -> journal.recordFailure(item.seq)
            else -> if (journal.complete(item.seq)) completed += 1
        }
    }
    return completed
}
