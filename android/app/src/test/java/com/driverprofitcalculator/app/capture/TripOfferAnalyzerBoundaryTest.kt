package com.driverprofitcalculator.app.capture

import com.driverprofitcalculator.app.calc.CalcSettings
import com.driverprofitcalculator.app.calc.FareMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Boundary cases for the analyzer: unset versus explicit zero, negative, non-finite, decimal and
 * extreme values, and every recommendation state. ALL values here are SYNTHETIC test inputs.
 */
class TripOfferAnalyzerBoundaryTest {
    private val settings = CalcSettings(22.25, 10.0, 2.5, 50.0, 75.0)

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
    ) = NormalizedRideOffer(
        providerId = "uber",
        fare = field(fare),
        pickupDistanceKm = field(pickupKm),
        distanceKm = field(tripKm),
        durationMinutes = field(tripMinutes),
        currency = currency,
        fareMode = fareMode,
        pickupMinutes = field(pickupMinutes),
    )

    private fun config(
        returnKm: Double? = 5.0,
        extraExpenses: Double? = 0.0,
        commission: Double = 10.0,
    ) = TripAnalysisConfig(
        settings = settings,
        commissionRates = mapOf("uber" to commission, "didi" to commission, "indrive" to commission),
        fareModes = mapOf("uber" to FareMode.NET),
        returnKm = returnKm,
        extraExpenses = extraExpenses,
    )

    // ---- unset versus explicit zero ----

    @Test
    fun `an explicit zero return distance is a real answer, not a missing input`() {
        val result = TripOfferAnalyzer.analyze(offer(), config(returnKm = 0.0))

        assertFalse("returnDistance" in result.missingFields)
        assertNotEquals(OfferRecommendation.INSUFFICIENT_DATA, result.recommendation)
        assertTrue(result.netProfit != null)
    }

    @Test
    fun `an unset return distance blocks the net profit and names the field`() {
        val result = TripOfferAnalyzer.analyze(offer(), config(returnKm = null))

        assertEquals(OfferRecommendation.INSUFFICIENT_DATA, result.recommendation)
        assertNull(result.netProfit)
        assertNull(result.hourlyProfit)
        assertTrue("returnDistance" in result.missingFields)
    }

    @Test
    fun `an explicit zero extra expense is kept, and unset extra expenses blocks the result`() {
        val zero = TripOfferAnalyzer.analyze(offer(), config(extraExpenses = 0.0))
        val unset = TripOfferAnalyzer.analyze(offer(), config(extraExpenses = null))

        assertFalse("extraExpenses" in zero.missingFields)
        assertTrue("extraExpenses" in unset.missingFields)
        assertNull(unset.netProfit)
    }

    @Test
    fun `a zero return distance changes the cost, so zero and a real value are not the same input`() {
        val zero = TripOfferAnalyzer.analyze(offer(), config(returnKm = 0.0))
        val five = TripOfferAnalyzer.analyze(offer(), config(returnKm = 5.0))

        assertTrue(zero.totalCost!! < five.totalCost!!)
    }

    // ---- negative, non-finite and extreme values ----

    @Test
    fun `a negative return distance is treated as unset`() {
        val result = TripOfferAnalyzer.analyze(offer(), config(returnKm = -1.0))

        assertTrue("returnDistance" in result.missingFields)
        assertEquals(OfferRecommendation.INSUFFICIENT_DATA, result.recommendation)
    }

    @Test
    fun `a negative extra expense is treated as unset`() {
        val result = TripOfferAnalyzer.analyze(offer(), config(extraExpenses = -10.0))

        assertTrue("extraExpenses" in result.missingFields)
    }

    @Test
    fun `non-finite return and extra values are treated as unset`() {
        val nanReturn = TripOfferAnalyzer.analyze(offer(), config(returnKm = Double.NaN))
        val infiniteExtra = TripOfferAnalyzer.analyze(offer(), config(extraExpenses = Double.POSITIVE_INFINITY))

        assertTrue("returnDistance" in nanReturn.missingFields)
        assertTrue("extraExpenses" in infiniteExtra.missingFields)
    }

    @Test
    fun `a return distance above the plausibility limit is treated as unset`() {
        val result = TripOfferAnalyzer.analyze(offer(), config(returnKm = 2_000.1))

        assertTrue("returnDistance" in result.missingFields)
    }

    @Test
    fun `a fare above the plausibility limit is treated as unavailable`() {
        val result = TripOfferAnalyzer.analyze(offer(fare = 1_000_001.0), config())

        assertTrue("fare" in result.missingFields)
        assertEquals(OfferRecommendation.INSUFFICIENT_DATA, result.recommendation)
    }

    @Test
    fun `a non-finite fare is treated as unavailable`() {
        val result = TripOfferAnalyzer.analyze(offer(fare = Double.NaN), config())

        assertTrue("fare" in result.missingFields)
    }

    @Test
    fun `a trip distance of zero is not a real trip`() {
        val result = TripOfferAnalyzer.analyze(offer(tripKm = 0.0), config())

        assertTrue("tripDistance" in result.missingFields)
        assertEquals(OfferRecommendation.INSUFFICIENT_DATA, result.recommendation)
    }

    @Test
    fun `a trip duration of zero is not a real trip duration`() {
        val result = TripOfferAnalyzer.analyze(offer(tripMinutes = 0.0), config())

        assertTrue("duration" in result.missingFields)
        assertNull(result.hourlyProfit)
    }

    @Test
    fun `a pickup time of zero is a real answer and the hourly figure uses the trip time alone`() {
        val result = TripOfferAnalyzer.analyze(offer(pickupMinutes = 0.0, tripMinutes = 30.0), config())

        assertFalse("pickupTime" in result.missingFields)
        assertEquals(163.74, result.hourlyProfit!!, 0.01)
    }

    @Test
    fun `working time is pickup plus trip, not the trip duration alone`() {
        // 5 + 25 = 30 minutes at net 81.87 gives 163.74 per hour. The trip alone (25 min) would give 196.49.
        val result = TripOfferAnalyzer.analyze(offer(), config())

        assertEquals(163.74, result.hourlyProfit!!, 0.01)
    }

    @Test
    fun `a pickup time above the plausibility limit is treated as unset`() {
        val result = TripOfferAnalyzer.analyze(offer(pickupMinutes = 1_441.0), config())

        assertTrue("pickupTime" in result.missingFields)
    }

    @Test
    fun `decimal fare and distance values are used as given`() {
        val result = TripOfferAnalyzer.analyze(offer(fare = 200.5, pickupKm = 2.25, tripKm = 18.75), config())

        assertTrue(result.missingFields.isEmpty())
        assertTrue(result.netProfit != null)
    }

    // ---- every recommendation state ----

    @Test
    fun `ACCEPT when net profit and hourly target are both met`() {
        val result = TripOfferAnalyzer.analyze(offer(), config())

        assertEquals(OfferRecommendation.ACCEPT, result.recommendation)
    }

    @Test
    fun `REJECT when the estimated net profit is below the minimum`() {
        val result = TripOfferAnalyzer.analyze(offer(fare = 80.0), config())

        assertEquals(OfferRecommendation.REJECT, result.recommendation)
    }

    @Test
    fun `REVIEW when net profit is met but the hourly figure is below target`() {
        val result = TripOfferAnalyzer.analyze(offer(tripMinutes = 120.0, pickupMinutes = 60.0), config())

        assertEquals(OfferRecommendation.REVIEW, result.recommendation)
        assertTrue(result.hourlyProfit!! < settings.hourlyTarget)
    }

    @Test
    fun `INSUFFICIENT_DATA never carries a net profit or an accept recommendation`() {
        val result = TripOfferAnalyzer.analyze(offer(currency = null), config())

        assertEquals(OfferRecommendation.INSUFFICIENT_DATA, result.recommendation)
        assertNull(result.netProfit)
        assertNull(result.hourlyProfit)
        assertNull(result.requiredFare)
    }

    @Test
    fun `a gross fare without a usable commission is insufficient`() {
        val result = TripOfferAnalyzer.analyze(offer(fareMode = FareMode.GROSS), config(commission = 0.0))

        assertTrue("commission" in result.missingFields)
        assertEquals(OfferRecommendation.INSUFFICIENT_DATA, result.recommendation)
    }

    @Test
    fun `a missing settings object gives insufficient data with the settings code`() {
        val result = TripOfferAnalyzer.analyze(offer(), null)

        assertEquals(OfferRecommendation.INSUFFICIENT_DATA, result.recommendation)
        assertEquals(listOf("settings"), result.missingFields)
    }

    @Test
    fun `the partial cost is kept without the return leg when a net profit cannot be computed`() {
        val result = TripOfferAnalyzer.analyze(offer(), config(returnKm = null))

        // Pickup 2 km + trip 18 km = 20 km: fuel 44.50 + maintenance 50.00 = 94.50.
        assertEquals(94.5, result.partialCost!!, 0.01)
    }
}
