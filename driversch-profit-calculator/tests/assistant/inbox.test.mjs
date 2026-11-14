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
  ���q�^