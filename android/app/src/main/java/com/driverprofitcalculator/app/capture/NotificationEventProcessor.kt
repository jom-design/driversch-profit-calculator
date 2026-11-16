package com.driverprofitcalculator.app.capture

import java.security.MessageDigest

/**
 * Pure (no Android imports) notification processing pipeline:
 *   NotificationCaptureService -> RawNotificationEvent -> NotificationEventProcessor
 *   -> CaptureStore (persistence) and CaptureCounters (safe aggregate diagnostics).
 *
 * Privacy: outcomes and counters never carry notification text.
 */

enum class CaptureEventKind { POSTED, REMOVED }

/** Platform-independent copy of a StatusBarNotification, built by the service. */
data class RawNotificationEvent(
    val kind: CaptureEventKind,
    val packageName: String,
    val key: String,
    val title: String,
    val text: String,
    val postedAtMillis: Long,
    val isGroupSummary: Boolean,
    /** NotificationListenerService removal reason code, meaningful only for REMOVED. */
    val removeReason: Int? = null,
    /** Android MessagingStyle notifications are conversations, not ride offers. */
    val isMessaging: Boolean = false,
)

sealed class CaptureOutcome {
    /** A new offer, or a changed update of a known offer, was persisted for downstream analysis. */
    data class Stored(val notificationId: String, val isUpdate: Boolean) : CaptureOutcome()
    /** Same notification content was already processed: no new processing result is created. */
    data class Duplicate(val notificationId: String) : CaptureOutcome()
    data class Removed(val notificationId: String, val known: Boolean) : CaptureOutcome()
    object UnsupportedPackage : CaptureOutcome()
    object ProviderDisabled : CaptureOutcome()
    object GroupSummary : CaptureOutcome()
    object EmptyPayload : CaptureOutcome()
    object NotRelevant : CaptureOutcome()
    object ParserFailure : CaptureOutcome()
    object PersistenceFailure : CaptureOutcome()
}

/** Storage port. Implemented by EncryptedNotificationStore on device and by fakes in tests. */
interface CaptureStore {
    /** Fingerprint of the last processed content for this notification id, or null if unseen. */
    fun seenFingerprint(notificationId: String): String?
    /** Persists a new or changed offer and records its fingerprint. */
    fun save(payload: NormalizedNotificationPayload, fingerprint: String, isUpdate: Boolean): Boolean
    /** Records a removal: drops the pending offer and remembers the removal. */
    fun markRemoved(notificationId: String, reason: Int?): Boolean
}

/** Counter port. Values are aggregate integers only. */
interface CaptureCounters {
    fun increment(name: String)
}

object CaptureCounterNames {
    const val RECEIVED = "received"
    const val UNSUPPORTED_PACKAGE = "unsupportedPackage"
    const val PROVIDER_DISABLED = "providerDisabled"
    const val GROUP_SUMMARY = "groupSummary"
    const val EMPTY_PAYLOAD = "emptyPayload"
    const val NOT_RELEVANT = "notRelevant"
    const val PARSER_FAILURE = "parserFailure"
    const val DUPLICATE = "duplicate"
    const val UPDATED = "updated"
    const val STORED = "stored"
    const val PERSISTENCE_FAILURE = "persistenceFailure"
    const val REMOVED = "removed"
    const val REMOVED_UNKNOWN = "removedUnknown"
    const val PROCESSING_EXCEPTION = "processingException"
    /** The encrypted queue blob could not be authenticated or parsed and was replaced by an empty queue. */
    const val QUEUE_RESET = "queueReset"
    /** Event journal: an event could not be written before processing, so it is processed in memory only. */
    const val JOURNAL_WRITE_FAILED = "journalWriteFailed"
    /** Event journal: the stored journal could not be read. Nothing was removed from it. */
    const val JOURNAL_READ_FAILED = "journalReadFailed"
    /** Event journal full: a new event was refused and counted, never dropped silently. */
    const val JOURNAL_OVERFLOW = "journalOverflow"
    /** Event journal: an event older than the retention window was dropped instead of processed as new. */
    const val JOURNAL_DROPPED_STALE = "journalDroppedStale"
    /** Event journal: an event kept failing and was dropped after its bounded retries. */
    const val JOURNAL_DROPPED_FAILED = "journalDroppedFailed"
    /** Event journal: a stored entry was unreadable and was removed. */
    const val JOURNAL_DROPPED_CORRUPT = "journalDroppedCorrupt"
    /** A failed event was kept in the journal for another attempt. */
    const val RETRY_SCHEDULED = "retryScheduled"
    val ALL = listOf(
        RECEIVED, UNSUPPORTED_PACKAGE, PROVIDER_DISABLED, GROUP_SUMMARY, EMPTY_PAYLOAD, NOT_RELEVANT,
        PARSER_FAILURE, DUPLICATE, UPDATED, STORED, PERSISTENCE_FAILURE, REMOVED, REMOVED_UNKNOWN,
        PROCESSING_EXCEPTION, QUEUE_RESET, JOURNAL_WRITE_FAILED, JOURNAL_READ_FAILED, JOURNAL_OVERFLOW,
        JOURNAL_DROPPED_STALE, JOURNAL_DROPPED_FAILED, JOURNAL_DROPPED_CORRUPT, RETRY_SCHEDULED,
    )
}

class NotificationEventProcessor(
    private val store: CaptureStore,
    private val isProviderEnabled: (providerId: String) -> Boolean,
    private val counters: CaptureCounters,
    private val analysisConfig: () -> TripAnalysisConfig? = { null },
    private val clock: () -> Long = { System.currentTimeMillis() },
) {
    fun process(event: RawNotificationEvent): CaptureOutcome {
        counters.increment(CaptureCounterNames.RECEIVED)
        val provider = ProviderRegistry.forPackage(event.packageName)
        if (provider == null) {
            counters.increment(CaptureCounterNames.UNSUPPORTED_PACKAGE)
            return CaptureOutcome.UnsupportedPackage
        }
        val id = NotificationPayloadNormalizer.idFor(event.packageName, event.key)
        return when (event.kind) {
            CaptureEventKind.REMOVED -> removed(id, event.removeReason)
            CaptureEventKind.POSTED -> posted(event, provider, id)
        }
    }

    private fun removed(id: String, reason: Int?): CaptureOutcome {
        val known = store.seenFingerprint(id) != null
        counters.increment(CaptureCounterNames.REMOVED)
        if (!known) counters.increment(CaptureCounterNames.REMOVED_UNKNOWN)
        if (known && !store.markRemoved(id, reason)) {
            counters.increment(CaptureCounterNames.PERSISTENCE_FAILURE)
            return CaptureOutcome.PersistenceFailure
        }
        return CaptureOutcome.Removed(id, known)
    }

    private fun posted(event: RawNotificationEvent, provider: RideProvider, id: String): CaptureOutcome {
        // Group summaries carry no offer content; the bundled children are processed individually.
        if (event.isMessaging) {
            counters.increment(CaptureCounterNames.NOT_RELEVANT)
            return CaptureOutcome.NotRelevant
        }
        if (event.isGroupSummary) {
            counters.increment(CaptureCounterNames.GROUP_SUMMARY)
            return CaptureOutcome.GroupSummary
        }
        if (!isProviderEnabled(provider.id)) {
            counters.increment(CaptureCounterNames.PROVIDER_DISABLED)
            return CaptureOutcome.ProviderDisabled
        }
        val title = event.title.trim()
        val text = event.text.trim()
        // Some offers carry their content only in the title; the parser reads both fields.
        if (title.isEmpty() && text.isEmpty()) {
            counters.increment(CaptureCounterNames.EMPTY_PAYLOAD)
            return CaptureOutcome.EmptyPayload
        }
        if (!ProviderRegistry.relevant(provider, title, text)) {
            counters.increment(CaptureCounterNames.NOT_RELEVANT)
            return CaptureOutcome.NotRelevant
        }
        val fingerprint = fingerprintOf(title, text)
        val previous = store.seenFingerprint(id)
        if (previous == fingerprint) {
            counters.increment(CaptureCounterNames.DUPLICATE)
            return CaptureOutcome.Duplicate(id)
        }
        val isUpdate = previous != null
        val payload = NotificationPayloadNormalizer.normalize(
            event.packageName, event.key, title, text, event.postedAtMillis, clock(), analysisConfig(),
        )
        if (payload == null) {
            counters.increment(CaptureCounterNames.PARSER_FAILURE)
            return CaptureOutcome.ParserFailure
        }
        if (!store.save(payload, fingerprint, isUpdate)) {
            counters.increment(CaptureCounterNames.PERSISTENCE_FAILURE)
            return CaptureOutcome.PersistenceFailure
        }
        counters.increment(if (isUpdate) CaptureCounterNames.UPDATED else CaptureCounterNames.STORED)
        return CaptureOutcome.Stored(id, isUpdate)
    }

    companion object {
        /** Content fingerprint. Post time is excluded, so a re-delivery with identical content is a duplicate. */
        fun fingerprintOf(title: String, text: String): String =
            MessageDigest.getInstance("SHA-256")
                .digest((title + "\u001F" + text).toByteArray(Charsets.UTF_8))
                .joinToString("") { "%02x".format(it) }
    }
}
