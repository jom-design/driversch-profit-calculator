package com.driverprofitcalculator.app.capture

import org.json.JSONException
import org.json.JSONObject
import javax.crypto.AEADBadTagException

/**
 * Pure decode step for the encrypted capture queue.
 *
 * A blob that cannot be authenticated or parsed (for example after the Keystore key was lost, or after a
 * device restore) is treated as corrupt and replaced with an empty queue. Previously the store kept
 * failing every write. Keystore failures other than a bad authentication tag are not caught here, so they
 * do not discard valid data.
 */
internal object CaptureQueueCodec {
    class Opened(val state: JSONObject, val wasCorrupt: Boolean)

    fun open(raw: String?, decrypt: (String) -> String): Opened {
        if (raw == null) return Opened(JSONObject(), wasCorrupt = false)
        val plain = try {
            decrypt(raw)
        } catch (_: AEADBadTagException) {
            return Opened(JSONObject(), wasCorrupt = true)
        } catch (_: IllegalArgumentException) {
            return Opened(JSONObject(), wasCorrupt = true)
        }
        return try {
            Opened(JSONObject(plain), wasCorrupt = false)
        } catch (_: JSONException) {
            Opened(JSONObject(), wasCorrupt = true)
        }
    }

    /** True when the stored blob is absent or can be decrypted and parsed. Used for health reporting. */
    fun isReadable(raw: String?, decrypt: (String) -> String): Boolean = open(raw, decrypt).let { !it.wasCorrupt }
}
