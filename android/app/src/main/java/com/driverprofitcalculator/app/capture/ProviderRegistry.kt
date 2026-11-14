package com.driverprofitcalculator.app.capture

data class RideProvider(val id: String, val label: String, val packageName: String, val keywords: List<String>)

/**
 * Driver-app package candidates. None is confirmed on a device yet: they match only the driver apps'
 * own package names and must be verified against installed apps before real-provider support is claimed.
 * DiDi's "com.didiglobal.driver" is unresolved; the published DiDi Driver listing does not expose it.
 */
object ProviderRegistry {
    val providers = listOf(
        RideProvider("uber", "Uber", "com.ubercab.driver",
            listOf("trip", "ride", "request", "pickup", "fare", "earning", "رحلة", "مشوار", "طلب", "أجرة", "جنيه", "egp")),
        RideProvider("didi", "DiDi", "com.didiglobal.driver",
            listOf("trip", "ride", "request", "pickup", "fare", "order", "رحلة", "مشوار", "طلب", "أجرة", "جنيه", "egp")),
        RideProvider("indrive", "inDrive", "sinet.startup.inDriver",
            listOf("offer", "ride", "request", "driver", "price", "fare", "عرض", "رحلة", "مشوار", "طلب", "سائق", "جنيه", "egp"))
    )
    fun forPackage(packageName: String) = providers.firstOrNull { it.packageName == packageName }
    fun forId(id: String) = providers.firstOrNull { it.id == id }
    fun relevant(provider: RideProvider, title: String, text: String): Boolean {
        val content = (title + " " + text).lowercase()
        // Android MessagingStyl���q�^