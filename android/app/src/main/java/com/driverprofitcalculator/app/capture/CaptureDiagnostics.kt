package com.driverprofitcalculator.app.capture

import android.content.Context
import org.json.JSONObject

/**
 * Persistent aggregate counters for the capture pipeline. Stores integers only,
 * never notification text, package-level trip details or identifiers.
 */
class CaptureDiagnostics(context: Context) : CaptureCounters {
    private val prefs = context.getSharedPreferences("capture_diagnostics", Context.MODE_PRIVATE)

    @Synchronized override fun increment(name: String) {
        if (name !in CaptureCounterNames.ALL) return
        val current = prefs.getLong(name, 0L)
        prefs.edit().putLong(name, current + 1).apply()
    }

    fun snapshotJson(): JSONObject {
        val json = JSONObject()
        for (name in CaptureCounterNames.ALL) json.put(name, prefs.getLong(name, 0L))
        return json
    }
}
