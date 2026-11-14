import { createInboxItem, markInboxParsed, requestInboxReview } from './inbox.ts'
import { parseRideOffer } from './parser.ts'
import type { InboxItem, RideOfferDraft } from './types'

export interface NativeNotificationPayload {
  notificationId: string
  packageName: string
  appLabel?: string
  title: string
  text: string
  postedAt: string
}

const SUPPORTED_PACKAGES: Record<string, string> = {
  'com.ubercab.driver': 'Uber',
  'com.didiglobal.driver': 'DiDi',
  'sinet.startup.inDriver': 'inDrive'
}

/**
 * Browser code cannot subscribe to notifications posted by other Android apps.
 * A future Android NotificationListenerService may deliver this normalized
 * payload to a WebView/native bridge. This adapter only validates and parses
 * a payload already delivered by that trusted native boundary.
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
      typeof payload.text !== 'string' || !payload.text.trim() || payload.text.length > 4000 ||
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
  const draft: RideOfferDraft = {
    ...parsed,
    sourceAppPackage: payload.packageName,
    sourceAppLabel: canonicalLabel,
    sourceTimestamp: postedAt.toISOString()
  }
  const item = createInboxItem(draft, payload.notificationId, now)
  return requestInboxReview(markInboxParsed(item, now), now)
}
