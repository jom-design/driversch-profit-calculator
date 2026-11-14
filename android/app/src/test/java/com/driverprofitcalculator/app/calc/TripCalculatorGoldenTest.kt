package com.driverprofitcalculator.app.calc

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Parity tests: every case in the golden fixture was produced by the TypeScript engine
 * (src/lib/calculator.ts). The Kotlin port must reproduce each value exactly.
 */
class TripCalculatorGoldenTest {

    private fun loadFixture(): JSONObject {
        val stream = javaClass.classLoader!!.getResourceAsStream("calculator-golden.json")
            ?: error("calculator-golden.json is missing from test resources")
        return JSONObject(stream.bufferedReader(Charsets.UTF_8).use { it.readText() })
    }

    private fun parseMode(value: String): FareMode = when (value) {
        "net" -> FareMode.NET
        "gross" -> FareMode.GROSS
        "unknown" -> FareMode.UNKNOWN
        else -> error("unknown fareMode in fixture: $value")
    }

    private fun parseDecision(value: String): Decision = when (value) {
        "accept" -> Decision.ACCEPT
        "review" -> Decision.REVIEW
        "reject" -> Decision.REJECT
        else -> error("unknown decision in fixture: $value")
    }

    @Test
    fun everyGoldenCaseMatchesTypeScriptEngine() {
        val cases = loadFixture().getJSONArray("cases")
        assertTrue("fixture must contain cases", cases.length() > 0)
        val mismatches = mutableListOf<String>()
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val name = c.getString("name")
            val s = c.getJSONObject("settings")
            val inp = c.getJSONObject("input")
            val exp = c.getJSONObject("expected")
            val settings = CalcSettings(
                fuelPrice = s.getDouble("fuelPrice"),
                consumptionPer100 = s.getDouble("consumptionPer100"),
                maintenancePerKm = s.getDouble("maintenancePerKm"),
                minNetProfit = s.getDouble("minNetProfit"),
                hourlyTarget = s.getDouble("hourlyTarget"),
            )
            val input = CalcInput(
                fare = inp.getDouble("fare"),
                fareMode = parseMode(inp.getString("fareMode")),
                commissionRate = inp.getDouble("commissionRate"),
                pickupKm = inp.getDouble("pickupKm"),
                passengerKm = inp.getDouble("passengerKm"),
                returnKm = inp.getDouble("returnKm"),
                totalMinutes = inp.getDouble("totalMinutes"),
                extraExpenses = inp.getDouble("extraExpenses"),
            )
            val actual = TripCalculator.calculate(input, settings)
            val checks = listOf(
                "totalKm" to (actual.totalKm to exp.getDouble("totalKm")),
                "fuelCost" to (actual.fuelCost to exp.getDouble("fuelCost")),
                "maintenanceCost" to (actual.maintenanceCost to exp.getDouble("maintenanceCost")),
                "totalCost" to (actual.totalCost to exp.getDouble("totalCost")),
                "netFare" to (actual.netFare to exp.getDouble("netFare")),
                "netProfit" to (actual.netProfit to exp.getDouble("netProfit")),
                "hourlyProfit" to (actual.hourlyProfit to exp.getDouble("hourlyProfit")),
                "requiredFare" to (actual.requiredFare to exp.getDouble("requiredFare")),
                "fareGap" to (actual.fareGap to exp.getDouble("fareGap")),
            )
            for ((field, pair) in checks) {
                // Exact comparison: the fixture numbers are JS shortest round-trip values.
                if (pair.first != pair.second) {
                    mismatches += "$name :: $field expected=${pair.second} actual=${pair.first}"
                }
            }
            if (actual.decision != parseDecision(exp.getString("decision"))) {
                mismatches += "$name :: decision expected=${exp.getString("decision")} actual=${actual.decision}"
            }
            if (actual.decisionReason != exp.getString("decisionReason")) {
                mismatches += "$name :: decisionReason differs"
            }
        }
        assertEquals(
            "golden mismatches (first 10 of ${mismatches.size}):\n" + mismatches.take(10).joinToString("\n"),
            0,
            mismatches.size,
        )
    }

    @Test
    fun referenceTripMatchesDocumentedValues() {
        val settings = CalcSettings(22.25, 10.0, 2.5, 50.0, 75.0)
        val input = CalcInput(
            fare = 165.0,
            fareMode = FareMode.NET,
            commissionRate = 0.0,
            pickupKm = 0.0,
            passengerKm = 22.0,
            returnKm = 0.0,
            totalMinutes = 40.0,
            extraExpenses = 0.0,
        )
        val r = TripCalculator.calculate(input, settings)
        assertEquals(103.95, r.totalCost, 0.0)
        assertEquals(61.05, r.netProfit, 0.0)
        assertEquals(91.58, r.hourlyProfit, 0.0)
        assertEquals(153.95, r.requiredFare, 0.0)
        assertEquals(Decision.ACCEPT, r.decision)
    }

    @Test
    fun jsRoundHalvesGoTowardPositiveInfinity() {
        assertEquals(3.0, TripCalculator.jsRound(2.5), 0.0)
        assertEquals(-2.0, TripCalculator.jsRound(-2.5), 0.0)
        assertEquals(0.0, TripCalculator.jsRound(0.49999999999999994), 0.0)
    }

    @Test
    fun toFixed2MatchesJavaScriptForKnownValues() {
        assertEquals("50.00", TripCalculator.toFixed2(50.0))
        assertEquals("0.13", TripCalculator.toFixed2(0.125))
        // 1.005 is stored as 1.00499999999999989..., so JavaScript gives "1.00".
        assertEquals("1.00", TripCalculator.toFixed2(1.005))
    }
}
