package com.driverprofitcalculator.app.capture

import android.content.Context

object ProviderPreferences {
    private const val FILE = "ride_provider_preferences"
    fun enabled(context: Context, id: String): Boolean =
        ProviderRegistry.forId(id) != null && context.getSharedPreferences(FILE, 0).getBoolean(id, false)
    fun setEnabled(context: Context, id: String, value: Boolean): Boolean {
        if (ProviderRegistry.forId(id) == null) return false
        return context.getSharedPreferences(FILE, 0).edit().putBoolean(id, value).commit()
    }
    fun enabledIds(context: Context) = ProviderRegistry.providers.filter { enabled(context, it.id) }.map { it.id }
}
