import type { InboxItem, RideOfferDraft } from './types'

export function createInboxItem(draft: RideOfferDraft, id: string, now = new Date()): InboxItem {
  return {
    id,
    status: 'received',
    draft,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  }
}

export function markInboxParsed(item: InboxItem, now = new Date()): InboxItem {
  if (item.status !== 'received') return item
  return { ...item, status: 'parsed', updatedAt: now.toISOString() }
}

export function requestInboxReview(item: InboxItem, now = new Date()): InboxItem {
  if (item.status !== 'parsed') return item
  return { ...item, status: 'needs-review', updatedAt: now.toISOString() }
}

/**
 * Confirmation is an explicit user action. Required values must exist and the
 * caller must identify every field the user reviewed; this function never
 * fills missing values or upgrades OCR confidence.
 */
export function confirmInboxItem(
  item: InboxItem,
  reviewedFields: Array<'fare' | 'distanceKm' | 'durationMinutes'>,
  now = new Date()
): InboxItem {
  if (item.status !== 'needs-review') return item
  const required = ['fare', 'distanceKm', 'durationMinutes'] as const
  const hasAllReviewed = required.every(field => reviewedFields.includes(field))
  const hasAllValues = required.every(field => item.draft.fields[field].value !== null)
  if (!hasAllReviewed || !hasAllValues) return item
  return { ...item, status: 'confirmed', updatedAt: now.toISOString() }
}

export function dismissInboxItem(item: InboxItem, now = new Date()): InboxItem {
  if (item.status === 'confirmed' || item.status === 'dismissed') return item
  return { ...item, status: 'dismissed', updatedAt: now.toISOString() }
}
