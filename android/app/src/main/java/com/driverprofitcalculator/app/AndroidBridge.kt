package com.driverprofitcalculator.app

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.webkit.JavascriptInterface
import com.driverprofitcalculator.app.capture.EncryptedNotificationStore
import com.driverprofitcalculator.app.capture.NotificationCaptureService
import com.driverprofitcalculator.app.capture.ProviderPreferences
import com.driverprofitcalculator.app.capture.ProviderRegistry
import org.json.JSONArray
import org.json.JSONObject

class AndroidBridge(private val activity: MainActivity, private val voice: NativeVoiceController) {
    private val context: Context get() = activity
    @JavascriptInterface fun startSpeechRecognition(): Boolean { voice.startListening(); return true }
    @JavascriptInterface fun stopSpeechRecognition(): Boolean { voice.stopListening(); return true }
    @JavascriptInterface fun speakText(text: String): Boolean { voice.speak(text); return true }
    @JavascriptInterface fun stopSpeaking(): Boolean { voice.stopSpeaking(); return true }

    @JavascriptInterface fun getStatusJson(): String {
        val enabled = JSONArray()
        ProviderPreferences.enabledIds(context).forEach { enabled.put(it) }
        return JSONObject().put("isAndroid", true).put("hasNotificationAccess", hasAccess())
            .put("enabledProviders", enabled)
            .put("serviceConnected", ProviderPreferences.serviceConnected(context))
            .put("lastReceivedAt", EncryptedNotificationStore(context).lastReceivedAt())
            .put("queueHealthy", EncryptedNotificationStore(context).isHealthy()).toString()
    }
    @JavascriptInterface fun getPendingNotificationsJson(): String = EncryptedNotificationStore(context).pendingJson()
    @JavascriptInterface fun acknowledgeNotification(id: String): Boolean = EncryptedNotificationStore(context).acknowledge(id)
    @JavascriptInterface fun setProviderEnabled(id: String, enabled: Boolean): Boolean =
        ProviderPreferences.setEnabled(context, id, enabled)
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
