package com.driverprofitcalculator.app.capture

import android.content.Context
import com.driverprofitcalculator.app.calc.CalcSettings
import com.driverprofitcalculator.app.calc.FareMode
import org.json.JSONObject

/** Stores only explicit settings synchronized from the calculator UI. */
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
        val mode = input.optString("fa¶»§q«^