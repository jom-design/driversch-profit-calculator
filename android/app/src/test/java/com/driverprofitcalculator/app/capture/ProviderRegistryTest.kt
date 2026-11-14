package com.driverprofitcalculator.app.capture

import org.junit.Assert.*
import org.junit.Test

class ProviderRegistryTest {
    @Test fun onlyExplicitDriverPackagesAreAllowed() {
        assertEquals("uber", ProviderRegistry.forPackage("com.ubercab.driver")?.id)
        assertEquals("didi", ProviderRegistry.forPackage("com.didiglobal.driver")?.id)
        assertEquals("indrive", ProviderRegistry.forPackage("sinet.startup.inDriver")?.id)
        assertNull(ProviderRegistry.forPackage("com.example.fake"))
        assertNull(ProviderRegistry.forPackage("com.didiglobal.passenger"))
    }
    @Test fun irrelevantNotificationsAreRejected() {
        val provider = ProviderRegistry.forPackage("com.ubercab.driver")!!
        assertTrue(ProviderRegistry.relevant(provider, "New trip request", "Pickup 2 km"))
        assertFalse(ProviderRegistry.relevant(provider, "Weekly summary", "Account settings updated"))
        assertFalse(ProviderRegistry.relevant(provider, "Message from passenger", "Can you wait 2 minutes?"))
    }
    @Test fun payloadNormalizationRequiresKnownPackageAndRideText() {
        val payload = NotificationPayloadNormalizer.normalize(
            "com.didiglobal.driver", "key-1", "طلب رحلة", "أجرة 120 جنيه", 1794500000000L
        )
        assertNotNull(payload)
        assertEquals("DiDi", payload?.appLabel)
        assertEquals(120.0, payload?.offer?.fare?.value ?: -1.0, 0.001)
        assertEquals("EGP", payload?.offer?.currency)
        assertNu���q�^