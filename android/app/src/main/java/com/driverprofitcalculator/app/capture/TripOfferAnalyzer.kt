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
 * return distance and additional expenses are not present in a nor¶»§q«^