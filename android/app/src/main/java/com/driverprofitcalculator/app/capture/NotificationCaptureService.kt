package com.driverprofitcalculator.app.capture

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

class NotificationCaptureService : NotificationListenerService() {
    override fun onListenerConnected() {
        super.onListenerConnected()
        ProviderPreferences.setServiceConnected(this, true)
    }

    override fun onListenerDisconnected() {
        ProviderPreferences.setServiceConnected(this, false)
        super.onListenerDisconnected()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val provider = ProviderRegistry.forPackage(sbn.packageName) ?: return
        if (!ProviderPreferences.enabled(this, provider.id)) return
        val extras = sbn.notification.extras ?: return
        val title = extras.getCharSequence("android.title")?.toString().orEmpty()
        val expanded = extras.getCharSequence("android.bigText")?.toString().orEmpty()
        val ordinary = extras.getCharSequence("android.text")?.toString().orEmpty()
        val text = listOf(expanded, ordinary).firstOrNull { it.isNotBlank() }.orEmpty()
        if (text.isBlank()) return
        val payload = NotificationPayloadNormalizer.normalize(
            sbn.packageName, sbn.key ?: (sbn.packageName + ":" + sbn.id), title, text, sbn.postTime
        ) ?: return
        // No notification text is logged or sent over a network.
        EncryptedNotificationStore(this).put(payload.toJson())
    }
}
