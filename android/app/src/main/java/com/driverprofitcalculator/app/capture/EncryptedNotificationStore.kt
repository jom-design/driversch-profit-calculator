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
 * Encrypted, short-lived handoff store for captured offers.
 *
 * State (encrypted at rest with an Android Keystore AES-GCM key):
 *  - pending: offers waiting for the analysis/announcement stage (bounded, expire after 6 h)
 *  - seen: notification id -> content fingerprint of the last processed content (bounded).
 *    Deduplication is by fingerprint, so an identical re-delivery is ignored while a changed
 *    update of the same notification is processed again.
 */
class EncryptedNotificationStore(context: Context) : CaptureStore {
    private val prefs = context.getSharedPreferences("notification_queue", Context.MODE_PRIVATE)

    @Synchronized override fun seenFingerprint(notificationId: String): String? {
        val state = read() ?: return null
        return findSeen(state.optJSONArray("seen"), notificationId)?.optString("fp")
    }

    @Synchronized override fun save(payload: NormalizedNotificationPayload, fingerprint: String, isUpdate: Boolean): Boolean {
        val state = read() ?: return false
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
        return write(state)
    }

    @Synchronized override fun markRemoved(notificationId: String, reason: Int?): Boolean {
        val state = read() ?: return false
        val fingerprint = findSeen(state.optJSONArray("seen"), notificationId)?.optString("fp") ?: return true
        val old = state.optJSONArray("pending") ?: JSONArray()
        val pending = JSONArray()
        for (i in 0 until old.length()) {
            val item = old.optJSONObject(i) ?: continue
            if (item.optString("notificationId") != notificationId && !expired(item)) pending.put(item)
        }
        state.put("pending", pending)
        state.put("seen", upsertSeen(state.optJSONArray("seen"), notificationId, fingerprint, removed = true))
        return write(state)
    }

    @Synchronized fun pendingJson(): String {
        val state = read() ?: return "[]"
        val source = state.optJSONArray("pending") ?: JSONArray()
        val result = JSONArray()
        for (i in 0 until source.length()) {
            val item = source.optJSONObject(i) ?: continue
            if (!expired(item)) result.put(item)
        }
        return result.toString()
    }

    /** Removes an offer from the pending queue. Its fingerprint stays, so the same content is not re-queued. */
    @Synchronized fun acknowledge(id: String): Boolean {
        if (id.isBlank()) return false
        val state = read() ?: return false
        val old = state.optJSONArray("pending") ?: JSONArray()
        val next = JSONArray()
        for (i in 0 until old.length()) {
            val item = old.optJSONObject(i) ?: continue
            if (item.optString("notificationId") != id && !expired(item)) next.put(item)
        }
        state.put("pending", next)
        return write(state)
    }

    @Synchronized fun lastReceivedAt(): String = read()?.optString("lastReceivedAt", "").orEmpty()
    @Synchronized fun isHealthy(): Boolean = read() != null

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

    private fun read(): JSONObject? {
        val value = prefs.getString("queue", null) ?: return JSONObject()
        return try { JSONObject(decrypt(value)) } catch (_: Exception) { null }
    }

    private fun write(state: JSONObject) = try {
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
        private const val KEY_ALIAS = "driver_profit_notification_queue_v1"
        private const val MAX_PENDING = 50
        private const val MAX_SEEN = 500
        private const val PENDING_TTL_MS = 6 * 60 * 60 * 1000L
    }
}
