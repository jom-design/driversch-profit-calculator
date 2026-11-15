package com.driverprofitcalculator.app.capture

import org.json.JSONObject
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * One captured offer. [title] and [text] exist in memory only while this payload is being built;
 * [toJson], which is what the encrypted queue stores, never includes them.
 */
data class NormalizedNotificationPayload(
    val notificationId: String,
    val packageName: String,
    val appLabel: String,
    val title: String,
    val text: String,
    /** When the notification was posted, from the platform. */
    val postedAt: String,
    /** When this app processed it. */
    val capturedAt: String,
    val offer: NormalizedRideOffer,
    val analysis: NativeTripAnalysis,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("notificationId", notificationId)
        .put("packageName", packageName)
        .put("appLabel", appLabel)
        .put("postedAt", postedAt)
        .put("capturedAt", capturedAt)
        .put("offer", offer.toJson())
        .put("analysis", analysis.toJson())
}

object NotificationPayloadNormalizer {
    /** Stable id for a notification key. The same key across updates yields the same id. */
    fun idFor(packageName: String, key: String): String {
        val hash = MessageDigest.getInstance("SHA-256")
            .digest((packageName + "|" + key).toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
        return packageName + ":" + hash
    }

    fun normalize(
        packageName: String,
        key: String,
        title: String,
        text: String,
        postedAt: Long,
        capturedAt: Long = postedAt,
        analysisConfig: TripAnalysisConfig? = null,
    ): NormalizedNotificationPayload? {
        val provider = ProviderRegistry.forPackage(packageName) ?: return null
        val cleanTitle = title.trim().take(300)
        val cleanText = text.trim().take(4000)
        if (cleanText.isBlank() || !ProviderRegistry.relevant(provider, cleanTitle, cleanText)) return null
        val offer = TripOfferParser.parse(provider, cleanTitle, cleanText)
        val analysis = TripOfferAnalyzer.analyze(offer, analysisConfig)
        return NormalizedNotificationPayload(
            notificationId = idFor(packageName, key),
            packageName = packageName,
            appLabel = provider.label,
            title = cleanTitle,
            text = cleanText,
            postedAt = isoUtc(postedAt),
            capturedAt = isoUtc(capturedAt),
            offer = offer,
            analysis = analysis,
        )
    }

    private fun isoUtc(millis: Long): String =
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date(millis))
}
