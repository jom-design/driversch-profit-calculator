package com.driverprofitcalculator.app.capture

import android.content.Context

/** Per-package, opt-in controls for speaking notification content. All apps are disabled by default. */
object NotificationSpeechPreferences {
    private const val FILE = "notification_speech_preferences"
    private const val KEY_MASTER = "master_enabled"
    private fun prefs(context: Context) = context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun allEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_MASTER, false)
    fun setAllEnabled(context: Context, enabled: Boolean): Boolean =
        prefs(context).edit().putBoolean(KEY_MASTER, enabled).commit()

    fun appEnabled(context: Context, packageName: String): Boolean =
        packageName.isNotBlank() && prefs(context).getBoolean("app:$packageName", false)

    fun setAppEnabled(context: Context, packageName: String, enabled: Boolean): Boolean {
        if (packageName.isBlank() || packageName == context.packageName) return false
        return prefs(context).edit().putBoolean("app:$packageName", enabled).commit()
    }

    fun shouldSpeak(context: Context, packageName: String): Boolean =
        allEnabled(context) && appEnabled(context, packageName)
}
