package com.driverprofitcalculator.app.capture

import com.driverprofitcalculator.app.calc.CalcSettings
import com.driverprofitcalculator.app.calc.FareMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** All values in this file are SYNTHETIC test inputs, not observed provider data. */
class TripOfferAnalyzerTest {
    private val settings = CalcSettings(
        fuelPrice = 22.25,
        consumptionPer100 = 10.0,
        maintenancePerKm = 2.5,
        minNetProfit = 50.0,
        hourlyTarget = 75.0,
    )

    private fun field(value: Double?) =
        ExtractedRideField(value, if (value == null) 0.0 else 0.95, null, if (value == null) "missing" else "candidate")

    private fun offer(
        fare: Double? = 200.0,
        pickupKm: Double? = 2.0,
        tripKm: Double? = 18.0,
        tripMinutes: Double? = 25.0,
        pickupMinutes: Double? = 5.0,
        currency: String? = "EGP",
        fareMode: FareMode = FareMode.NET,
        providerId: String = "uber",
    ) = NormalizedRideOffer(
        providerId = providerId,
        fare = field(fare),
        pickupDistanceKm = field(pickupKm),
        distanceKm = field(tripKm),
        durationMinutes = field(tripMinutes),
        currency = currency,
        fareMode = fareMode,
        pickupMinutes = field(pickupMinutes),
    )

    /** Complete configuration: the return distance and extra expenses are set explicitly. */
    private fun config(
        returnKm: Double? = 5.0,
        extraExpenses: Double? = 0.0,
        commission: Double = 10.0,
        fareMode: FareMode = FareMode.NET,
    ) = TripAnalysisConfig(
        settings = settings,
        commissionRates = mapOf("uber" to commission, "didi" to commission, "indrive" to commission),
        fareModes = mapOf("uber" to fareMode),
        returnKm = returnKm,
        extraExpenses = extraExpenses,
    )

    // Reference trip: pickup 2 km + trip 18 km + return 5 km = 25 km.
    // Fuel = 25 × 10 × 22.25 / 100 = 55.63 (money rounding), maintenance = 25 × 2.5 = 62.50,
    // total cost = 118.13. Total time = 5 + 25 = 30 min.

    @Test fun `profitable complete offer is an ACCEPT recommendation with exact money values`() {
        val result = TripOfferAnalyzer.analyze(offer(fare = 200.0), config())
        assertEquals(OfferRecommendation.ACCEPT, result.recommendation)
        assertEquals(118.13, result.totalCost!!, 0.001)
        assertEquals(81.87, result.netProfit!!, 0.001)
        assertEquals(163.74, result.hourlyProfit!!, 0.001)
        assertTrue(result.missingFields.isEmpty())
        assertNull(result.partialCost)
    }

    @Test fun `unprofitable complete offer is a REJECT recommendation`() {
        val result = TripOfferAnalyzer.analyze(offer(fare = 120.0), config())
        assertEquals(OfferRecommendation.REJECT, result.recommendation)
        assertEquals(1.87, result.netProfit!!, 0.001)
    }

    @Test fun `break-even offer is a REVIEW recommendation rather than an automatic decision`() {
        // Net profit exactly at the minimum is not below it, and hourly profit is below the target.
        val breakEvenFare = 118.13 + 50.0
        val result = TripOfferAnalyzer.analyze(offer(fare = breakEvenFare, tripMinutes = 200.0), config())
        assertEquals(OfferRecommendation.REVIEW, result.recommendation)
    }

    @Test fun `profitable offer without pickup time is REVIEW because hourly profit cannot be checked`() {
        val result = TripOfferAnalyzer.analyze(offer(fare = 200.0, pickupMinutes = null), config())
        assertEquals(OfferRecommendation.REVIEW, result.recommendation)
        assertEquals(81.87, result.netProfit!!, 0.001)
        assertNull(result.hourlyProfit)
        assertNull(result.requiredFare)
        assertTrue("pickupTime" in result.missingFields)
    }

    @Test fun `trip duration alone is never treated as total working time`() {
        val result = TripOfferAnalyzer.analyze(offer(fare = 200.0, pickupMinutes = null, tripMinutes = 25.0), config())
        assertNull(result.hourlyProfit)
    }

    @Test fun `missing fare is unavailable, never zero`() {
        val result = TripOfferAnalyzer.analyze(offer(fare = null), config())
        assertEquals(OfferRecommendation.INSUFFICIENT_DATA, result.recommendation)
        assertNull(result.netProfit)
        assertTrue("fare" in result.missingFields)
    }

    @Test fun `missing distance is not fabricated`() {
        val result = TripOfferAnalyzer.analyze(offer(tripKm = null), config())
        assertEquals(OfferRecommendation.INSUFFICIENT_DATA, result.recommendation)
        assertNull(result.netProfit)
        assertNull(result.partialCost)
        assertTrue("tripDistance" in result.missingFields)
    }

    @Test fun `missing return distance blocks net profit but keeps the labelled partial cost`() {
        val result = TripOfferAnalyzer.analyze(offer(), config(returnKm = null))
        assertEquals(OfferRecommendation.INSUFFICIENT_DATA, result.recommendation)
        assertNull(result.netProfit)
        // Pickup 2 km + trip 18 km = 20 km: fuel 44.50 + maintenance 50.00.
        assertEquals(94.5, result.partialCost!!, 0.001)
        assertTrue("returnDistance" in result.missingFields)
    }

    @Test fun `unset extra expenses block net profit instead of being assumed zero`() {
        val result = TripOfferAnalyzer.analyze(offer(), config(extraExpenses = null))
        assertEquals(OfferRecommendation.INSUFFICIENT_DATA, result.recommendation)
        assertTrue("extraExpenses" in result.missingFields)
    }

    @Test fun `missing vehicle settings produce no analysis at all`() {
        val result = TripOfferAnalyzer.analyze(offer(), null)
        assertEquals(OfferRecommendation.INSUFFICIENT_DATA, result.recommendation)
        assertTrue("settings" in result.missingFields)
    }

    @Test fun `gross fare without a real commission is insufficient, because 0 is a placeholder`() {
        val result = TripOfferAnalyzer.analyze(
            offer(fareMode = FareMode.GROSS),
            config(commission = 0.0, fareMode = FareMode.GROSS),
        )
        assertEquals(OfferRecommendation.INSUFFICIENT_DATA, result.recommendation)
        assertTrue("commission" in result.missingFields)
        assertNull(result.netProfit)
    }

    @Test fun `net fare does not need a commission`() {
        val result = TripOfferAnalyzer.analyze(offer(fareMode = FareMode.NET), config(commission = 0.0))
        assertEquals(OfferRecommendation.ACCEPT, result.recommendation)
        assertFalse("commission" in result.missingFields)
    }

    @Test fun `currency mismatch is refused and never converted`() {
        val result = TripOfferAnalyzer.analyze(offer(currency = "USD"), config())
        assertEquals(OfferRecommendation.INSUFFICIENT_DATA, result.recommendation)
        assertNull(result.netProfit)
        assertTrue("currencyMismatch" in result.missingFields)
    }

    @Test fun `invalid numeric values are unavailable, not values`() {
        val nan = TripOfferAnalyzer.analyze(offer(fare = Double.NaN), config())
        assertEquals(OfferRecommendation.INSUFFICIENT_DATA, nan.recommendation)
        assertTrue("fare" in nan.missingFields)
        val negative = TripOfferAnalyzer.analyze(offer(tripKm = -18.0), config())
        assertEquals(OfferRecommendation.INSUFFICIENT_DATA, negative.recommendation)
        val infinite = TripOfferAnalyzer.analyze(offer(), config(returnKm = Double.POSITIVE_INFINITY))
        assertEquals(OfferRecommendation.INSUFFICIENT_DATA, infinite.recommendation)
    }

    @Test fun `money values are rounded to two decimals consistently`() {
        val result = TripOfferAnalyzer.analyze(offer(fare = 200.0), config())
        listOf(result.netProfit!!, result.totalCost!!, result.hourlyProfit!!).forEach { value ->
            assertEquals(value, Math.round(value * 100.0) / 100.0, 0.0000001)
        }
    }

    @Test fun `every analysis reports an unverified provider format until a device check exists`() {
        assertFalse(TripOfferAnalyzer.analyze(offer(providerId = "didi"), config()).payloadVerified)
        assertFalse(TripOfferAnalyzer.analyze(offer(providerId = "uber"), config()).payloadVerified)
    }
}
