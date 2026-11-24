package com.driverprofitcalculator.app.capture

import android.content.Context
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.util.Locale

/** Optional, privacy-preserving spoken alert for newly captured offers. Disabled by default. */
class BackgroundOfferAnnouncer(context: Context) : TextToSpeech.OnInitListener {
    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    private val main = Handler(Looper.getMainLooper())
    private var engine: TextToSpeech? = null
    private var ready = false
    private var initFinished = false
    private var pending: Pair<String, String>? = null

    init {
        main.post { engine = TextToSpeech(appContext, this) }
    }

    fun announce(notificationId: String, payload: JSONObject) {
        if (!enabled(appContext) || notificationId.isBlank()) return
        val announcementKey = notificationId + ":" + payload.optString("capturedAt")
        val lastId = prefs.getString(KEY_LAST_ID, null)
        if (lastId == announcementKey) return
        val text = BackgroundOfferSpeech.build(payload) ?: return
        main.post {
            if (!enabled(appContext) || prefs.getString(KEY_LAST_ID, null) == announcementKey) return@post
            if (ready) speak(announcementKey, text) else if (!initFinished) pending = announcementKey to text
        }
    }

    override fun onInit(status: Int) {
        main.post {
            initFinished = true
            if (status != TextToSpeech.SUCCESS) { ready = false; pending = null; return@post }
            val result = engine?.setLanguage(Locale.forLanguageTag("ar-EG")) ?: TextToSpeech.ERROR
            ready = result != TextToSpeech.LANG_MISSING_DATA &&
                result != TextToSpeech.LANG_NOT_SUPPORTED && result != TextToSpeech.ERROR
            if (!ready) { pending = null; return@post }
            engine?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) = Unit
                override fun onDone(utteranceId: String?) = Unit
                @Deprecated("Deprecated in Java")
                override fun onError(utteranceId: String?) = Unit
            })
            pending?.also { pending = null; if (enabled(appContext)) speak(it.first, it.second) }
        }
    }

    private fun speak(id: String, text: String) {
        if (!enabled(appContext)) return
        // Persist the deduplication marker before handing text to the platform TTS engine.
        if (!prefs.edit().putString(KEY_LAST_ID, id).commit()) return
        engine?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "offer-" + id.hashCode())
    }

    fun shutdown() {
        main.post {
            pending = null
            engine?.stop()
            engine?.shutdown()
            engine = null
            ready = false
        }
    }

    companion object {
        private const val PREFERENCES = "background_offer_announcements"
        private const val KEY_ENABLED = "enabled"
        private const val KEY_LAST_ID = "last_announced_id"

        fun enabled(context: Context): Boolean =
            context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).getBoolean(KEY_ENABLED, false)

        fun setEnabled(context: Context, enabled: Boolean): Boolean =
            context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
                .edit().putBoolean(KEY_ENABLED, enabled).commit()
    }
}

/** Speaks only explicit extracted values. It never reads raw notification text or invents missing fields. */
internal object BackgroundOfferSpeech {
    fun build(payload: JSONObject): String? {
        val offer = payload.optJSONObject("offer") ?: return null
        val provider = when (offer.optString("provider")) {
            "uber" -> "أوبر"
            "didi" -> "ديدي"
            "indrive" -> "إن درايف"
            else -> return null
        }
        val parts = mutableListOf("عرض رحلة جديد من $provider")
        appendField(parts, offer, "fare", "الأجرة", "جنيه")
        appendField( parts, offer, "pickupDistanceKm", "مسافة الوصول", "كيلومتر")
        appendField(parts, offer, "distanceKm", "مسافة الرحلة", "كيلومتر")
        appendField(parts, offer, "pickupMinutes", "وقت الوصول", "دقيقة")
        appendField(parts, offer, "durationMinutes", "مدة الرحلة", "دقيقة")
        if (parts.size == 1) return null
        return parts.joinToString("، ")
    }

    private fun appendField(parts: MutableList<String>, offer: JSONObject, key: String, label: String, unit: String) {
        val field = offer.optJSONObject(key) ?: return
        if (!field.has("value") || field.isNull("value")) return
        val value = field.optDouble("value", Double.NaN)
        if (!value.isFinite() || value < 0.0 || value >= 1e9) return
        val rounded = if (value % 1.0 == 0.0) value.toLong().toString() else String.format(Locale.US, "%.1f", value)
        parts += "$label $rounded $unit"
    }
}
