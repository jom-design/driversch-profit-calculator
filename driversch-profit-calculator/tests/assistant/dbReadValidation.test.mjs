import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { openDB } from 'idb'
import { DEFAULT_SETTINGS, EMPTY_TRIP } from '../../src/types.ts'

const { getTrips, saveTrip, replaceAllData } = await import('../../src/lib/db.ts')
const DB_NAME = 'driver-profit-calculator'

// Ensure the production module completes its schema upgrade before this test seeds rows.
await getTrips()

const legacyTrip = {
  ...EMPTY_TRIP,
  id: 'legacy-valid',
  createdAt: '2026-11-14T10:00:00.000Z',
  totalKm: 22,
  fuelCost: 48.95,
  maintenanceCost: 55,
  totalCost: 103.95,
  netFare: 165,
  netProfit: 61.05,
  hourlyProfit: 91.58,
  requiredFare: 153.95,
  fareGap: -11.05,
  decision: 'accept',
  decisionReason: 'ok'
}

test('valid legacy history remains visible while malformed rows are hidden but not deleted', async () => {
  const db = await openDB(DB_NAME, 1)
  await db.put('trips', legacyTrip)
  await db.put('trips', { ...legacyTrip, id: 'forged', netProfit: 999999 })
  await db.put('trips', { ...legacyTrip, id: 'broken-input', fare: Number.NaN })
  await db.close()

  const trips = await getTrips()
  assert.deepEqual(trips.map(trip => trip.id), ['legacy-valid'])
  assert.equal(trips[0].calculationSettings, undefined)

  const verify = await openDB(DB_NAME, 1)
  assert.ok(await verify.get('trips', 'forged'), 'invalid row is retained on disk for recovery')
  assert.ok(await verify.get('trips', 'broken-input'), 'malformed row is retained on disk for recovery')
  assert.ok(await verify.get('trips', 'legacy-valid'), 'legacy row remains stored')
  await verify.close()
})

test('new stored trips with a calculation settings snapshot are recalculated and verified', async () => {
  const db = await openDB(DB_NAME, 1)
  const { calculateTrip } = await import('../../src/lib/calculator.ts')
  const source = { ...legacyTrip, id: 'snapshot-valid' }
  const settings = { ...DEFAULT_SETTINGS }
  const saved = { ...source, ...calculateTrip(source, settings), calculationSettings: settings }
  await db.put('trips', saved)
  await db.put('trips', { ...saved, id: 'snapshot-forged', netProfit: 1000 })
  await db.close()

  const trips = await getTrips()
  assert.ok(trips.some(trip => trip.id === 'snapshot-valid'))
  assert.ok(!trips.some(trip => trip.id === 'snapshot-forged'))
})

test('invalid direct writes and imports are rejected without replacing existing history', async () => {
  const db = await openDB(DB_NAME, 1)
  await db.put('trips', legacyTrip)
  await db.close()

  await assert.rejects(
    saveTrip({ ...legacyTrip, id: 'direct-invalid', netProfit: 999999 }),
    /بيانات الرحلة غير صالحة/
  )
  await assert.rejects(
    replaceAllData([{ ...legacyTrip, id: 'import-invalid', fare: Number.NaN }], DEFAULT_SETTINGS),
    /رحلة غير صالحة/
  )
  await assert.rejects(
    replaceAllData([legacyTrip], { ...DEFAULT_SETTINGS, fuelPrice: Number.NaN }),
    /ليست رقمًا صحيحًا/
  )

  const verify = await openDB(DB_NAME, 1)
  assert.ok(await verify.get('trips', 'legacy-valid'), 'failed imports must leave previous history untouched')
  assert.equal(await verify.get('trips', 'direct-invalid'), undefined)
  assert.equal(await verify.get('trips', 'import-invalid'), undefined)
  await verify.close()
})
