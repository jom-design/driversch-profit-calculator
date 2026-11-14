package com.driverprofitcalculator.app

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.webkit.JavascriptInterface
import com.driverprofitcalculator.app.capture.CaptureDiagnostics
import com.driverprofitcalculator.app.capture.EncryptedNotificationStore
import com.driverprofitcalculator.app.capture.NotificationCaptureService
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
    @JavascriptInterface fun stopSpeaking(): Boolean { voice.stopSpeaking(); return true ¶»§q«^