package com.driverprofitcalculator.app.capture

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.security.KeyStoreException
import javax.crypto.AEADBadTagException

/**
 * Regression tests for the corrupt-queue recovery path. Before the fix, an undecryptable blob made every
 * write fail permanently. A Keystore error must still propagate, so valid data is not discarded.
 */
class CaptureQueueCodecTest {

    @Test
    fun missingBlobIsAnEmptyQueueNotACorruption() {
        val opened = CaptureQueueCodec.open(null) { error("must not decrypt a missing blob") }
        assertFalse(opened.wasCorrupt)
        assertEquals(0, opened.state.length())
    }

    @Test
    fun decryptableBlobIsLoaded() {
        val opened = CaptureQueueCodec.open("blob") { """{"lastReceivedAt":"2026-11-14T21:00:00.000Z"}""" }
        assertFalse(opened.wasCorrupt)
        assertEquals("2026-11-14T21:00:00.000Z", opened.state.getString("lastReceivedAt"))
    }

    @Test
    fun authenticationFailureResetsToEmptyQueueAndIsFlagged() {
        // Example: Keystore key was regenerated after a restore, so the old blob no longer authenticates.
        val opened = CaptureQueueCodec.open("blob") { throw AEADBadTagException("tag mismatch") }
        assertTrue(opened.wasCorrupt)
        assertEquals(0, opened.state.length())
    }

    @Test
    fun unparseablePlaintextResetsToEmptyQueueAndIsFlagged() {
        val opened = CaptureQueueCodec.open("blob") { "not json at all" }
        assertTrue(opened.wasCorrupt)
        assertEquals(0, opened.state.length())
    }

    @Test
    fun keystoreErrorPropagatesAndDoesNotDiscardValidData() {
        try {
            CaptureQueueCodec.open("blob") { throw KeyStoreException("keystore temporarily unavailable") }
            fail("a Keystore error must not be treated as corruption")
        } catch (expected: KeyStoreException) {
            // expected: the caller reports a write failure and keeps the stored blob untouched
        }
    }

    @Test
    fun readabilityReflectsWhetherTheBlobCanBeOpened() {
        assertTrue(CaptureQueueCodec.isReadable(null) { error("unused") })
        assertTrue(CaptureQueueCodec.isReadable("blob") { "{}" })
        assertFalse(CaptureQueueCodec.isReadable("blob") { throw AEADBadTagException("tag mismatch") })
    }
}
