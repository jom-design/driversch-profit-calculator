import test from 'node:test'
import assert from 'node:assert/strict'
import { writeBackup } from '../src/lib/backupWrite.ts'
import { planBackupReplacement } from '../src/lib/backupPlan.ts'
import { calculateTrip } from '../src/lib/calculator.ts'
import { DEFAULT_SETTINGS, EMPTY_TRIP } from '../src/types.ts'

/**
 * A fake database with transaction semantics: writes are staged and become visible only when the
 * transaction completes without an abort. A failing request aborts the transaction, as IndexedDB does.
 * `fail` injects a failure: { store, op: 'clear'|'put', at } fails the matching call (1-based), either by
 * rejecting the request (auto-abort) or by throwing synchronously (the code must abort explicitly).
 */
function fakeDatabase(initial, fail = null) {
  const committed = {
    trips: new Map(initial.trips.map(t => [t.id, structuredClone(t)])),
    settings: new Map([['main', structuredClone(initial.settings)]]),
  }
  const calls = []
  const counts = {}
  const database = {
    transactions: 0,
    transaction(stores, mode) {
      database.transactions += 1
      calls.push({ stores: [...stores], mode })
      const staged = {
        trips: new Map(committed.trips),
        settings: new Map(committed.settings),
      }
      let aborted = false
      let rejectDone
      const done = new Promise((resolve, reject) => {
        rejectDone = reject
        setTimeout(() => {
          if (aborted) return reject(new Error('transaction aborted'))
          committed.trips = new Map(staged.trips)
          committed.settings = new Map(staged.settings)
          resolve()
        }, 0)
      })
      done.catch(() => {})
      const check = (store, op) => {
        const key = `${store}.${op}`
        counts[key] = (counts[key] ?? 0) + 1
        if (fail && fail.store === store && fail.op === op && fail.at === counts[key]) {
          if (fail.mode === 'throw') throw new Error(`synthetic synchronous failure in ${key}`)
          aborted = true
          rejectDone(new Error(`synthetic request failure in ${key}`))
          throw new Error(`synthetic request failure in ${key}`)
        }
        if (aborted) throw new Error('transaction is no longer active')
      }
      return {
        done,
        abort() {
          if (aborted) throw new Error('InvalidStateError: already aborted')
          aborted = true
          rejectDone(new Error('transaction aborted explicitly'))
        },
        objectStore(name) {
          return {
            async clear() { check(name, 'clear'); staged[name].clear() },
            async put(value, key) { check(name, 'put'); staged[name].set(key ?? value.id ?? 'main', structuredClone(value)) },
          }
        },
      }
    },
    snapshot: () => ({
      trips: [...committed.trips.values()].sort((a, b) => a.id.localeCompare(b.id)),
      settings: committed.settings.get('main'),
    }),
  }
  return database
}

const trip = (id, patch = {}) => {
  const { isValid, validationErrors, ...legacy } = {
    ...EMPTY_TRIP,
    ...calculateTrip({ ...EMPTY_TRIP, ...patch }, DEFAULT_SETTINGS),
    id,
    createdAt: '2026-11-14T00:00:00.000Z',
    ...patch,
  }
  return legacy
}
const settings = (patch = {}) => ({ ...DEFAULT_SETTINGS, fuelPrice: 25, commission: { ...DEFAULT_SETTINGS.commission }, ...patch })

const existing = { trips: [trip('old-1'), trip('old-2', { fare: 90 })], settings: settings({ fuelPrice: 18 }) }
const incoming = () => planBackupReplacement([trip('new-1'), trip('new-2', { fare: 210 })], settings({ fuelPrice: 26 }))

test('a successful write replaces trips and settings together, in one transaction over both stores', async () => {
  const db = fakeDatabase(existing)
  const plan = incoming()
  await writeBackup(db, plan)
  const after = db.snapshot()
  assert.deepEqual(after.trips.map(t => t.id), ['new-1', 'new-2'])
  assert.equal(after.settings.fuelPrice, 26)
  assert.equal(db.transactions, 1)
})

test('a failed request on the first trip leaves both the trips and the settings unchanged', async () => {
  const db = fakeDatabase(existing, { store: 'trips', op: 'clear', at: 1 })
  await assert.rejects(writeBackup(db, incoming()))
  const after = db.snapshot()
  assert.deepEqual(after.trips.map(t => t.id), ['old-1', 'old-2'])
  assert.equal(after.settings.fuelPrice, 18)
})

test('a failed trip write after the clear rolls the clear back as well', async () => {
  const db = fakeDatabase(existing, { store: 'trips', op: 'put', at: 2 })
  await assert.rejects(writeBackup(db, incoming()))
  const after = db.snapshot()
  assert.deepEqual(after.trips.map(t => t.id), ['old-1', 'old-2'])
  assert.equal(after.settings.fuelPrice, 18)
})

test('a failed settings write leaves the old trips in place, not the new ones', async () => {
  const db = fakeDatabase(existing, { store: 'settings', op: 'put', at: 1 })
  await assert.rejects(writeBackup(db, incoming()))
  const after = db.snapshot()
  assert.deepEqual(after.trips.map(t => t.id), ['old-1', 'old-2'])
  assert.equal(after.settings.fuelPrice, 18)
})

test('a synchronous exception mid-write still aborts the transaction, so nothing is committed', async () => {
  const db = fakeDatabase(existing, { store: 'trips', op: 'put', at: 1, mode: 'throw' })
  await assert.rejects(writeBackup(db, incoming()))
  const after = db.snapshot()
  assert.deepEqual(after.trips.map(t => t.id), ['old-1', 'old-2'])
  assert.equal(after.settings.fuelPrice, 18)
})

test('an invalid plan never reaches the database, so existing data is untouched', async () => {
  const db = fakeDatabase(existing)
  const plan = planBackupReplacement([trip('x', { totalMinutes: -1 })], settings())
  assert.equal(plan.ok, false)
  assert.equal(db.transactions, 0)
  assert.deepEqual(db.snapshot().trips.map(t => t.id), ['old-1', 'old-2'])
})

test('the transaction covers both stores in a single call', async () => {
  const db = fakeDatabase(existing)
  await writeBackup(db, incoming())
  assert.equal(db.transactions, 1)
})
