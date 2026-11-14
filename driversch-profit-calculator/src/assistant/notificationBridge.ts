import { createInboxItem, markInboxParsed, requestInboxReview } from './inbox'
import { parseRideOffer } from './parser'
import type { InboxItem, RideOfferDraft } from './types'

export interface NativeNotificationPayload {
  notificationId: string
  packageName: string
  appLabel?: string
  title: string
  text: string
  postedAt: string
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
  if (!payload.notificationId || !payload.packageName || !payload.text.trim()) return null
  if (seenNotificationIds.has(payload.notificationId)) return null
  const postedAt = new Date(payload.postedAt)
  if (!Number.isFinite(postedAt.getTime())) return null
  seenNotificationIds.add(payload.notificationId)

  const draft: RideOfferDraft = parseRideOffer({
    text: [payload.appLabel, payload.title, payload.text].filter(Boolean).join('\n'),
    source: 'notification',
    now
  })
  const item = createInboxItem(draft, payload.notificationId, now)
  return requestInboxReview(markInboxParsed(item, now), now)
}
