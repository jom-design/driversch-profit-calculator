import test from 'node:test'
import assert from 'node:assert/strict'
import { parseRideOffer, normalizeRideText } from '../../src/assistant/parser.ts'

test('normalizes Arabic and Persian digits', () => {
  assert.equal(normalizeRideText('١٢٣ ۴۵۶'), '123 456')
})

test('extracts an inDrive fare only from the explicit acceptance label', () => {
  const draft = parseRideOffer({ text: 'inDrive\nالقبول مقابل 165 جنيه\n22 كم\n40 دقيقة' })
  assert.equal(draft.provider, 'indrive')
  assert.equal(draft.fields.fare.value, 165)
  assert.equal(draft.fields.fare.status, 'candidate')
  assert.equal(draft.fields.distanceKm.value, 22)
  assert.equal(draft.fields.durationMinutes.value, 40)
})

test('does not guess a fare when no fare label exists', () => {
  const draft = parseRideOffer({ text: 'Uber\n22 كم\n40 دقيقة\n165 جنيه رسوم توصيل' })
  assert.equal(draft.fields.fare.value, null)
  assert.ok(draft.warnings.some(message => message.includes('لن يتم تخمينها')))
})

test('unknown provider remains unknown', () => {
  const draft = parseRideOffer({ text: 'عرض رحلة 165 جنيه لمسافة 12 كم' })
  assert.equal(draft.provider, 'unknown')
  assert.equal(draft.fields.fare.value, null)
})

test('keeps missing distance and duration explicit', () => {
  const draft = parseRideOffer({ text: 'DiDi\nالأجرة: 80 EGP' })
  assert.equal(draft.fields.fare.value, 80)
  assert.equal(draft.fields.distanceKm.status, 'missing')
  assert.equal(draft.fields.durationMinutes.status, 'missing')
})

test('preserves source and deterministic timestamp', () => {
  const now = new Date('2026-11-14T08:00:00.000Z')
  const draft = parseRideOffer({ text: 'inDrive القبول مقابل 100 جنيه', source: 'notification', now })
  assert.equal(draft.source, 'notification')
  assert.equal(draft.createdAt, now.toISOString())
})

test('converts meters to kilometers and hours to minutes', () => {
  const draft = parseRideOffer({ text: 'inDrive\nالقبول مقابل 90 جنيه\n750 متر\n1 ساعة' })
  assert.equal(draft.fields.distanceKm.value, 0.75)
  assert.equal(draft.fields.durationMinutes.value, 60)
})

test('does not treat an unlabeled Uber fee as the driver fare', () => {
  const draft = parseRideOffer({ text: 'Uber\n165 جنيه رسوم توصيل\n22 كم\n40 دقيقة' })
  assert.equal(draft.fields.fare.value, null)
})

test('does not confuse two unlabeled distances with pickup and passenger distance', () => {
  const draft = parseRideOffer({ text: 'inDrive\nالقبول مقابل 150 جنيه\n4 كم\n22 كم\n40 دقيقة' })
  assert.equal(draft.fields.distanceKm.value, null)
  assert.equal(draft.fields.pickupDistanceKm.value, null)
  assert.ok(draft.warnings.some(message => message.includes('لم يتم تخمين')))
})

test('extracts explicitly labeled pickup and passenger distances separately', () => {
  const draft = parseRideOffer({ text: 'inDrive\nالقبول مقابل 150 جنيه\nمسافة الوصول: 4 كم\nمسافة الرحلة: 22 كم\n40 دقيقة' })
  assert.equal(draft.fields.pickupDistanceKm.value, 4)
  assert.equal(draft.fields.distanceKm.value, 22)
  assert.equal(draft.fields.pickupDistanceKm.confidence, 0.96)
  assert.equal(draft.fields.distanceKm.confidence, 0.96)
})
