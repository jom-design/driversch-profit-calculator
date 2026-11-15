package com.driverprofitcalculator.app.capture

/**
 * @param packageEvidence where the package id came from: "listing" (public store listing evidence)
 *   or "unresolved" (no reliable evidence found). Neither is device-verified.
 * @param payloadVerified true only after a real notification from this app was captured and checked.
 *   No provider is verified yet, so every analysis reports its provider as unverified.
 */
data class RideProvider(
    val id: String,
    val label: String,
    val packageName: String,
    val keywords: List<String>,
    val packageEvidence: String,
    val payloadVerified: Boolean = false,
)

/**
 * Driver-app package candidates. None is confirmed on a device yet.
 * DiDi's "com.didiglobal.driver" is unresolved: the published DiDi Driver listing does not expose it,
 * so DiDi capture is marked unverified and should stay disabled until a device check confirms it.
 */
object ProviderRegistry {
    val providers = listOf(
        RideProvider("uber", "Uber", "com.ubercab.driver",
            listOf("trip", "ride", "request", "pickup", "fare", "earning", "رحلة", "مشوار", "طلب", "أجرة", "جنيه", "egp"),
            packageEvidence = "listing"),
        RideProvider("didi", "DiDi", "com.didiglobal.driver",
            listOf("trip", "ride", "request", "pickup", "fare", "order", "رحلة", "مشوار", "طلب", "أجرة", "جنيه", "egp"),
            packageEvidence = "unresolved"),
        RideProvider("indrive", "inDrive", "sinet.startup.inDriver",
            listOf("offer", "ride", "request", "driver", "price", "fare", "عرض", "رحلة", "مشوار", "طلب", "سائق", "جنيه", "egp"),
            packageEvidence = "listing")
    )
    fun forPackage(packageName: String) = providers.firstOrNull { it.packageName == packageName }
    fun forId(id: String) = providers.firstOrNull { it.id == id }
    fun relevant(provider: RideProvider, title: String, text: String): Boolean {
        val content = (title + " " + text).lowercase()
        // Android MessagingStyle is filtered separately; obvious chat copy is never a ride offer.
        if (listOf("message", "chat", "رسالة", "محادثة", "دردشة").any { content.contains(it) }) return false
        return provider.keywords.any { content.contains(it.lowercase()) }
    }
}
