import { createInboxItem, markInboxParsed, requestInboxReview } from './inbox.ts'
import { parseRideOffer } from './parser.ts'
import type { InboxItem, NativeProfitabilityPreview, RideOfferDraft } from './types'

export interface NativeNotificationPayload {
  notificationId: string
  packageName: string
  appLabel?: string
  title: string
  text: string
  postedAt: string
  offer?: {
    fare?: NativeFieldCandidate
    pickupDistanceKm?: NativeFieldCandidate
    distanceKm?: NativeFieldCandidate
    durationMinutes?: NativeFieldCandidate
    currency?: string | null
    fareMode?: 'net' | 'gross' | 'unknown'
  }
  analysis?: NativeProfitabilityPreview
}

interface NativeFieldCandidate {
  value: number | null
  confidence: number
  evidence: Array<{ text: string; start: number; end: number }>
  status: 'missing' | 'candidate' | 'needs-review'
}

const SUPPORTED_PACKAGES: Record<string, string> = {
  'com.ubercab.driver': 'Uber',
  'com.didiglobal.driver': 'DiDi',
  'sinet.startup.inDriver': 'inDrive'
}

/**
 * Browser code cannot subscribe to notifications posted by other Android apps.
 * The Android NotificationListenerService delivers this normalized payload
 * through the restricted local WebView bridge. This adapter independently
 * validates the package and payload before the existing parser receives it.
 */
export function acceptNativeNotification(
  payload: NativeNotificationPayload,
  seenNotificationIds: Set<string>,
  now = new Date()
): InboxItem | null {
  if (!p¶»§q«^