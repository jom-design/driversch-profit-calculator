package com.driverprofitcalculator.app.capture

import java.security.MessageDigest

/**
 * Pure (no Android imports) notification processing pipeline:
 *   NotificationCaptureService -> RawNotificationEvent -> NotificationEventProcessor
 *   -> CaptureStore (persistence) and CaptureCounters (safe aggregate diagnostics).
 *
 * Privacy: outcomes and counters never carry notification text.
 */

enum class CaptureEventKind { POSTED, REMOVED }

/** Platform-independent copy of a StatusBarNotification, built by the service. */
data class RawNotificationEvent(
    val kind: CaptureEventKind,
    val packageName: String,
    val key: String,
    val title: String,
    val text: String,
    val postedAtMillis: Long,
    val isGroupSummary: Boolean,
    /** NotificationListenerService removal reason code, meaningful only for REMOVED. */
    val removeReason: Int? = null,
    /** Android MessagingStyle notifications are conversations, not ride offers. */
    val isMessaging: Boolean = false,
)

sealed class CaptureOutcome {
    /** A new offer, or a changed update of a known offer, was persisted for downstream analysis. */
    data class Stored(val notificationId: String, val isUpdate: Boolean) : CaptureOutcome()
    /** Same notification content was already processed: no new processing result is created. */
    data class Duplicate(val notificationId: String) : CaptureOutcome()
    data class Removed(val notificationId: String, val known: Boolean) : CaptureOutcome()
    object Unsuppor¶»§q«^