package com.driverprofitcalculator.app.capture

import org.json.JSONObject
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

object NotificationPayloadNormalizer {
    fun normalize(packageName: String, key: String, title: String, text: String, postedAt: Long): JSONObject? {
        val provider = ProviderRegistry.forPackage(packageName) ?: return null
        val cleanTitle = title.trim().take(300)
        val cleanText = text.trim().take(4000)
        if (cleanText.isBlank() || !ProviderRegistry.relevant(provider, cleanTitle, cleanText)) return null
        val hash = MessageDigest.getInstance("SHA-256")
            .digest((packageName + "|" + key).toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
        val date = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date(postedAt))
        return JSONObject().put("notificationId", packageName + ":" + hash)
            .put("packageName", packageName).put("appLabel", provider.label)
            .put("title", cleanTitle).put("text", cleanText).put("postedAt", date)
    }
}
