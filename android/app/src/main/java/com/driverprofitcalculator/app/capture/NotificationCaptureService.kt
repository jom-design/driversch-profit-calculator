package com.driverprofitcalculator.app.capture

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Android entry point for notification capture. It only translates platform events into
 * RawNotificationEvent and hands them to the pure NotificationEventProcessor, so capture works
 * whether or not the calculator UI is open. Nothing here logs notification content.
 */
class NotificationCaptureService : NotificationListenerService() {

    private val diagnostics by lazy { CaptureDiagnostics(this) }
    private val processor by lazy {
        NotificationEventProcessor(
            store = EncryptedNotificationStore(this),
            isProviderEnabled = { id -> ProviderPreferences.enabled(this, id) },
            counters = diagnostics,
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

    private fun handle(sbn: StatusBarNotification, kind: CaptureEventKind, reason: Int?) {
        try {
            val event = toRawEvent(sbn, kind, reason) ?: return
            processor.process(event)
        } catch (_: Exception) {
            // Only the aggregate counter is recorded; the exception message may contain content.
            diagnostics.increment(CaptureCounterNames.PROCESSING_EXCEPTION)
        }
    }

    private fun toRawEvent(sbn: StatusBarNotification, kind: CaptureEventKind, reason: Int?): RawNotificationEvent? {
        val notification: Notification = sbn.notification ?: return null
        val extras = notification.extras
        val title = extras?.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val bigText = extras?.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString().orEmpty()
        val text = extras?.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
        return RawNotificationEvent(
            kind = kind,
            packageName = sbn.packageName,
            key = sbn.key ?: (sbn.packageName + ":" + sbn.id),
            title = title,
            // Expanded text is preferred; ordinary text is the fallback for short notifications.
            text = listOf(bigText, text).firstOrNull { it.isNotBlank() }.orEmpty(),
            postedAtMillis = sbn.postTime,
            isGroupSummary = (notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0,
            removeReason = reason,
        )
    }
}
