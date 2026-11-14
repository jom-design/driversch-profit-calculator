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
           ¶»§q«^