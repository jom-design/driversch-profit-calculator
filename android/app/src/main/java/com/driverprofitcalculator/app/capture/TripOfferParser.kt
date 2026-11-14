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
    fun toJson(): JSONObject = JSONObject()
        .put("value", value ?: JSONObject.NULL)
        .put("confidence", confidence)
        .put("evidence", if (evidence == null) JSONArray() else JSONArray().put(JSONObject().put("text", evidence).put("start", evidenceStart).put("end", evidenceEnd)))
        .put("status", status)
}

data class NormalizedRideOffer(
    val providerId: String,
    val fare: ExtractedRideField,
    val pickupDistanceKm: ExtractedRideField,
    val distanceKm: ExtractedRideField,
    val durationMinutes: ExtractedRideField,
    val currency: String?,
    val fareMode: FareMode,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("provider", providerId)
        .put("fare", fare.toJson())
        .put("pickupDistanceKm", pickupDistanceKm.toJson())
        .put("distanceKm", distanceKm.toJson())
        .put("durationMinutes", durationMinutes.toJson())
        .put("currency", currency ?: JSONObject.NULL)
        .put("fareMode", fareMode.name.lowercase())
}

/** Conservative provider-specific parser ¶»§q«^