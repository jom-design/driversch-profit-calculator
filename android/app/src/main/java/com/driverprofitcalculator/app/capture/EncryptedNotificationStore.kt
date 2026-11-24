package com.driverprofitcalculator.app.capture

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Encrypted, short-lived handoff store for captured offers. A tray removal never deletes an unreviewed offer.
 *
 * State (encrypted at rest with an Android Keystore AES-GCM key):
 *  - pending: offers waiting for the analysis/announcement stage (bounded, expire after 6 h)
 *  - seen: notification id -> content fingerprint of the last processed content (bounded).
 *    Deduplication is by fingerprint, so an identical re-delivery is ignored while a changed
 *    update of the same notification is processed again.
 *
 * Every method holds LOCK. The service and the WebView bridge create separate instances, so a
 * per-instance lock would not serialize their read-modify-write cycles on the same blob.
 */
class EncryptedNotificationStore(context: Context) : CaptureStore, JournalBackend {
    private val prefs = context.getSharedPreferences("notification_queue", Context.MODE_PRIVATE)
    private val counters: CaptureCounters = CaptureDiagnostics(context)

    override fun seenFingerprint(notificationId: String): String? = synchronized(LOCK) {
        val state = load()
        findSeen(state.optJSONArray("seen"), notificationId)?.optString("fp")
    }

    override fun save(payload: NormalizedNotificationPayload, fingerprint: String, isUpdate: Boolean): Boolean = synchronized(LOCK) {
        val state = load()
        val id = payload.notificationId
        val pending = JSONArray()
        val old = state.optJSONArray("pending") ?: JSONArray()
        for (i in 0 until old.length()) {
            val item = old.optJSONObject(i) ?: continue
            if (item.optString("notificationId") != id && !expired(item)) pending.put(item)
        }
        pending.put(payload.toJson())
        state.put("pending", bounded(pending, MAX_PENDING))
        state.put("seen", upsertSeen(state.optJSONArray("seen"), id, fingerprint, removed = false))
        state.put("lastReceivedAt", payload.postedAt)
        write(state)
    }

    override fun markRemoved(notificationId: String, reason: Int?): Boolean = synchronized(LOCK) {
        val state = load()
        val fingerprint = findSeen(state.optJSONArray("seen"), notificationId)?.optString("fp") ?: return@synchronized true
        val old = state.optJSONArray("pending") ?: JSONArray()
        // A notification disappearing from the shade does not mean the driver has reviewed the offer.
        // Android reports removal when the user taps an auto-cancel notification too. Keep every live
        // captured offer until the app imports and acknowledges it, or the six-hour TTL expires.
        state.put("pending", PendingNotificationRemoval.preserveCapturedOffer(old, notificationId, ::expired))
        state.put("seen", upsertSeen(state.optJSONArray("seen"), notificationId, fingerprint, removed = true))
        write(state)
    }

    fun pendingJson(): String = synchronized(LOCK) {
        val state = load()
        val source = state.optJSONArray("pending") ?: JSONArray()
        val result = JSONArray()
        for (i in 0 until source.length()) {
            val item = source.optJSONObject(i) ?: continue
            if (!expired(item)) result.put(item)
        }
        result.toString()
    }

    /** Removes an offer from the pending queue. Its fingerprint stays, so the same content is not re-queued. */
    fun acknowledge(id: String): Boolean = synchronized(LOCK) {
        if (id.isBlank()) return@synchronized false
        // Never replace an unreadable encrypted queue with an empty one through this bridge call.
        if (!CaptureQueueCodec.isReadable(prefs.getString("queue", null)) { decrypt(it) }) {
            return@synchronized false
        }
        val state = load()
        val old = state.optJSONArray("pending") ?: JSONArray()
        val result = PendingNotificationAcknowledger.remove(old, id, ::expired)
        // A successful write is not proof that this ID was present. Report success only for a real removal.
        if (!result.found) return@synchronized false
        state.put("pending", result.pending)
        write(state)
    }

    fun lastReceivedAt(): String = synchronized(LOCK) { load().optString("lastReceivedAt", "") }

    /** Raw events waiting for processing. Stored in the same encrypted blob, under the same lock. */
    override fun readJournal(): JSONArray? = synchronized(LOCK) {
        try { load().optJSONArray("journal") ?: JSONArray() } catch (_: Exception) { null }
    }

    override fun readHighWaterMark(): Long = synchronized(LOCK) {
        try { load().optLong("journalSeq", 0L) } catch (_: Exception) { 0L }
    }

    override fun writeJournal(items: JSONArray, highWaterMark: Long): Boolean = synchronized(LOCK) {
        try {
            val state = load()
            state.put("journal", items)
            // The mark only moves forward, even if a caller passes an older value.
            state.put("journalSeq", maxOf(highWaterMark, state.optLong("journalSeq", 0L)))
            write(state)
        } catch (_: Exception) { false }
    }

    /** False only when a stored blob exists but cannot be decrypted or parsed. */
    fun isHealthy(): Boolean = synchronized(LOCK) {
        CaptureQueueCodec.isReadable(prefs.getString("queue", null)) { decrypt(it) }
    }

    private fun load(): JSONObject {
        val opened = CaptureQueueCodec.open(prefs.getString("queue", null)) { decrypt(it) }
        if (opened.wasCorrupt) counters.increment(CaptureCounterNames.QUEUE_RESET)
        return opened.state
    }

    private fun expired(item: JSONObject): Boolean {
        val time = try { java.time.Instant.parse(item.optString("postedAt")).toEpochMilli() } catch (_: Exception) { 0L }
        return time <= 0L || System.currentTimeMillis() - time > PENDING_TTL_MS
    }

    private fun findSeen(seen: JSONArray?, id: String): JSONObject? {
        if (seen == null) return null
        for (i in 0 until seen.length()) {
            val item = seen.optJSONObject(i) ?: continue
            if (item.optString("id") == id) return item
        }
        return null
    }

    private fun upsertSeen(seen: JSONArray?, id: String, fingerprint: String, removed: Boolean): JSONArray {
        val next = JSONArray()
        if (seen != null) for (i in 0 until seen.length()) {
            val item = seen.optJSONObject(i) ?: continue
            if (item.optString("id") != id) next.put(item)
        }
        next.put(JSONObject().put("id", id).put("fp", fingerprint).put("removed", removed))
        return bounded(next, MAX_SEEN)
    }

    private fun bounded(source: JSONArray, max: Int): JSONArray {
        val result = JSONArray()
        val start = (source.length() - max).coerceAtLeast(0)
        for (i in start until source.length()) result.put(source.get(i))
        return result
    }

    private fun write(state: JSONObject): Boolean = try {
        prefs.edit().putString("queue", encrypt(state.toString())).commit()
    } catch (_: Exception) { false }

    private fun secretKey(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(KeyGenParameterSpec.Builder(KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true).build())
        return gen.generateKey()
    }

    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        return Base64.encodeToString(cipher.iv + cipher.doFinal(value.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
    }

    private fun decrypt(value: String): String {
        val bytes = Base64.decode(value, Base64.NO_WRAP)
        require(bytes.size > 12)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
        return String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8)
    }

    companion object {
        private val LOCK = Any()
        private const val KEY_ALIAS = "driver_profit_notification_queue_v1"
        private const val MAX_PENDING = 50
        private const val MAX_SEEN = 500
        private const val PENDING_TTL_MS = 6 * 60 * 60 * 1000L
    }
}


/** Pure queue mutation used by the encrypted store and JVM regression tests. */
internal object PendingNotificationAcknowledger {
    data class Result(val found: Boolean, val pending: JSONArray)

    fun remove(source: JSONArray, id: String, isExpired: (JSONObject) -> Boolean): Result {
        if (id.isBlank()) return Result(false, source)
        var found = false
        val next = JSONArray()
        for (i in 0 until source.length()) {
            val item = source.optJSONObject(i) ?: continue
            if (item.optString("notificationId") == id) {
                found = true
            } else if (!isExpired(item)) {
                next.put(item)
            }
        }
        return Result(found, next)
    }
}


/**
 * A tray removal is not a user acknowledgement. Keep the captured item available for manual review;
 * only expired entries may be pruned while recording the removal event.
 */
internal object PendingNotificationRemoval {
    fun preserveCapturedOffer(
        source: JSONArray,
        notificationId: String,
        isExpired: (JSONObject) -> Boolean,
    ): JSONArray {
        val next = JSONArray()
        for (i in 0 until source.length()) {
            val item = source.optJSONObject(i) ?: continue
            if (!isExpired(item)) next.put(item)
        }
        return next
    }
}
