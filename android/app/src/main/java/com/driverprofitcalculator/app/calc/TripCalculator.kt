package com.driverprofitcalculator.app.calc

import java.math.BigDecimal
import java.math.RoundingMode
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/*
 * Kotlin port of src/lib/calculator.ts. Operation order is kept identical to the
 * TypeScript source so IEEE-754 results match. Parity is enforced by
 * TripCalculatorGoldenTest against tests/fixtures/calculator-golden.json, which is
 * generated from the TypeScript engine. Change both sides together.
 */

enum class FareMode { NET, GROSS, UNKNOWN }

enum class Decision { ACCEPT, REVIEW, REJECT }

/** Subset of src/types.ts Settings used by calculateTrip (commission map is not used by the formula). */
data class CalcSettings(
    val fuelPrice: Double,
    val consumptionPer100: Double,
    val maintenancePerKm: Double,
    val minNetProfit: Double,
    val hourlyTarget: Double,
)

/** Subset of src/types.ts TripInput used by calculateTrip. */
data class CalcInput(
    val fare: Double,
    val fareMode: FareMode,
    val commissionRate: Double,
    val pickupKm: Double,
    val passengerKm: Double,
    val returnKm: Double,
    val totalMinutes: Double,
    val extraExpenses: Double,
)

data class CalcResult(
    val totalKm: Double,
    val fuelCost: Double,
    val maintenanceCost: Double,
    val totalCost: Double,
    val netFare: Double,
    val netProfit: Double,
    val hourlyProfit: Double,
    val requiredFare: Double,
    val fareGap: Double,
    val decision: Decision,
    val decisionReason: String,
)

object TripCalculator {

    /** Equivalent of JavaScript Math.round: halves round toward +infinity. */
    internal fun jsRound(x: Double): Double {
        val f = floor(x)
        return if (x - f >= 0.5) f + 1.0 else f
    }

    /** Equivalent of: Math.round((n + Number.EPSILON) * 100) / 100. Number.EPSILON equals Math.ulp(1.0). */
    internal fun money(n: Double): Double = jsRound((n + Math.ulp(1.0)) * 100.0) / 100.0

    /** Equivalent of JavaScript Number.prototype.toFixed(2) for finite values (exact binary value, ties up). */
    internal fun toFixed2(value: Double): String =
        BigDecimal(value).setScale(2, RoundingMode.HALF_UP).toPlainString()

    fun calculate(input: CalcInput, settings: CalcSettings): CalcResult {
        val totalKm = max(0.0, input.pickupKm) + max(0.0, input.passengerKm) + max(0.0, input.returnKm)
        val fuelCost = money(totalKm * settings.consumptionPer100 * settings.fuelPrice / 100.0)
        val maintenanceCost = money(totalKm * settings.maintenancePerKm)
        val totalCost = money(fuelCost + maintenanceCost + max(0.0, input.extraExpenses))
        val rate = if (input.fareMode == FareMode.GROSS) min(100.0, max(0.0, input.commissionRate)) else 0.0
        val netFare = money(max(0.0, input.fare) * (1.0 - rate / 100.0))
        val netProfit = money(netFare - totalCost)
        val hourlyProfit = if (input.totalMinutes > 0.0) money(netProfit * 60.0 / input.totalMinutes) else 0.0
        val targetByTrip = totalCost + settings.minNetProfit
        val targetByHour =
            if (input.totalMinutes > 0.0) totalCost + settings.hourlyTarget * input.totalMinutes / 60.0 else targetByTrip
        val requiredNetFare = money(max(targetByTrip, targetByHour))
        val requiredFare =
            if (input.fareMode == FareMode.GROSS && rate < 100.0) money(requiredNetFare / (1.0 - rate / 100.0))
            else requiredNetFare
        val fareGap = money(requiredFare - max(0.0, input.fare))

        val decision: Decision
        val decisionReason: String
        when {
            input.fareMode == FareMode.UNKNOWN -> {
                decision = Decision.REVIEW
                decisionReason = "أكد أولًا هل الأجرة صافية أم إجمالية قبل اعتماد قرار الربحية."
            }
            input.totalMinutes <= 0.0 -> {
                decision = Decision.REVIEW
                decisionReason = "أدخل وقتًا صحيحًا للرحلة قبل اتخاذ القرار."
            }
            netProfit < settings.minNetProfit -> {
                decision = Decision.REJECT
                decisionReason = "صافي الربح أقل من الحد الأدنى ${toFixed2(settings.minNetProfit)} ج.م."
            }
            hourlyProfit < settings.hourlyTarget -> {
                decision = Decision.REVIEW
                decisionReason =
                    "الربح إيجابي، لكن العائد بالساعة أقل من هدفك ${toFixed2(settings.hourlyTarget)} ج.م."
            }
            else -> {
                decision = Decision.ACCEPT
                decisionReason = "الرحلة تحقق الحد الأدنى لصافي الربح وهدف الربح بالساعة."
            }
        }
        return CalcResult(
            totalKm = money(totalKm),
            fuelCost = fuelCost,
            maintenanceCost = maintenanceCost,
            totalCost = totalCost,
            netFare = netFare,
            netProfit = netProfit,
            hourlyProfit = hourlyProfit,
            requiredFare = requiredFare,
            fareGap = fareGap,
            decision = decision,
            decisionReason = decisionReason,
        )
    }
}
