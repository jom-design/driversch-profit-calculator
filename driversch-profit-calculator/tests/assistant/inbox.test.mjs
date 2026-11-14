import test from 'node:test'
import assert from 'node:assert/strict'
import { parseRideOffer } from '../../src/assistant/parser.ts'
import {
  createInboxItem, markInboxParsed, requestInboxReview, confirmInboxItem,
  rejectInboxItem, dismissInboxItem, updateInboxDraft, markInboxParseError,
  hasRequiredReviewData, deleteInboxItem, markInboxTransferred
} from '../../src/assistant/inbox.ts'
import { acceptNativeNotification } from '../../src/assistant/notificationBridge.ts'
import { toCalculatorTripInput } from '../../src/assistant/calculatorTransfer.ts'
import { ocrDraftToInboxItem } from '../../src/assistant/ocrAdapter.ts'

const required = ['fare', 'pickupDistanceKm', 'distanceKm', 'durationMinutes']

function reviewableItem(id = 'inbox-test-1') {
  const draft = parseRideOffer({ text: 'inDrive\nالقبول مقابل 165 جنيه\n22 كم\n40 دقيقة' })
  const withPickup = { ...draft, fields: { ...draft.fields, pickupDistanceKm: {
    value: 4, confidence: 1, evidence: [{ text: 'أدخلت يدويًا: 4 كم', start: 0, end: 0 }], status: 'candidate'
  } } }
  return requestInboxReview(markInboxParsed(createInboxItem(withPickup, id)))
}

test('inbox requires received → parsed → needs-review → explicit confirmation', () => {
  const draft = parseRideOffer({ text: 'inDrive القبول مقابل 165 جنيه 22 كم 40 دقيقة' })
  const received = createInboxItem(draft, 'lifecycle')
  assert.equal(confirmInboxItem(received, required).status, 'received')
  const parsed = markInboxParsed(received)
  const review = requestInboxReview(parsed)
  assert.equal(review.status, 'needs-review')
  assert.equal(hasRequiredReviewData(review), false)
  assert.equal(confirmInboxItem(review, required).status, 'needs-review')
  const ready = reviewableItem('lifecycle-ready')
  assert.equal(hasRequiredReviewData(ready), true)
  assert.equal(confirmInboxItem(ready, required.slice(0, 3)).status, 'needs-review')
  assert.equal(confirmInboxItem(ready, required).status, 'confirmed')
})

test('missing fare, pickup distance, passenger distance, and duration block confirmation', () => {
  const draft = parseRideOffer({ text: 'DiDi\nالأجرة: 80 EGP' })
  const item = requestInboxReview(markInboxParsed(createInboxItem(draft, 'missing-1')))
  assert.equal(item.draft.fields.fare.value, 80)
  assert.equal(item.draft.fields.distanceKm.status, 'missing')
  assert.equal(item.draft.fields.durationMinutes.status, 'missing')
  assert.equal(hasRequiredReviewData(item), false)
  assert.equal(confirmInboxItem(item, required).status, 'needs-review')
})

test('manual correction updates candidate value and confidence without mutating original', () => {
  const original = reviewableItem('correct-1')
  const correctedDraft = { ...original.draft, fields: { ...original.draft.fields,
    fare: { value: 172, confidence: 1, evidence: [{ text: 'تم الإدخال أو التصحيح يدويًا', start: 0, end: 0 }], status: 'candidate' }
  } }
  const corrected = updateInboxDraft(original, correctedDraft)
  assert.equal(corrected.draft.fields.fare.value, 172)
  assert.equal(corrected.draft.fields.fare.confidence, 1)
  assert.equal(original.draft.fields.fare.value, 165)
})

test('low-confidence extraction remains flagged until user review', () => {
  const draft = parseRideOffer({ text: 'DiDi\nالأجرة: 80 EGP\n10 كم\n20 دقيقة' })
  assert.equal(draft.fields.fare.confidence, 0.78)
  assert.equal(draft.fields.fare.status, 'needs-review')
})

test('rejection is terminal and confirmed offers cannot be rejected', () => {
  const pending = reviewableItem('reject-1')
  const rejected = rejectInboxItem(pending)
  assert.equal(rejected.status, 'rejected')
  assert.equal(rejectInboxItem(rejected).status, 'rejected')
  const confirmed = confirmInboxItem(reviewableItem('confirmed-1'), required)
  assert.equal(rejectInboxItem(confirmed).status, 'confirmed')
})

test('dismissal is terminal and does not dismiss confirmed items', () => {
  const dismissed = dismissInboxItem(reviewableItem('dismiss-1'))
  assert.equal(dismissed.status, 'dismissed')
  assert.equal(dismissInboxItem(dismissed).status, 'dismissed')
  const confirmed = confirmInboxItem(reviewableItem('confirmed-2'), required)
  assert.equal(dismissInboxItem(confirmed).status, 'confirmed')
})

test('parse errors are represented as reviewable inbox items without invented values', () => {
  const error = markInboxParseError('parse-error-1', 'manual', 'unreadable content')
  assert.equal(error.status, 'parse-error')
  assert.equal(error.draft.fields.fare.value, null)
  assert.equal(error.draft.fields.distanceKm.value, null)
})

test('native bridge deduplicates notifications and rejects malformed payloads', () => {
  const seen = new Set()
  const payload = { notificationId: 'notif-1', packageName: 'sinet.startup.inDriver', appLabel: 'inDrive',
    title: 'عرض جديد', text: 'القبول مقابل 100 جنيه 8 كم 15 دقيقة', postedAt: '2026-11-14T08:00:00.000Z' }
  const first = acceptNativeNotification(payload, seen)
  assert.equal(first?.status, 'needs-review')
  assert.equal(first?.draft.source, 'notification')
  assert.equal(first?.draft.sourceAppPackage, 'sinet.startup.inDriver')
  assert.equal(first?.draft.sourceTimestamp, '2026-11-14T08:00:00.000Z')
  assert.equal(acceptNativeNotification(payload, seen), null)
  assert.equal(acceptNativeNotification({ ...payload, notificationId: '', text: 'x' }, seen), null)
  assert.equal(acceptNativeNotification({ ...payload, packageName: '' }, seen), null)
  assert.equal(acceptNativeNotification({ ...payload, postedAt: 'not-a-date' }, seen), null)
})

test('calculator handoff is impossible before confirmation and never persists history', () => {
  const pending = reviewableItem('handoff-pending')
  assert.equal(toCalculatorTripInput(pending), null)
  const confirmed = confirmInboxItem(reviewableItem('handoff-confirmed'), required)
  const trip = toCalculatorTripInput(confirmed)
  assert.equal(trip?.fare, 165)
  assert.equal(trip?.pickupKm, 4)
  assert.equal(trip?.passengerKm, 22)
  assert.equal(trip?.totalMinutes, 40)
  assert.equal(trip?.fareMode, 'unknown')
  assert.equal('id' in (trip ?? {}), false)
  assert.equal('createdAt' in (trip ?? {}), false)
})

test('deletion removes only the selected inbox item and does not save a trip', () => {
  const items = [reviewableItem('keep'), reviewableItem('delete')]
  const afterDelete = deleteInboxItem(items, 'delete')
  assert.deepEqual(afterDelete.map(item => item.id), ['keep'])
})

test('screenshot OCR enters review inbox and is never sent directly to calculator', () => {
  const ocr = {
    app: 'Uber', fare: 165, fareMode: 'net', pickupKm: 4, passengerKm: 22,
    totalMinutes: 40, rawText: 'Uber\n165 EGP\n4 km\n22 km\n40 min', confidence: 92, warnings: []
  }
  const item = ocrDraftToInboxItem(ocr, 'ocr-1', new Date('2026-11-14T08:00:00.000Z'))
  assert.equal(item.status, 'needs-review')
  assert.equal(item.draft.source, 'screenshot')
  assert.equal(item.draft.fields.fare.value, 165)
  assert.equal(item.draft.fields.fare.confidence, 0)
  assert.equal(item.draft.fields.pickupDistanceKm.value, 4)
  assert.equal(toCalculatorTripInput(item), null)
})


test('each required field is independently mandatory before confirmation', () => {
  const complete = reviewableItem('each-required')
  for (const field of required) {
    const draft = { ...complete.draft, fields: { ...complete.draft.fields, [field]: { ...complete.draft.fields[field], value: null } } }
    const missing = { ...complete, draft }
    assert.equal(hasRequiredReviewData(missing), false, field)
    assert.equal(confirmInboxItem(missing, required).status, 'needs-review', field)
  }
})

test('OCR adapter rejects invalid runtime payloads instead of forwarding malformed values', () => {
  const valid = { app: 'Uber', fare: 165, fareMode: 'net', pickupKm: 4, passengerKm: 22, totalMinutes: 40, rawText: 'Uber 165 EGP', confidence: 90, warnings: [] }
  assert.throws(() => ocrDraftToInboxItem({ ...valid, fare: Number.NaN }, 'ocr-invalid'), /Invalid OCR draft payload/)
  assert.throws(() => ocrDraftToInboxItem({ ...valid, pickupKm: -1 }, 'ocr-invalid'), /Invalid OCR draft payload/)
  assert.throws(() => ocrDraftToInboxItem({ ...valid, confidence: 101 }, 'ocr-invalid'), /Invalid OCR draft payload/)
  assert.throws(() => ocrDraftToInboxItem({ ...valid, warnings: [42] }, 'ocr-invalid'), /Invalid OCR draft payload/)
})

test('a confirmed offer can be transferred once and then becomes non-transferable', () => {
  const pending = reviewableItem('transfer-once')
  assert.equal(markInboxTransferred(pending).status, 'needs-review')
  const confirmed = confirmInboxItem(pending, required)
  const transferred = markInboxTransferred(confirmed)
  assert.equal(transferred.status, 'transferred')
  assert.equal(markInboxTransferred(transferred), transferred)
  assert.equal(toCalculatorTripInput(transferred), null)
})
