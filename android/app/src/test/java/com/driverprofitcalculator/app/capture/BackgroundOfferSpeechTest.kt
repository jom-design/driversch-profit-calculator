package com.driverprofitcalculator.app.capture

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.json.JSONObject

class BackgroundOfferSpeechTest {
    private fun field(value: Any) = JSONObject().put("value", value)

    @Test
    fun speaksOnlyExplicitAvailableFieldsInArabic() {
        val payload = JSONObject().put("offer", JSONObject()
            .put("provider", "uber")
            .put("fare", field(165))
            .put("pickupDistanceKm", field(2.5))
            .put("distanceKm", field(22))
            .put("pickupMinutes", field(JSONObject.NULL))
            .put("durationMinutes", field(40)))
        assertEquals(
            "عرض رحلة جديد من أوبر، الأجرة 165 جنيه، مسافة الوصول 2.5 كيلومتر، مسافة الرحلة 22 كيلومتر، مدة الرحلة 40 دقيقة",
            BackgroundOfferSpeech.build(payload)
        )
    }

    @Test
    fun refusesUnknownProvider() {
        val payload = JSONObject().put("offer", JSONObject().put("provider", "unknown").put("fare", field(100)))
        assertNull(BackgroundOfferSpeech.build(payload))
    }

    @Test
    fun refusesPayloadWithoutAnyExplicitNumericOfferField() {
        val payload = JSONObject().put("offer", JSONObject()
            .put("provider", "didi")
            .put("fare", field(JSONObject.NULL))
            .put("distanceKm", field("not-a-number")))
        assertNull(BackgroundOfferSpeech.build(payload))
    }

    @Test
    fun ignoresNegativeAndNonFiniteValues() {
        val payload = JSONObject().put("offer", JSONObject()
            .put("provider", "indrive")
            .put("fare", field(-1))
            .put("distanceKm", field("NaN")))
        assertNull(BackgroundOfferSpeech.build(payload))
    }
}
