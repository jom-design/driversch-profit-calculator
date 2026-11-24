package com.driverprofitcalculator.app.capture

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException

/**
 * Android entry point for notification capture. It translates platform events into
 * RawNotificationEvent, journals them durably, and processes them in order on one background worker.
 * Capture works whether or not the calculator UI is open. Nothing here logs notification content.
 */
class NotificationCaptureService : NotificationListenerService() {

    companion object {
        private const val MAX_ANNOUNCEMENT_AGE_MS = 120_000L
        /** Shared by all service instances so posted and removed events keep their order. */
        private val worker: ExecutorService = Executors.newSingleThreadExecutor { task ->
            Thread(task, "notification-capture").apply { isDaemon = true }
        }

        /**
         * True only while this process has an active listener connection. It is process-scoped on
         * purpose: a persisted flag can still say "connected" after the process has been killed.
         */
        @Volatile
        var listenerConnectedInProcess: Boolean = false
            private set
    }

    private val diagnostics by lazy { CaptureDiagnostics(this) }
    private val store by lazy { EncryptedNotificationStore(this) }
    private val journal by lazy { EventJournal(store, diagnostics) }
    private var announcer: BackgroundOfferAnnouncer? = null
    private val processor by lazy {
        NotificationEventProcessor(
            store = store,
            isProviderEnabled = { id -> ProviderPreferences.enabled(this, id) },
            counters = diagnostics,
            analysisConfig = { TripAnalysisPreferences(this).load() },
        )
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        listenerConnectedInProcess = true
        ProviderPreferences.setServiceConnected(this, true)
        // Notifications already in the tray when the listener (re)connects are processed too.
        // Deduplication by fingerprint prevents duplicate processing results.
        val active = try { activeNotifications } catch (_: Exception) { null }
        active?.forEach { handle(it, CaptureEventKind.POSTED, null) }
        // Events journaled before a process death are processed now, in their original order.
        submit { drain() }
    }

    override fun onListenerDisconnected() {
        listenerConnectedInProcess = false
        ProviderPreferences.setServiceConnected(this, false)
        super.onListenerDisconnected()
    }

    override fun onDestroy() {
        listenerConnectedInProcess = false
        announcer?.shutdown()
        announcer = null
        super.onDestroy()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        handle(sbn, CaptureEventKind.POSTED, null)
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?, rankingMap: RankingMap?, reason: Int) {
        if (sbn != null) handle(sbn, CaptureEventKind.REMOVED, reason)
    }

    /**
     * Copies the platform event on the listener callback (cheap), then hands it to the worker.
     * Journaling, parsing, analysis and encrypted storage never run on the callback thread.
     */
    private fun handle(sbn: StatusBarNotification, kind: CaptureEventKind, reason: Int?) {
        val event: RawNotificationEvent
        try {
            event = toRawEvent(sbn, kind, reason) ?: return
        } catch (_: Exception) {
            // Only the aggregate counter is recorded; exception messages may contain content.
            diagnostics.increment(CaptureCounterNames.PROCESSING_EXCEPTION)
            return
        }
        submit { accept(event) }
    }

    /** Runs on the worker: journal first, then process everything pending in order. */
    private fun accept(event: RawNotificationEvent) {
        if (journal.append(event) == null) {
            // Not journaled: it is still processed now, but a process death before that would lose it.
            // The JOURNAL_WRITE_FAILED counter makes that risk visible.
            processSafely(event)
        }
        drain()
    }

    /** Processes every journaled event in order. A failed event is retried, then dropped with a counter. */
    private fun drain() {
        drainJournal(journal) { event ->
            try {
                processAndAnnounce(event)
            } catch (_: Exception) {
                // Counted without the message: exception text may contain notification content.
                diagnostics.increment(CaptureCounterNames.PROCESSING_EXCEPTION)
                null
            }
        }
    }

    private fun processAndAnnounce(event: RawNotificationEvent): CaptureOutcome {
        val outcome = processor.process(event)
        val isRecentPost = event.postedAtMillis > 0L &&
            System.currentTimeMillis() - event.postedAtMillis <= MAX_ANNOUNCEMENT_AGE_MS
        if (event.kind == CaptureEventKind.POSTED && isRecentPost && outcome is CaptureOutcome.Stored &&
            BackgroundOfferAnnouncer.enabled(this)) {
            val payload = try {
                val array = org.json.JSONArray(store.pendingJson())
                (0 until array.length()).firstNotNullOfOrNull { index ->
                    array.optJSONObject(index)?.takeIf { it.optString("notificationId") == outcome.notificationId }
                }
            } catch (_: Exception) { null }
            if (payload != null) (announcer ?: BackgroundOfferAnnouncer(this).also { announcer = it })
                .announce(outcome.notificationId, payload)
        }
        return outcome
    }

    private fun processSafely(event: RawNotificationEvent) {
        try {
            processAndAnnounce(event)
        } catch (_: Exception) {
            diagnostics.increment(CaptureCounterNames.PROCESSING_EXCEPTION)
        }
    }

    private fun submit(task: Runnable) {
        try {
            worker.execute(task)
        } catch (_: RejectedExecutionException) {
            diagnostics.increment(CaptureCounterNames.PROCESSING_EXCEPTION)
        }
    }

    private fun toRawEvent(sbn: StatusBarNotification, kind: CaptureEventKind, reason: Int?): RawNotificationEvent? {
        val notification: Notification = sbn.notification ?: return null
        val extras = notification.extras
        val title = extras?.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val bigText = extras?.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString().orEmpty()
        val text = extras?.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
        val isMessaging = extras?.containsKey(Notification.EXTRA_MESSAGES) == true ||
            extras?.containsKey(Notification.EXTRA_HISTORIC_MESSAGES) == true
        val bundledLines = if (!isMessaging) extras?.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
            ?.take(12)?.joinToString("\n") { it.toString() }.orEmpty() else ""
        return RawNotificationEvent(
            kind = kind,
            packageName = sbn.packageName,
            key = sbn.key ?: (sbn.packageName + ":" + sbn.id),
            title = title,
            // Expanded text is preferred; ordinary text is the fallback for short notifications.
            text = listOf(bigText, text, bundledLines).firstOrNull { it.isNotBlank() }.orEmpty().take(4000),
            postedAtMillis = sbn.postTime,
            isGroupSummary = (notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0,
            isMessaging = isMessaging,
            removeReason = reason,
        )
    }
}
