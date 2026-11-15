package com.driverprofitcalculator.app.capture

import com.driverprofitcalculator.app.calc.CalcSettings
import com.driverprofitcalculator.app.calc.FareMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** SYNTHETIC notification fixtures: these are parser tests, not proof of live provider formats. */
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

    @Test fun `pickup time is read only from its own explicit label and never used as trip duration`() {
        val offer = TripOfferParser.parse(
            ProviderRegistry.forId("uber")!!,
            "Ride request",
            "Fare: 130 EGP. Pickup time: 6 min. Trip duration: 25 min",
        )
        assertEquals(6.0, offer.pickupMinutes.value!!, 0.001)
        assertEquals(25.0, offer.durationMinutes.value!!, 0.001)
    }

    @Test fun `Arabic decimal separator and Arabic digits parse as one number`() {
        val offer = TripOfferParser.parse(
            ProviderRegistry.forId("indrive")!!,
            "عرض رحلة",
            "القبول مقابل ١٣٠٫٥ جنيه. مسافة الرحلة: ١٨٫٢ كم",
        )
        assertEquals(130.5, offer.fare.value!!, 0.001)
        assertEquals(18.2, offer.distanceKm.value!!, 0.001)
    }

    @Test fun `thousands separators and decimal commas are parsed by position`() {
        val thousands = TripOfferParser.parse(
            ProviderRegistry.forId("uber")!!, "Ride request", "Fare: 1,250.5 EGP",
        )
        assertEquals(1250.5, thousands.fare.value!!, 0.001)
        val decimalComma = TripOfferParser.parse(
            ProviderRegistry.forId("uber")!!, "Ride request", "Fare: 130,5 EGP",
        )
        assertEquals(130.5, decimalComma.fare.value!!, 0.001)
    }

    @Test fun `malformed amounts produce a missing field, never zero`() {
        val offer = TripOfferParser.parse(
            ProviderRegistry.forId("uber")!!, "Ride request", "Fare: abc EGP. Trip distance: km",
        )
        assertNull(offer.fare.value)
        assertNull(offer.distanceKm.value)
        assertFalse(offer.fare.status == "candidate")
    }

    @Test fun `unknown currency is reported as null, not guessed`() {
        val offer = TripOfferParser.parse(
            ProviderRegistry.forId("uber")!!, "Ride request", "Fare: 130. Trip distance: 18 km",
        )
        assertNull(offer.currency)
        assertTrue(offer.fare.value != null)
    }

    @Test fun `profit estimate stays insufficient while return and extras are unknown, and shows only the partial cost`() {
        val offer = TripOfferParser.parse(
            ProviderRegistry.forId("uber")!!,
            "Ride request",
            "Fare: 130 EGP. Pickup distance: 2 km. Trip distance: 18 km. Trip duration: 35 min",
        )
        val config = TripAnalysisConfig(settings, mapOf("uber" to 0.0, "didi" to 0.0, "indrive" to 0.0), mapOf("uber" to FareMode.NET), returnKm = null, extraExpenses = null)
        val analysis = TripOfferAnalyzer.analyze(offer, config)
        assertEquals(OfferRecommendation.INSUFFICIENT_DATA, analysis.recommendation)
        assertNull(analysis.netProfit)
        assertNull(analysis.hourlyProfit)
        // Fuel 20 km × 10 L/100 km × 22.25 + maintenance 20 km × 2.5 = 94.5, excluding the return leg.
        assertEquals(94.5, analysis.partialCost!!, 0.001)
        assertTrue("returnDistance" in analysis.missingFields)
        assertTrue("extraExpenses" in analysis.missingFields)
        assertTrue("pickupTime" in analysis.missingFields)
        assertFalse(analysis.reason.isBlank())
    }

    @Test fun `normalizer persists the normalized offer and analysis but never the raw text`() {
        val config = TripAnalysisConfig(settings, mapOf("uber" to 10.0), mapOf("uber" to FareMode.NET), returnKm = null, extraExpenses = null)
        val payload = NotificationPayloadNormalizer.normalize(
            "com.ubercab.driver",
            "synthetic-notification-key",
            "Ride request",
            "Fare: 100 EGP. Pickup distance: 1 km. Trip distance: 10 km. Trip duration: 30 min", // SYNTHETIC
            1794500000000L,
            1794500001000L,
            config,
        )
        assertTrue(payload != null)
        val json = payload!!.toJson()
        assertEquals(100.0, json.getJSONObject("offer").getJSONObject("fare").getDouble("value"), 0.001)
        assertEquals("insufficient_data", json.getJSONObject("analysis").getString("recommendation"))
        assertTrue(json.getJSONObject("analysis").getJSONArray("missingFields").length() >= 2)
        assertFalse(json.has("text"))
        assertFalse(json.has("title"))
    }

    @Test fun `analysis reports insufficient data when fare mode and currency are unknown`() {
        val offer = TripOfferParser.parse(
            ProviderRegistry.forId("uber")!!,
            "Ride request",
            "Fare: 130. Pickup distance: 2 km. Trip distance: 18 km. Trip duration: 35 min",
        )
        val config = TripAnalysisConfig(settings, mapOf("uber" to 0.0), emptyMap(), returnKm = 5.0, extraExpenses = 0.0)
        val analysis = TripOfferAnalyzer.analyze(offer, config)
        assertEquals(OfferRecommendation.INSUFFICIENT_DATA, analysis.recommendation)
        assertTrue("fareMode" in analysis.missingFields)
        assertTrue("currency" in analysis.missingFields)
        assertNull(analysis.netProfit)
    }
}
