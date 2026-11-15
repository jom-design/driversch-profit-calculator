import { createInboxItem, markInboxParsed, requestInboxReview } from './inbox.ts'
import { parseRideOffer } from './parser.ts'
import type { InboxItem, RideOfferDraft } from './types'
import { validateNativeAnalysis } from './nativeAnalysis.ts'

/**
 * Native payloads no longer carry the raw notification title or text once analysed. The native side
 * keeps them in memory only, so `title` and `text` can be empty when `offer` is present.
 */
export interface NativeNotificationPayload {
  notificationId: string
  packageName: string
  appLabel?: string
  title: string
  text: string
  postedAt: string
  capturedAt?: string
  offer?: {
    fare?: NativeFieldCandidate
    pickupDistanceKm?: NativeFieldCandidate
    distanceKm?: NativeFieldCandidate
    durationMinutes?: NativeFieldCandidate
    pickupMinutes?: NativeFieldCandidate
    currency?: string | null
    fareMode?: 'net' | 'gross' | 'unknown'
  }
  analysis?: unknown
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
  if (!payload || typeof payload.notificationId !== 'string' || !payload.notificationId.trim() ||
      payload.notificationId.length > 512 ||
      typeof payload.packageName !== 'string' || !SUPPORTED_PACKAGES[payload.packageName] ||
      typeof payload.title !== 'string' || payload.title.length > 300 ||
      typeof payload.text !== 'string' || payload.text.length > 4000 ||
      (!payload.text.trim() && !payload.offer) ||
      typeof payload.postedAt !== 'string') return null
  if (seenNotificationIds.has(payload.notificationId)) return null
  const postedAt = new Date(payload.postedAt)
  if (!Number.isFinite(postedAt.getTime())) return null
  seenNotificationIds.add(payload.notificationId)

  const canonicalLabel = SUPPORTED_PACKAGES[payload.packageName]
  const parsed = parseRideOffer({
    text: [canonicalLabel, payload.title, payload.text].filter(Boolean).join('\n'),
    source: 'notification',
    now
  })
  const nativeField = (field: NativeFieldCandidate | undefined, fallback: RideOfferDraft['fields']['fare']) => {
    if (!field || (field.value !== null && (!Number.isFinite(field.value) || field.value < 0)) ||
        !Number.isFinite(field.confidence) || field.confidence < 0 || field.confidence > 1 ||
        !['missing', 'candidate', 'needs-review'].includes(field.status)) return fallback
    return { value: field.value, confidence: field.confidence, evidence: Array.isArray(field.evidence) ? field.evidence.filter(e => e && typeof e.text === 'string' && Number.isInteger(e.start) && Number.isInteger(e.end) && e.start >= 0 && e.end >= e.start).slice(0, 4) : [], status: field.status }
  }
  const fields = payload.offer ? {
    ...parsed.fields,
    fare: nativeField(payload.offer.fare, parsed.fields.fare),
    pickupDistanceKm: nativeField(payload.offer.pickupDistanceKm, parsed.fields.pickupDistanceKm),
    distanceKm: nativeField(payload.offer.distanceKm, parsed.fields.distanceKm),
    durationMinutes: nativeField(payload.offer.durationMinutes, parsed.fields.durationMinutes),
    currency: payload.offer.currency === 'EGP' ? { value: 'EGP' as const, confidence: 1, evidence: [], status: 'candidate' as const } : parsed.fields.currency
  } : parsed.fields
  const analysis = validateNativeAnalysis(payload.analysis)
  const draft: RideOfferDraft = {
    ...parsed, fields, nativeAnalysis: analysis,
    sourceAppPackage: payload.packageName,
    sourceAppLabel: canonicalLabel,
    sourceTimestamp: postedAt.toISOString()
  }
  const item = createInboxItem(draft, payload.notificationId, now)
  return requestInboxReview(markInboxParsed(item, now), now)
}
