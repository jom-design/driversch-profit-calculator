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
        ProviderPreferences.setServiceConnec¶»§q«^