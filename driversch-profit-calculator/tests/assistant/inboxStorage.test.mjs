import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { IDBFactory } from 'fake-indexeddb'
import { wrap } from 'idb'
import { parseRideOffer } from '../../src/assistant/parser.ts'
import {
  createInboxItem, markInboxParsed, requestInboxReview, updateInboxDraft,
  setInboxFieldReviewed, confirmInboxItem, markInboxTransferred, rejectInboxItem, dismissInboxItem
} from '../../src/assistant/inbox.ts'
import {
  createInboxStorage, INBOX_DB_NAME, InboxStorageError
} from '../../src/assistant/inboxStorage.ts'
import { acceptNativeNotification } from '../../src/assistant/notificationBridge.ts'
import { toCalculatorTripInput } from '../../src/assistant/calculatorTransfer.ts'

async function openFakeDb(factory, name, version, upgrade) {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, version)
    request.onupgradeneeded = () => upgrade?.(request.result)
    request.onsuccess = () => resolve(wrap(request.result))
    request.onerror = () => reject(request.error)
  })
}

const required = ['fare', 'pickupDistanceKm', 'distanceKm', 'durationMinutes']
function reviewableItem(id = 'storage-test') {
  const parsed = parseRideOffer({ text: 'inDrive القبول مقابل 165 جنيه 22 كم 40 دقيقة', source: 'manual' })
  const draft = {
    ...parsed,
    fields: {
      ...parsed.fields,
      pickupDistanceKm: { value: 4, confidence: 1, evidence: [{ text: 'تصحيح يدوي: 4 كم', start: 0, end: 0 }], status: 'candidate' }
    }
  }
  return requestInboxReview(markInboxParsed(createInboxItem(draft, id)))
}
function confirmedItem(id = 'confirmed-storage') {
  let item = reviewableItem(id)
  for (const field of required) item = setInboxFieldReviewed(item, field, true)
  return confirmInboxItem(item, item.reviewedFields)
}

test('persists a captured offer and restores it from a fresh storage instance', async () => {
  const factory = new IDBFactory()
  const first = createInboxStorage(factory)
  const item = reviewableItem('capture-restore')
  await first.saveChanges([], [item])
  await first.close()
  const restored = await createInboxStorage(factory).load()
  assert.equal(restored.invalidCount, 0)
  assert.equal(restored.items.length, 1)
  assert.equal(restored.items[0].id, item.id)
  assert.equal(restored.items[0].draft.rawText, item.draft.rawText)
  assert.deepEqual(restored.items[0].draft.fields.distanceKm.evidence, item.draft.fields.distanceKm.evidence)
})

test('persists manual corrections and each individual review confirmation', async () => {
  const factory = new IDBFactory()
  const storage = createInboxStorage(factory)
  const original = reviewableItem('manual-review')
  const correctedDraft = {
    ...original.draft,
    fields: {
      ...original.draft.fields,
      fare: { value: 175, confidence: 1, evidence: [{ text: 'تم التصحيح يدويًا: 175', start: 0, end: 0 }], status: 'candidate' }
    }
  }
  let changed = updateInboxDraft(original, correctedDraft)
  changed = setInboxFieldReviewed(changed, 'fare', true)
  changed = setInboxFieldReviewed(changed, 'pickupDistanceKm', true)
  await storage.saveChanges([original], [changed])
  const restored = (await storage.load()).items[0]
  assert.equal(restored.draft.fields.fare.value, 175)
  assert.deepEqual(restored.reviewedFields, ['fare', 'pickupDistanceKm'])
  assert.equal(restored.draft.fields.fare.evidence[0].text, 'تم التصحيح يدويًا: 175')
})

test('confirmed offers restore as confirmed with their reviewed fields intact', async () => {
  const factory = new IDBFactory()
  const storage = createInboxStorage(factory)
  const item = confirmedItem('confirmed-restore')
  assert.equal(item.status, 'confirmed')
  await storage.saveChanges([], [item])
  const restored = (await createInboxStorage(factory).load()).items[0]
  assert.equal(restored.status, 'confirmed')
  assert.deepEqual(new Set(restored.reviewedFields), new Set(required))
})

test('transferred offers remain transferred after reload and cannot transfer twice', async () => {
  const factory = new IDBFactory()
  const storage = createInboxStorage(factory)
  const confirmed = confirmedItem('transferred-restore')
  const transferred = markInboxTransferred(confirmed)
  await storage.saveChanges([], [transferred])
  const restored = (await createInboxStorage(factory).load()).items[0]
  assert.equal(restored.status, 'transferred')
  assert.equal(markInboxTransferred(restored), restored)
  assert.equal(toCalculatorTripInput(restored), null)
})

test('rejection persists and explicit deletion removes only the selected item', async () => {
  const factory = new IDBFactory()
  const storage = createInboxStorage(factory)
  const first = reviewableItem('reject-delete')
  const second = reviewableItem('keep-item')
  const rejected = rejectInboxItem(first)
  await storage.saveChanges([], [first, second])
  await storage.saveChanges([first, second], [rejected, second])
  let restored = (await createInboxStorage(factory).load()).items
  assert.equal(restored.find(item => item.id === first.id)?.status, 'rejected')
  await storage.saveChanges(restored, restored.filter(item => item.id !== first.id))
  restored = (await createInboxStorage(factory).load()).items
  assert.deepEqual(restored.map(item => item.id), [second.id])
})

test('dismissed status survives reload', async () => {
  const factory = new IDBFactory()
  const storage = createInboxStorage(factory)
  const item = reviewableItem('dismissed-restore')
  const dismissed = dismissInboxItem(item)
  await storage.saveChanges([], [dismissed])
  assert.equal((await createInboxStorage(factory).load()).items[0].status, 'dismissed')
})

test('duplicate notification IDs cannot create a second stored record after reload', async () => {
  const factory = new IDBFactory()
  const storage = createInboxStorage(factory)
  const payload = {
    notificationId: 'notification-stable-id', packageName: 'sinet.startup.inDriver',
    appLabel: 'inDrive', title: 'عرض', text: 'القبول مقابل 100 جنيه 8 كم 15 دقيقة',
    postedAt: '2026-11-14T08:00:00.000Z'
  }
  const first = acceptNativeNotification(payload, new Set())
  assert.ok(first)
  await storage.saveChanges([], [first])
  const duplicateAfterReload = acceptNativeNotification(payload, new Set())
  assert.ok(duplicateAfterReload)
  await assert.rejects(storage.saveChanges([], [duplicateAfterReload]), error =>
    error instanceof InboxStorageError && error.code === 'duplicate'
  )
  assert.equal((await storage.load()).items.length, 1)
})

test('malformed stored records are skipped safely and retained for recovery', async () => {
  const factory = new IDBFactory()
  const storage = createInboxStorage(factory)
  const valid = reviewableItem('valid-record')
  await storage.saveChanges([], [valid])
  const db = await openFakeDb(factory, INBOX_DB_NAME, 1)
  await db.put('items', { id: 'broken-record', status: 'alien', draft: {} })
  await db.close()
  const result = await storage.load()
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].id, valid.id)
  assert.equal(result.invalidCount, 1)
  const rawDb = await openFakeDb(factory, INBOX_DB_NAME, 1)
  assert.ok(await rawDb.get('items', 'broken-record'))
  await rawDb.close()
})

test('legacy records without reviewedFields migrate to an empty review set', async () => {
  const factory = new IDBFactory()
  const storage = createInboxStorage(factory)
  const item = reviewableItem('legacy-v0')
  const { reviewedFields: _ignored, ...legacy } = item
  const db = await openFakeDb(factory, INBOX_DB_NAME, 1, database => {
    if (!database.objectStoreNames.contains('items')) database.createObjectStore('items', { keyPath: 'id' })
    if (!database.objectStoreNames.contains('meta')) database.createObjectStore('meta', { keyPath: 'key' })
  })
  await db.put('items', legacy)
  await db.close()
  const restored = await storage.load()
  assert.equal(restored.invalidCount, 0)
  assert.deepEqual(restored.items[0].reviewedFields, [])
})

test('IndexedDB unavailable is reported with a clear Arabic storage error', async () => {
  const storage = createInboxStorage(null)
  await assert.rejects(storage.load(), error =>
    error instanceof InboxStorageError && error.code === 'unavailable' && /التخزين المحلي غير متاح/.test(error.message)
  )
})

test('quota errors abort the write and leave existing data unchanged', async () => {
  const factory = new IDBFactory()
  const stable = createInboxStorage(factory)
  const existing = reviewableItem('quota-existing')
  await stable.saveChanges([], [existing])
  const quotaStorage = createInboxStorage(factory, {
    beforeWrite() { const error = new Error('quota'); error.name = 'QuotaExceededError'; throw error }
  })
  await assert.rejects(quotaStorage.saveChanges([existing], [{ ...existing, updatedAt: new Date().toISOString() }]), error =>
    error instanceof InboxStorageError && error.code === 'quota' && /مساحة التخزين/.test(error.message)
  )
  assert.equal((await stable.load()).items.length, 1)
  assert.equal((await stable.load()).items[0].updatedAt, existing.updatedAt)
})

test('failed multi-item transaction rolls back every write', async () => {
  const factory = new IDBFactory()
  const first = reviewableItem('atomic-first')
  const second = reviewableItem('atomic-second')
  const failing = createInboxStorage(factory, {
    beforeWrite(index) { if (index === 1) { const error = new Error('abort'); error.name = 'AbortError'; throw error } }
  })
  await assert.rejects(failing.saveChanges([], [first, second]), error =>
    error instanceof InboxStorageError && error.code === 'transaction'
  )
  assert.equal((await createInboxStorage(factory).load()).items.length, 0)
})

test('inbox storage is isolated from calculator trip history', async () => {
  const factory = new IDBFactory()
  const history = await openFakeDb(factory, 'driver-profit-calculator', 1, db => {
    if (!db.objectStoreNames.contains('trips')) db.createObjectStore('trips', { keyPath: 'id' })
  })
  const storage = createInboxStorage(factory)
  const item = confirmedItem('history-isolation')
  await storage.saveChanges([], [item])
  assert.equal(await history.count('trips'), 0)
  assert.notEqual(INBOX_DB_NAME, 'driver-profit-calculator')
  await history.close()
})
