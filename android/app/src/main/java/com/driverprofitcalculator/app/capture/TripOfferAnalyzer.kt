package com.driverprofitcalculator.app.capture

import com.driverprofitcalculator.app.calc.CalcInput
import com.driverprofitcalculator.app.calc.CalcSettings
import com.driverprofitcalculator.app.calc.FareMode
import com.driverprofitcalculator.app.calc.TripCalculator
import org.json.JSONArray
import org.json.JSONObject

/**
 * Calculator configuration. Every optional value is null when the user has not set it, and the
 * analyzer never substitutes a default for a missing value.
 */
data class TripAnalysisConfig(
    val settings: CalcSettings,
    /** Commission per provider id. A value of 0 is the web app's placeholder, not a configured rate. */
    val commissionRates: Map<String, Double>,
    val fareModes: Map<String, FareMode>,
    /** Return distance in km, explicitly configured by the user. */
    val returnKm: Double?,
    /** Additional expenses per trip, explicitly configured by the user. */
    val extraExpenses: Double?,
)

enum class OfferRecommendation(val wire: String) {
    ACCEPT("accept"),
    REVIEW("review"),
    REJECT("reject"),
    INSUFFICIENT_DATA("insufficient_data"),
}

/**
 * Result of analysing one offer. Nullable money values are unavailable, not zero.
 * Recommendations are advice only: the driver accepts or rejects inside the original app.
 */
data class NativeTripAnalysis(
    val recommendation: OfferRecommendation,
    /** Estimated net profit. Null unless the full cost model is complete. */
    val netProfit: Double?,
    /** Estimated profit per hour. Null unless the total time (pickup plus trip) is known. */
    val hourlyProfit: Double?,
    val totalCost: Double?,
    val requiredFare: Double?,
    /** Fuel and maintenance for the kilometres the notification states, excluding the return leg. */
    val partialCost: Double?,
    /** Codes of the inputs that are missing or unusable. */
    val missingFields: List<String>,
    val reason: String,
    /** False while the provider's notification format has not been verified on a real device. */
    val payloadVerified: Boolean,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("recommendation", recommendation.wire)
        .put("netProfit", netProfit ?: JSONObject.NULL)
        .put("hourlyProfit", hourlyProfit ?: JSONObject.NULL)
        .put("totalCost", totalCost ?: JSONObject.NULL)
        .put("requiredFare", requiredFare ?: JSONObject.NULL)
        .put("partialCost", partialCost ?: JSONObject.NULL)
        .put("missingFields", JSONArray(missingFields))
        .put("reason", reason)
        .put("payloadVerified", payloadVerified)
}

/**
 * Uses the same Kotlin TripCalculator as manual calculation. It refuses to produce a net profit
 * unless every input is real: fare, both kilometre values, EGP currency, a known fare mode, a usable
 * commission for gross fares, the configured return distance and extra expenses.
 */
object TripOfferAnalyzer {
    fun analyze(offer: NormalizedRideOffer, config: TripAnalysisConfig?): NativeTripAnalysis {
        val verified = ProviderRegistry.forId(offer.providerId)?.payloadVerified == true
        if (config == null) {
            return insufficient(listOf("settings"), "أكمل إعدادات الحساب في التطبيق أولًا.", verified)
        }

        val missing = mutableListOf<String>()
        val fare = usable(offer.fare.value)
        val pickupKm = usable(offer.pickupDistanceKm.value)
        val tripKm = usable(offer.distanceKm.value)
        if (fare == null) missing += "fare"
        if (pickupKm == null) missing += "pickupDistance"
        if (tripKm == null) missing += "tripDistance"
        when (offer.currency) {
            null -> missing += "currency"
            "EGP" -> Unit
            else -> missing += "currencyMismatch"
        }
        val fareMode = offer.fareMode.takeIf { it != FareMode.UNKNOWN }
            ?: config.fareModes[offer.providerId] ?: FareMode.UNKNOWN
        if (fareMode == FareMode.UNKNOWN) missing += "fareMode"
        val commission = config.commissionRates[offer.providerId]
        val commissionUsable = commission != null && commission > 0.0
        // The commission only converts a gross fare to net. A net fare does not need it.
        if (fareMode == FareMode.GROSS && !commissionUsable) missing += "commission"

        val pickupMinutes = usable(offer.pickupMinutes.value)
        val tripMinutes = usable(offer.durationMinutes.value)
        // The trip duration alone is not the working time: the pickup time must be known as well.
        if (pickupMinutes == null) missing += "pickupTime"
        if (tripMinutes == null) missing += "duration"

        val returnKm = usable(config.returnKm)
        val extraExpenses = usable(config.extraExpenses)
        if (returnKm == null) missing += "returnDistance"
        if (extraExpenses == null) missing += "extraExpenses"

        // The partial cost uses only the kilometres the notification states. The return leg is excluded
        // on purpose, so it is a lower bound and never a net profit.
        val partialCost = if (pickupKm != null && tripKm != null) {
            val partial = TripCalculator.calculate(
                CalcInput(0.0, FareMode.NET, 0.0, pickupKm, tripKm, 0.0, 0.0, 0.0),
                config.settings,
            )
            partial.fuelCost + partial.maintenanceCost
        } else null

        if (fare == null || pickupKm == null || tripKm == null || returnKm == null || extraExpenses == null ||
            offer.currency != "EGP" || fareMode == FareMode.UNKNOWN ||
            (fareMode == FareMode.GROSS && !commissionUsable)
        ) {
            return insufficient(missing, "البيانات غير كافية لحساب صافي ربح موثوق.", verified, partialCost)
        }

        val totalMinutes = if (pickupMinutes != null && tripMinutes != null) pickupMinutes + tripMinutes else 0.0
        val result = TripCalculator.calculate(
            CalcInput(
                fare = fare,
                fareMode = fareMode,
                commissionRate = commission ?: 0.0,
                pickupKm = pickupKm,
                passengerKm = tripKm,
                returnKm = returnKm,
                totalMinutes = totalMinutes,
                extraExpenses = extraExpenses,
            ),
            config.settings,
        )
        val hourly = if (totalMinutes > 0.0) result.hourlyProfit else null
        val requiredFare = if (hourly != null) result.requiredFare else null
        val recommendation: OfferRecommendation
        val reason: String
        when {
            result.netProfit < config.settings.minNetProfit -> {
                recommendation = OfferRecommendation.REJECT
                reason = "صافي الربح المقدّر أقل من حدك الأدنى. القرار النهائي بيدك داخل تطبيق السائق."
            }
            hourly == null -> {
                recommendation = OfferRecommendation.REVIEW
                reason = "صافي الربح يحقق حدك، لكن وقت الوصول غير معروف فلا يمكن تقييم العائد بالساعة."
            }
            hourly < config.settings.hourlyTarget -> {
                recommendation = OfferRecommendation.REVIEW
                reason = "صافي الربح موجب، لكن العائد بالساعة أقل من هدفك."
            }
            else -> {
                recommendation = OfferRecommendation.ACCEPT
                reason = "الرحلة تحقق حد صافي الربح وهدف الساعة. القرار النهائي بيدك داخل تطبيق السائق."
            }
        }
        return NativeTripAnalysis(
            recommendation = recommendation,
            netProfit = result.netProfit,
            hourlyProfit = hourly,
            totalCost = result.totalCost,
            requiredFare = requiredFare,
            partialCost = null,
            missingFields = missing.distinct(),
            reason = reason,
            payloadVerified = verified,
        )
    }

    /** Non-finite and negative numbers are treated as unavailable, never as values. */
    private fun usable(value: Double?): Double? = value?.takeIf { it.isFinite() && it >= 0.0 }

    private fun insufficient(
        missing: List<String>,
        reason: String,
        verified: Boolean,
        partialCost: Double? = null,
    ) = NativeTripAnalysis(
        recommendation = OfferRecommendation.INSUFFICIENT_DATA,
        netProfit = null,
        hourlyProfit = null,
        totalCost = null,
        requiredFare = null,
        partialCost = partialCost,
        missingFields = missing.distinct(),
        reason = reason,
        payloadVerified = verified,
    )
}
