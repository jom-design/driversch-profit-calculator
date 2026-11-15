package com.driverprofitcalculator.app.capture

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException

/**
 * Android entry point for notification capture. It only translates platform events into
 * RawNotificationEvent and hands them to the pure NotificationEventProcessor, so capture works
 * whether or not the calculator UI is open. Nothing here logs notification content.
 */
class NotificationCaptureService : NotificationListenerService() {

    companion object {
        /** Shared by all service instances so posted and removed events keep their order. */
        private val worker: ExecutorService = Executors.newSingleThreadExecutor { task ->
            Thread(task, "notification-capture").apply { isDaemon = true }
        }
    }

    private val diagnostics by lazy { CaptureDiagnostics(this) }
    private val processor by lazy {
        NotificationEventProcessor(
            store = EncryptedNotificationStore(this),
            isProviderEnabled = { id -> ProviderPreferences.enabled(this, id) },
            counters = diagnostics,
            analysisConfig = { TripAnalysisPreferences(this).load() },
        )
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        ProviderPreferences.setServiceConnected(this, true)
        // Notifications already in the tray when the listener (re)connects are processed too.
        // Deduplication by fingerprint prevents duplicate processing results.
        val active = try { activeNotifications } catch (_: Exception) { null }
        active?.forEach { handle(it, CaptureEventKind.POSTED, null) }
    }

    override fun onListenerDisconnected() {
        ProviderPreferences.setServiceConnected(this, false)
        super.onListenerDisconnected()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        handle(sbn, CaptureEventKind.POSTED, null)
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?, rankingMap: RankingMap?, reason: Int) {
        if (sbn != null) handle(sbn, CaptureEventKind.REMOVED, reason)
    }

    /**
     * Copies the platform event on the listener callback (cheap), then hands processing to a single
     * background worker. Parsing, analysis and encrypted storage never run on the callback thread.
     * One worker keeps posted and removed events in order and serializes access to the store.
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
        try {
            worker.execute { processSafely(event) }
        } catch (_: RejectedExecutionException) {
            diagnostics.increment(CaptureCounterNames.PROCESSING_EXCEPTION)
        }
    }

    private fun processSafely(event: RawNotificationEvent) {
        try {
            processor.process(event)
        } catch (_: Exception) {
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
