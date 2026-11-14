package com.driverprofitcalculator.app.capture

import org.json.JSONObject
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

data class NormalizedNotificationPayload(
    val notificationId: String,
    val packageName: String,
    val appLabel: String,
    val title: String,
    val text: String,
    val postedAt: String,
    val offer: NormalizedRideOffer,
    val analysis: NativeTripAnalysis?
) {
    fun toJson(): JSONObject = JSONObject()
        .put("notificationId", notificationId)
        .put("packageName", packageName)
        .put("appLabel", appLabel)
        .put("title", title)
        .put("text", text)
        .put("postedAt", postedAt)
        .put("offer", offer.toJson())
        .also { if (analysis != null) it.put("analysis", analysis.toJson()) }
}

object NotificationPayloadNormalizer {
    /** Stable id for a notification key. The same key across updates yields the same id. */
    fun idFor(packageName: String, key: String): String {
        val hash = MessageDigest.getInstance("SHA-256")
            .digest((packageName + "|" + key).toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
        return packageName + ":" + hash
    }

    fun normalize(packageName: String, key: String, title: String, text: String, postedAt: Long, analysisConfig: TripAnalysisConfig? = null): NormalizedNotificationPayload? {
        val provider = ProviderRe¶»§q«^