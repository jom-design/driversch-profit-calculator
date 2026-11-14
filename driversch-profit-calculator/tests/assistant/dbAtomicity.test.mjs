import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, EMPTY_TRIP } from '../../src/types.ts'

const { getSettings, getTrips, replaceAllData } = await import('../../src/lib/db.ts')

const validTrip = {
  ...EMPTY_TRIP,
  id: 'existing-trip',
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

test('trip and settings replacement commits atomically and rolls back on a failed trip write', async () => {
  const oldSettings = { ...DEFAULT_SETTINGS, fuelPrice: 19.75 }
  await replaceAllData([validTrip], oldSettings)

  await assert.rejects(() => replaceAllData([{ ...validTrip, id: undefined }], {
    ...DEFAULT_SETTINGS,
    fuelPrice: 31.5
  }))

  assert.deepEqual(await getTrips(), [validTrip])
  assert.deepEqual(await getSettings(), oldSettings)
})
