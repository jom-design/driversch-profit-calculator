package com.driverprofitcalculator.app.capture

import com.driverprofitcalculator.app.calc.CalcInput
import com.driverprofitcalculator.app.calc.CalcSettings
import com.driverprofitcalculator.app.calc.Decision
import com.driverprofitcalculator.app.calc.FareMode
import com.driverprofitcalculator.app.calc.TripCalculator
import org.json.JSONArray
import org.json.JSONObject

/** Settings mirrored from the user's calculator; no platform commission is invented. */
data class TripAnalysisConfig(
    val settings: CalcSettings,
    val commissionRates: Map<String, Double>,
    val fareModes: Map<String, FareMode>,
)

data class NativeTripAnalysis(
    val netProfit: Double,
    val hourlyProfit: Double,
    val totalCost: Double,
    val requiredFare: Double,
    val decision: Decision,
    val calculatedDecision: Decision,
    val reason: String,
    val assumptions: List<String>,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("status", "review")
        .put("netProfit", netProfit)
        .put("hourlyProfit", hourlyProfit)
        .put("totalCost", totalCost)
        .put("requiredFare", requiredFare)
        .put("decision", decision.name.lowercase())
        .put("calculatedDecision", calculatedDecision.name.lowercase())
        .put("reason", reason)
        .put("assumptions", JSONArray(assumptions))
}

/** Uses the same Kotlin TripCalculator as manual trip calculation. Results stay REVIEW because
 * return distance and additional expenses are not present in a normal offer notification. */
object TripOfferAnalyzer {
    fun analyze(offer: NormalizedRideOffer, config: TripAnalysisConfig?): NativeTripAnalysis? {
        config ?: return null
        if (offer.currency != "EGP") return null
        val fare = offer.fare.value ?: return null
        val pickupKm = offer.pickupDistanceKm.value ?: return null
        val passengerKm = offer.distanceKm.value ?: return null
        val minutes = offer.durationMinutes.value ?: return null
        val fareMode = offer.fareMode.takeIf { it != FareMode.UNKNOWN }
            ?: config.fareModes[offer.providerId] ?: FareMode.UNKNOWN
        if (fareMode == FareMode.UNKNOWN) return null
        val commissionRate = config.commissionRates[offer.providerId] ?: return null
        val result = TripCalculator.calculate(
            CalcInput(
                fare = fare,
                fareMode = fareMode,
                commissionRate = commissionRate,
                pickupKm = pickupKm,
                passengerKm = passengerKm,
                returnKm = 0.0,
                totalMinutes = minutes,
                extraExpenses = 0.0,
            ),
            config.settings,
        )
        val assumptions = listOf("مسافة العودة غير مدخلة", "المصروفات الإضافية غير مدخلة", "راجع نسبة العمولة المسجلة في الإعدادات")
        return NativeTripAnalysis(
            netProfit = result.netProfit,
            hourlyProfit = result.hourlyProfit,
            totalCost = result.totalCost,
            requiredFare = result.requiredFare,
            decision = Decision.REVIEW,
            calculatedDecision = result.decision,
            reason = "تقدير أولي فقط؛ راجع مسافة العودة والمصروفات الإضافية قبل اعتماد القرار.",
            assumptions = assumptions,
        )
    }
}

// CI validation for the verified Phase 3 notification-analysis pipeline.
