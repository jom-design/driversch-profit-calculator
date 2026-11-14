package com.driverprofitcalculator.app.capture

import com.driverprofitcalculator.app.calc.CalcSettings
import com.driverprofitcalculator.app.calc.FareMode
import com.driverprofitcalculator.app.calc.Decision
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Synthetic notification fixtures: these are parser tests, not proof of live provider formats. */
class TripOfferParserTest {
    private val settings = CalcSettings(
        fuelPrice = 22.25,
        consumptionPer100 = 10.0,
        maintenancePerKm = 2.5,
        minNetProfit = 50.0,
        hourlyTarget = 75.0,
    )

    @Test fun `uber extracts only explicitly labelled offer values`() {
        val offer = TripOfferParser.parse(
            ProviderRegistry.forId("uber")!!,
            "Ride request",
            "Fare: 130 EGP. Pickup distance: 2 km. Trip distance: 18 km. Trip duration: 35 min. Net fare",
        )
        assertEquals(130.0, offer.fare.value!!, 0.001)
        assertEquals(2.0, offer.pickupDistanceKm.value!!, 0.001)
        assertEquals(18.0, offer.distanceKm.value!!, 0.001)
        assertEquals(35.0, offer.durationMinutes.value!!, 0.001)
        assertEquals("EGP", offer.currency)
        assertEquals(FareMode.NET, offer.fareMode)
    }

    @Test fun `inDrive extracts Arabic labels and digits without filling absent values`() {
        val offer = TripOfferParser.parse(
            ProviderRegistry.forId("indrive")!!,
            "عرض رحلة",
            "القبول مقابل ١٦٥ جنيه. مسافة الوصول: ٣ كم. مسافة الرحلة: ٢٢ كم. مدة الرحلة: ٤٠ دقيقة",
        )
        assertEquals(165.0, offer.fare.value!!, 0.001)
        assertEquals(3.0, offer.pickupDistanceKm.value!!, 0.001)
        assertEquals(22.0, offer.distanceKm.value!!, 0.001)
        assertEquals(40.0, offer.durationMinutes.value!!, 0.001)
        assertEquals("EGP", offer.currency)
        assertEquals(FareMode.UNKNOWN, offer.fareMode)
    }

    @Test fun `DiDi parser handles explicitly labelled English units`() {
        val offer = TripOfferParser.parse(
            ProviderRegistry.forId("didi")!!,
            "DiDi trip request",
            "Trip fare: 90 EGP; pickup distance 1.5 km; passenger distance 12 km; estimated trip time 25 min",
        )
        assertEquals(90.0, offer.fare.value!!, 0.001)
        assertEquals(1.5, offer.pickupDistanceKm.value!!, 0.001)
        assertEquals(12.0, offer.distanceKm.value!!, 0.001)
        assertEquals(25.0, offer.durationMinutes.value!!, 0.001)
    }

    @Test fun `unlabelled numbers and pickup ETA are not interpreted as trip fields`() {
        val offer = TripOfferParser.parse(
            ProviderRegistry.forId("uber")!!,
            "Ride request",
            "You are 3 min away. 18 km. 130 EGP",
        )
        assertNull(offer.fare.value)
        assertNull(offer.pickupDistanceKm.value)
        assertNull(offer.distanceKm.value)
        assertNull(offer.durationMinutes.value)
    }

    @Test fun `profit estimate calls TripCalculator but remains review while return and extras are unknown`() {
        val offer = TripOfferParser.parse(
            ProviderRegistry.forId("uber")!!,
            "Ride request",
            "Fare: 130 EGP. Pickup distance: 2 km. Trip distance: 18 km. Trip duration: 35 min",
        )
        val config = TripAnalysisConfig(settings, mapOf("uber" to 0.0, "didi" to 0.0, "indrive" to 0.0), mapOf("uber" to FareMode.NET))
        val analysis = TripOfferAnalyzer.analyze(offer, config)
        assertTrue(analysis != null)
        assertEquals(Decision.REVIEW, analysis!!.decision)
        assertTrue(analysis.calculatedDecision in setOf(Decision.ACCEPT, Decision.REVIEW, Decision.REJECT))
        assertEquals(3, analysis.assumptions.size)
        assertFalse(analysis.reason.isBlank())
    }

    @Test fun `normalizer persists the normalized offer and profitability preview together`() {
        val config = TripAnalysisConfig(settings, mapOf("uber" to 10.0), mapOf("uber" to FareMode.NET))
        val payload = NotificationPayloadNormalizer.normalize(
            "com.ubercab.driver",
            "synthetic-notification-key",
            "Ride request",
            "Fare: 100 EGP. Pickup distance: 1 km. Trip distance: 10 km. Trip duration: 30 min",
            1794500000000L,
            config,
        )
        assertTrue(payload != null)
        val json = payload!!.toJson()
        assertEquals(100.0, json.getJSONObject("offer").getJSONObject("fare").getDouble("value"), 0.001)
        assertEquals("review", json.getJSONObject("analysis").getString("decision"))
        assertTrue(json.getJSONObject("analysis").getJSONArray("assumptions").length() >= 2)
    }

    @Test fun `analysis is withheld when fare mode or currency is unknown`() {
        val offer = TripOfferParser.parse(
            ProviderRegistry.forId("uber")!!,
            "Ride request",
            "Fare: 130. Pickup distance: 2 km. Trip distance: 18 km. Trip duration: 35 min",
        )
        val config = TripAnalysisConfig(settings, mapOf("uber" to 0.0), emptyMap())
        assertNull(TripOfferAnalyzer.analyze(offer, config))
    }
}
