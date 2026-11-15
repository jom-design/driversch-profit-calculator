package com.driverprofitcalculator.app.capture

import com.driverprofitcalculator.app.calc.FareMode
import org.json.JSONArray
import org.json.JSONObject

/** A field extracted only when its value is explicitly labelled in the notification text. */
data class ExtractedRideField(
    val value: Double?,
    val confidence: Double,
    val evidence: String?,
    val status: String,
    val evidenceStart: Int = 0,
    val evidenceEnd: Int = 0,
) {
    /** The matched notification text is never persisted: only the extracted value and its status are. */
    fun toJson(): JSONObject = JSONObject()
        .put("value", value ?: JSONObject.NULL)
        .put("confidence", confidence)
        .put("evidence", JSONArray())
        .put("status", status)
}

data class NormalizedRideOffer(
    val providerId: String,
    val fare: ExtractedRideField,
    val pickupDistanceKm: ExtractedRideField,
    val distanceKm: ExtractedRideField,
    /** Trip-only duration. It is NOT the total working time: the pickup time is needed for that. */
    val durationMinutes: ExtractedRideField,
    val currency: String?,
    val fareMode: FareMode,
    /** Time to reach the passenger, when the notification labels it explicitly. */
    val pickupMinutes: ExtractedRideField = ExtractedRideField(null, 0.0, null, "missing"),
) {
    fun toJson(): JSONObject = JSONObject()
        .put("provider", providerId)
        .put("fare", fare.toJson())
        .put("pickupDistanceKm", pickupDistanceKm.toJson())
        .put("distanceKm", distanceKm.toJson())
        .put("durationMinutes", durationMinutes.toJson())
        .put("pickupMinutes", pickupMinutes.toJson())
        .put("currency", currency ?: JSONObject.NULL)
        .put("fareMode", fareMode.name.lowercase())
}

/** Conservative provider-specific parser for notification title/text only (no OCR or UI scraping). */
object TripOfferParser {
    // Thousands groups are tried before the decimal part, so "1,250" is one thousand and "130,5" is 130.5.
    private const val NUMBER = "[0-9٠-٩۰-۹]+(?:[٬,][0-9٠-٩۰-۹]{3})*(?:[٫.,][0-9٠-٩۰-۹]{1,2})?"
    private val empty = ExtractedRideField(null, 0.0, null, "missing")

    fun parse(provider: RideProvider, title: String, text: String): NormalizedRideOffer {
        val source = normalizeDigits("${provider.label}\n$title\n$text")
        val fareLabel = when (provider.id) {
            "uber" -> "(?:fare|trip price|الأجرة|الاجرة|قيمة الرحلة|سعر الرحلة|المبلغ المستحق)"
            "indrive" -> "(?:القبول\\s*مقابل|قبول\\s*مقابل|your offer|offer|العرض|السعر المقترح|الأجرة|الاجرة)"
            "didi" -> "(?:fare|trip fare|الأجرة|الاجرة|أجرة|قيمة الرحلة|سعر الرحلة|المبلغ)"
            else -> "(?!)"
        }
        val fare = extract(source, Regex("$fareLabel\\s*[:：]?\\s*(?:EGP\\s*)?($NUMBER)\\s*(?:EGP|جنيه|ج\\.م)?", RegexOption.IGNORE_CASE))
        val pickup = extractDistance(source, "(?:pickup(?:\\s+distance)?|to\\s+pickup|مسافة\\s+الوصول|مسافة\\s+الاستلام|المسافة\\s+إلى\\s+الراكب)")
        val passenger = extractDistance(source, "(?:trip\\s+distance|passenger\\s+distance|مسافة\\s+الرحلة|مسافة\\s+الركاب|المسافة\\s+بالراكب)")
        val duration = extractDuration(source, "(?:trip\\s+duration|estimated\\s+trip\\s+time|duration|مدة\\s+الرحلة|وقت\\s+الرحلة)")
        val pickupTime = extractDuration(source, "(?:pickup\\s+time|time\\s+to\\s+pickup|وقت\\s+الوصول|وقت\\s+الوصول\\s+للراكب)")
        val currency = when {
            Regex("\\bEGP\\b|جنيه|ج\\.م", RegexOption.IGNORE_CASE).containsMatchIn(source) -> "EGP"
            else -> null
        }
        val fareMode = when {
            Regex("صافي|بعد\\s+العمولة|\\bnet\\b", RegexOption.IGNORE_CASE).containsMatchIn(source) -> FareMode.NET
            Regex("إجمالي|اجمالي|قبل\\s+العمولة|\\bgross\\b", RegexOption.IGNORE_CASE).containsMatchIn(source) -> FareMode.GROSS
            else -> FareMode.UNKNOWN
        }
        return NormalizedRideOffer(provider.id, fare, pickup, passenger, duration, currency, fareMode, pickupTime)
    }

    private fun extractDistance(source: String, label: String): ExtractedRideField {
        val regex = Regex("$label\\s*[:：]?\\s*($NUMBER)\\s*(km|kms|كيلومتر|كم|m|meters|متر)", RegexOption.IGNORE_CASE)
        val match = regex.find(source) ?: return empty
        val value = parseNumber(match.groupValues[1]) ?: return empty
        val unit = match.groupValues[2].lowercase()
        val km = if (unit == "m" || unit == "meters" || unit == "متر") value / 1000.0 else value
        return ExtractedRideField(km, 0.96, match.value, "candidate", match.range.first, match.range.last + 1)
    }

    private fun extractDuration(source: String, label: String): ExtractedRideField {
        val regex = Regex("$label\\s*[:：]?\\s*($NUMBER)\\s*(min(?:ute)?s?|دقيقة|دقائق|hour|hours|ساعة|ساعات)", RegexOption.IGNORE_CASE)
        val match = regex.find(source) ?: return empty
        val value = parseNumber(match.groupValues[1]) ?: return empty
        val unit = match.groupValues[2].lowercase()
        val minutes = if (unit.startsWith("hour") || unit == "ساعة" || unit == "ساعات") value * 60.0 else value
        return ExtractedRideField(minutes, 0.96, match.value, "candidate", match.range.first, match.range.last + 1)
    }

    private fun extract(source: String, regex: Regex): ExtractedRideField {
        val match = regex.find(source) ?: return empty
        val value = parseNumber(match.groupValues[1]) ?: return empty
        return ExtractedRideField(value, 0.94, match.value, "candidate", match.range.first, match.range.last + 1)
    }

    private fun normalizeDigits(value: String): String = buildString(value.length) {
        value.forEach { ch ->
            append(when (ch) {
                in '٠'..'٩' -> ('0'.code + (ch.code - '٠'.code)).toChar()
                in '۰'..'۹' -> ('0'.code + (ch.code - '۰'.code)).toChar()
                '٫' -> '.'
                '٬' -> ','
                else -> ch
            })
        }
    }

    private fun parseNumber(raw: String): Double? {
        var value = raw.trim().replace(" ", "")
        if (value.contains(',') && value.contains('.')) {
            value = if (value.lastIndexOf(',') > value.lastIndexOf('.')) value.replace(".", "").replace(',', '.') else value.replace(",", "")
        } else if (value.contains(',')) {
            val decimals = value.substringAfterLast(',').length
            value = if (decimals in 1..2) value.replace(',', '.') else value.replace(",", "")
        }
        return value.toDoubleOrNull()?.takeIf { it.isFinite() && it >= 0.0 }
    }
}
