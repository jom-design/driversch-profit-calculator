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

/** Short-lived encrypted handoff queue. Acknowledged IDs are retained to deduplicate updates. */
class EncryptedNotificationStore(context: Context) {
    private val prefs = context.getSharedPreferences("notification_queue", Context.MODE_PRIVATE)

    @Synchronized fun put(payload: JSONObject): Boolean {
        val state = read() ?: return false
        val id = payload.optString("notificationId")
        if (id.isBlank() || contains(state.optJSONArray("delivered"), id)) return false
        val old = state.optJSONArray("pending") ?: JSONArray()
        val next = JSONArray()
        var found = false
        for (i in 0 until old.length()) {
            val item = old.optJSONObject(i) ?: continue
            if (item.optString("notificationId") == id) {
                if (!found) next.put(payload)
                found = true
            } else if (!expired(item)) next.put(item)
        }
        if (!found) next.put(payload)
        val bounded = JSONArray()
        val start = (next.length() - 50).coerceAtLeast(0)
        for (i in start until next.length()) bounded.put(next.getJSONObject(i))
        state.put("pending", bounded).put("lastReceivedAt", payload.optString("postedAt"))
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

    @Synchronized fun acknowledge(id: String): Boolean {
        if (id.isBlank()) return false
        val state = read() ?: return false
        val old = state.optJSONArray("pending") ?: JSONArray()
        val next = JSONArray()
        for (i in 0 until old.length()) {
            val item = old.optJSONObject(i) ?: continue
            if (item.optString("notificationId") != id && !expired(item)) next.put(item)
        }
        val delivered = state.optJSONArray("delivered") ?: JSONArray()
        if (!contains(delivered, id)) delivered.put(id)
        val bounded = JSONArray()
        val start = (delivered.length() - 200).coerceAtLeast(0)
        for (i in start until delivered.length()) bounded.put(delivered.getString(i))
        state.put("pending", next).put("delivered", bounded)
        return write(state)
    }

    @Synchronized fun lastReceivedAt(): String = read()?.optString("lastReceivedAt", "").orEmpty()
    private fun expired(item: JSONObject): Boolean {
        val time = try { java.time.Instant.parse(item.optString("postedAt")).toEpochMilli() } catch (_: Exception) { 0L }
        return time <= 0L || System.currentTimeMillis() - time > 6 * 60 * 60 * 1000L
    }
    private fun contains(a: JSONArray?, id: String): Boolean {
        if (a == null) return false
        for (i in 0 until a.length()) if (a.optString(i) == id) return true
        return false
    }
    private fun read(): JSONObject? {
        val value = prefs.getString("queue", null) ?: return JSONObject()
        return try { JSONObject(decrypt(value)) } catch (_: Exception) { null }
    }
    private fun write(state: JSONObject) = try { prefs.edit().putString("queue", encrypt(state.toString())).commit() } catch (_: Exception) { false }
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
    companion object { private const val KEY_ALIAS = "driver_profit_notification_queue_v1" }
}
