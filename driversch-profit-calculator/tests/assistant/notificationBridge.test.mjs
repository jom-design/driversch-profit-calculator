import test from 'node:test'
import assert from 'node:assert/strict'
import { acceptNativeNotification } from '../../src/assistant/notificationBridge.ts'

const valid = {
  notificationId: 'com.ubercab.driver:offer-1',
  packageName: 'com.ubercab.driver',
  appLabel: 'Uber',
  title: 'New trip request',
  text: 'Fare 165 EGP Â· 5 km Â· 20 min',
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

test('uses nat¶»§q«^