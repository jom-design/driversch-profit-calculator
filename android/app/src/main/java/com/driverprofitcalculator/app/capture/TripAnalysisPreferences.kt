package com.driverprofitcalculator.app.capture

import android.content.Context
import com.driverprofitcalculator.app.calc.CalcSettings
import com.driverprofitcalculator.app.calc.FareMode
import org.json.JSONObject

/** Stores only explicit settings synchronized from the calculator UI. Missing values stay null. */
class TripAnalysisPreferences(context: Context) {
    private val prefs = context.getSharedPreferences("trip_analysis_preferences", Context.MODE_PRIVATE)

    fun saveFromJson(value: String): Boolean = try {
        val input = JSONObject(value)
        val settings = JSONObject()
        listOf("fuelPrice", "consumptionPer100", "maintenancePerKm", "minNetProfit", "hourlyTarget").forEach { key ->
            val number = input.getDouble(key)
            require(number.isFinite() && number >= 0.0)
            settings.put(key, number)
        }
        val commissionInput = input.getJSONObject("commission")
        val commissionRates = JSONObject()
        mapOf("uber" to "Uber", "didi" to "DiDi", "indrive" to "inDrive").forEach { (id, key) ->
            val rate = commissionInput.getDouble(key)
            require(rate.isFinite() && rate in 0.0..100.0)
            commissionRates.put(id, rate)
        }
        val existing = try { JSONObject(prefs.getString("config", "{}") ?: "{}") } catch (_: Exception) { JSONObject() }
        val fareModes = existing.optJSONObject("fareModes") ?: JSONObject()
        val provider = input.optString("activeProvider")
        val mode = input.optString("fareMode")
        if (provider in setOf("uber", "didi", "indrive") && mode in setOf("net", "gross", "unknown")) {
            fareModes.put(provider, mode)
        }
        val config = JSONObject()
            .put("settings", settings)
            .put("commissionRates", commissionRates)
            .put("fareModes", fareModes)
            // The web settings send these as numbers, or null when the driver has not set them.
            .put("returnKm", input.optionalNonNegative("defaultReturnKm") ?: JSONObject.NULL)
            .put("extraExpenses", input.optionalNonNegative("defaultExtraExpenses") ?: JSONObject.NULL)
        prefs.edit().putString("config", config.toString()).commit()
    } catch (_: Exception) { false }

    fun load(): TripAnalysisConfig? {
        return try {
            val root = JSONObject(prefs.getString("config", null) ?: return null)
            val settings = root.getJSONObject("settings")
            val rates = root.getJSONObject("commissionRates")
            val modes = root.optJSONObject("fareModes") ?: JSONObject()
            val calcSettings = CalcSettings(
                fuelPrice = settings.getDouble("fuelPrice"),
                consumptionPer100 = settings.getDouble("consumptionPer100"),
                maintenancePerKm = settings.getDouble("maintenancePerKm"),
                minNetProfit = settings.getDouble("minNetProfit"),
                hourlyTarget = settings.getDouble("hourlyTarget"),
            )
            if (listOf(calcSettings.fuelPrice, calcSettings.consumptionPer100, calcSettings.maintenancePerKm, calcSettings.minNetProfit, calcSettings.hourlyTarget).any { !it.isFinite() || it < 0.0 }) return null
            val commissionRates = mapOf("uber" to rates.getDouble("uber"), "didi" to rates.getDouble("didi"), "indrive" to rates.getDouble("indrive"))
            if (commissionRates.values.any { !it.isFinite() || it !in 0.0..100.0 }) return null
            val fareModes = mutableMapOf<String, FareMode>()
            listOf("uber", "didi", "indrive").forEach { id ->
                fareModes[id] = when (modes.optString(id)) {
                    "net" -> FareMode.NET
                    "gross" -> FareMode.GROSS
                    else -> FareMode.UNKNOWN
                }
            }
            TripAnalysisConfig(
                settings = calcSettings,
                commissionRates = commissionRates,
                fareModes = fareModes,
                returnKm = root.optionalNonNegative("returnKm"),
                extraExpenses = root.optionalNonNegative("extraExpenses"),
            )
        } catch (_: Exception) { null }
    }

    /** A finite, non-negative number when the key is present, otherwise null. Invalid values throw. */
    private fun JSONObject.optionalNonNegative(key: String): Double? {
        if (!has(key) || isNull(key)) return null
        val number = getDouble(key)
        require(number.isFinite() && number >= 0.0)
        return number
    }
}
