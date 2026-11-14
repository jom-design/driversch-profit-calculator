import test from 'node:test'
import assert from 'node:assert/strict'
import { parseRideOffer } from '../../src/assistant/parser.ts'
import { createInboxItem, markInboxParsed, requestInboxReview, confirmInboxItem, dismissInboxItem } from '../../src/assistant/inbox.ts'

const reviewed = ['fare', 'distanceKm', 'durationMinutes']

function completeItem() {
  const draft = parseRideOffer({ text: 'inDrive\nالقبول مقابل 165 جنيه\n22 كم\n40 دقيقة' })
  return createInboxItem(draft, 'inbox-test-1', new Date('2026-11-14T08:00:00.000Z'))
}

test('inbox requires explicit progression before confirmation', () => {
  const received = completeItem()
  assert.equal(confirmInboxItem(received, reviewed).status, 'received')
  const parsed = markInboxParsed(received)
  const review = requestInboxReview(parsed)
  assert.equal(review.status, 'needs-review')
  assert.equal(confirmInboxItem(review, reviewed).status, 'confirmed')
})

test('inbox cannot confirm missing or unreviewed required fields', () => {
  const draft = parseRideOffer({ text: 'DiDi\nالأجرة: 80 EGP' })
  const item = requestInboxReview(markInboxParsed(createInboxItem(draft, 'missing-1')))
  assert.equal(confirmInboxItem(item, reviewed).status, 'needs-review')
  const complete = requestInboxReview(markInboxParsed(createInboxItem(
    parseRideOffer({ text: 'inDrive\nالقبول مقابل 90 جنيه\n5 كم\n10 دقيقة' }), 'complete-1'
  )))
  assert.equal(confirmInboxItem(complete, ['fare']).status, 'needs-review')
})

test('dismissal is terminal and does not dismiss confirmed items', () => {
  const item = completeItem()
  const dismissed = dismissInboxItem(item)
  assert.equal(dismissed.status, 'dismissed')
  assert.equal(dismissInboxItem(dismissed).status, 'dismissed')
  const confirmed = confirmInboxItem(requestInboxReview(markInboxParsed(completeItem())), reviewed)
  assert.equal(dismissInboxItem(confirmed).status, 'confirmed')
})
