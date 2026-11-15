import test from 'node:test'
import assert from 'node:assert/strict'
import { acceptNativeNotification } from '../../src/assistant/notificationBridge.ts'

const valid = {
  notificationId: 'com.ubercab.driver:offer-1',
  packageName: 'com.ubercab.driver',
  appLabel: 'Uber',
  title: 'New trip request',
  text: 'Fare 165 EGP · 5 km · 20 min',
  postedAt: '2026-11-14T08:00:00.000Z'
}

test('accepts a normalized notification from an explicitly supported driver package', () => {
  const item = acceptNativeNotification(valid, new Set(), new Date('2026-11-14T08:01:00.000Z'))
  assert.ok(item)
  assert.equal(item?.draft.provider, 'uber')
  assert.equal(item?.draft.source, 'notification')
  assert.equal(item?.status, 'needs-review')
})

test('rejects unsupported and passenger package identifiers', () => {
  assert.equal(acceptNativeNotification({ ...valid, packageName: 'com.example.fake' }, new Set()), null)
  assert.equal(acceptNativeNotification({ ...valid, packageName: 'com.didiglobal.passenger' }, new Set()), null)
})

test('deduplicates notification IDs before creating an inbox item', () => {
  const seen = new Set([valid.notificationId])
  assert.equal(acceptNativeNotification(valid, seen), null)
})

test('rejects oversized or malformed notification payloads', () => {
  assert.equal(acceptNativeNotification({ ...valid, text: 'x'.repeat(4001) }, new Set()), null)
  assert.equal(acceptNativeNotification({ ...valid, postedAt: 'not-a-date' }, new Set()), null)
})

test('uses native normalized fields and Kotlin profitability preview when present', () => {
  const payload = {
    ...valid,
    offer: {
      fare: { value: 165, confidence: 0.94, evidence: [{ text: 'Fare: 165 EGP', start: 20, end: 33 }], status: 'candidate' },
      pickupDistanceKm: { value: 2.5, confidence: 0.96, evidence: [{ text: 'Pickup distance: 2.5 km', start: 34, end: 57 }], status: 'candidate' },
      distanceKm: { value: 18, confidence: 0.96, evidence: [{ text: 'Trip distance: 18 km', start: 58, end: 78 }], status: 'candidate' },
      durationMinutes: { value: 35, confidence: 0.96, evidence: [{ text: 'Trip duration: 35 min', start: 79, end: 100 }], status: 'candidate' },
      currency: 'EGP',
      fareMode: 'net'
    },
    analysis: {
      recommendation: 'review', netProfit: 54.25, hourlyProfit: 93, totalCost: 110.75, requiredFare: 125,
      partialCost: null, missingFields: ['returnDistance', 'extraExpenses'], reason: 'review', payloadVerified: false
    }
  }
  const item = acceptNativeNotification(payload, new Set(), new Date('2026-11-14T08:01:00.000Z'))
  assert.equal(item?.draft.fields.fare.value, 165)
  assert.equal(item?.draft.fields.pickupDistanceKm.value, 2.5)
  assert.equal(item?.draft.fields.distanceKm.value, 18)
  assert.equal(item?.draft.fields.durationMinutes.value, 35)
  assert.equal(item?.draft.fields.currency.value, 'EGP')
  assert.equal(item?.draft.nativeAnalysis?.netProfit, 54.25)
  assert.equal(item?.draft.nativeAnalysis?.recommendation, 'review')
  assert.equal(item?.draft.nativeAnalysis?.payloadVerified, false)
})

test('accepts an analysed offer whose raw title and text were dropped natively', () => {
  const payload = {
    notificationId: 'com.ubercab.driver:offer-2',
    packageName: 'com.ubercab.driver',
    title: '',
    text: '',
    postedAt: '2026-11-14T08:00:00.000Z',
    offer: { fare: { value: 130, confidence: 0.94, evidence: [], status: 'candidate' }, currency: 'EGP', fareMode: 'net' },
    analysis: {
      recommendation: 'insufficient_data', netProfit: null, hourlyProfit: null, totalCost: null, requiredFare: null,
      partialCost: 94.5, missingFields: ['returnDistance', 'extraExpenses'], reason: 'insufficient', payloadVerified: false
    }
  }
  const item = acceptNativeNotification(payload, new Set(), new Date('2026-11-14T08:01:00.000Z'))
  assert.ok(item)
  assert.equal(item?.draft.fields.fare.value, 130)
  assert.equal(item?.draft.nativeAnalysis?.netProfit, null)
  assert.equal(item?.draft.nativeAnalysis?.partialCost, 94.5)
})

test('drops a malformed analysis instead of displaying it', () => {
  const payload = {
    ...valid,
    analysis: { recommendation: 'accept', netProfit: null, hourlyProfit: null, totalCost: null, requiredFare: null,
      partialCost: null, missingFields: [], reason: 'bad', payloadVerified: false }
  }
  const item = acceptNativeNotification(payload, new Set(), new Date('2026-11-14T08:01:00.000Z'))
  assert.equal(item?.draft.nativeAnalysis, undefined)
})
