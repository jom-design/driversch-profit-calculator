package com.driverprofitcalculator.app

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.webkit.JavascriptInterface
import com.driverprofitcalculator.app.capture.BackgroundOfferAnnouncer
import com.driverprofitcalculator.app.capture.CaptureDiagnostics
import com.driverprofitcalculator.app.capture.EncryptedNotificationStore
import com.driverprofitcalculator.app.capture.EventJournal
import com.driverprofitcalculator.app.capture.NotificationCaptureService
import com.driverprofitcalculator.app.capture.NotificationSpeechPreferences
import com.driverprofitcalculator.app.capture.ProviderPreferences
import com.driverprofitcalculator.app.capture.ProviderRegistry
import com.driverprofitcalculator.app.capture.TripAnalysisPreferences
import org.json.JSONArray
import org.json.JSONObject

class AndroidBridge(private val activity: MainActivity, private val voice: NativeVoiceController) {
    private val context: Context get() = activity
    @JavascriptInterface fun startSpeechRecognition(languageTag: String): Boolean { voice.startListening(languageTag); return true }
    @JavascriptInterface fun setVoiceLanguage(languageTag: String): Boolean { voice.setLanguage(languageTag); return true }
    @JavascriptInterface fun setSystemTheme(theme: String): Boolean { activity.applySystemTheme(theme == "light"); return true }
    @JavascriptInterface fun stopSpeechRecognition(): Boolean { voice.stopListening(); return true }
    @JavascriptInterface fun speakText(text: String): Boolean { voice.speak(text); return true }
    @JavascriptInterface fun stopSpeaking(): Boolean { voice.stopSpeaking(); return true }

    @JavascriptInterface fun getStatusJson(): String {
        val enabled = JSONArray()
        ProviderPreferences.enabledIds(context).forEach { enabled.put(it) }
        val store = EncryptedNotificationStore(context)
        return JSONObject().put("isAndroid", true).put("hasNotificationAccess", hasAccess())
            .put("enabledProviders", enabled)
            // Verified in this process: a persisted flag can outlive the listener it describes.
            .put("serviceConnected", NotificationCaptureService.listenerConnectedInProcess)
            .put("queuedEvents", EventJournal(store, CaptureDiagnostics(context)).count())
            .put("lastReceivedAt", store.lastReceivedAt())
            .put("queueHealthy", store.isHealthy())
            .put("backgroundAnnouncementsEnabled", BackgroundOfferAnnouncer.enabled(context))
            .put("notificationSpeechEnabled", NotificationSpeechPreferences.allEnabled(context))
            .put("captureCounters", CaptureDiagnostics(context).snapshotJson()).toString()
    }
    @JavascriptInterface fun getPendingNotificationsJson(): String = EncryptedNotificationStore(context).pendingJson()
    @JavascriptInterface fun getNotificationSpeechAppsJson(): String {
        val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val apps = context.packageManager.queryIntentActivities(launcher, 0)
            .mapNotNull { resolve ->
                val info = resolve.activityInfo?.applicationInfo ?: return@mapNotNull null
                if (info.packageName == context.packageName) return@mapNotNull null
                JSONObject()
                    .put("packageName", info.packageName)
                    .put("label", resolve.loadLabel(context.packageManager)?.toString() ?: info.packageName)
                    .put("enabled", NotificationSpeechPreferences.appEnabled(context, info.packageName))
            }
            .distinctBy { it.optString("packageName") }
            .sortedBy { it.optString("label").lowercase() }
        return JSONArray(apps).toString()
    }
    @JavascriptInterface fun setNotificationSpeechEnabled(enabled: Boolean): Boolean {
        val saved = NotificationSpeechPreferences.setAllEnabled(context, enabled)
        if (saved && !enabled) NotificationCaptureService.stopBackgroundAnnouncements()
        return saved
    }
    @JavascriptInterface fun setNotificationAppSpeechEnabled(packageName: String, enabled: Boolean): Boolean {
        val saved = NotificationSpeechPreferences.setAppEnabled(context, packageName, enabled)
        if (saved && !enabled) NotificationCaptureService.stopBackgroundAnnouncements()
        return saved
    }
    @JavascriptInterface fun acknowledgeNotification(id: String): Boolean = EncryptedNotificationStore(context).acknowledge(id)
    @JavascriptInterface fun setTripAnalysisSettings(json: String): Boolean =
        TripAnalysisPreferences(context).saveFromJson(json)
    @JavascriptInterface fun setProviderEnabled(id: String, enabled: Boolean): Boolean =
        ProviderPreferences.setEnabled(context, id, enabled)
    @JavascriptInterface fun setBackgroundAnnouncementsEnabled(enabled: Boolean): Boolean {
        val saved = BackgroundOfferAnnouncer.setEnabled(context, enabled)
        if (saved && !enabled) NotificationCaptureService.stopBackgroundAnnouncements()
        return saved
    }
    @JavascriptInterface fun openNotificationAccessSettings(): Boolean = try {
        context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
    } catch (_: Exception) { false }

    private fun hasAccess(): Boolean {
        val setting = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners").orEmpty()
        val component = ComponentName(context, NotificationCaptureService::class.java).flattenToString()
        return setting.split(':').any { it.equals(component, true) }
    }
}
