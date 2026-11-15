import test from 'node:test'
import assert from 'node:assert/strict'
import { isStoredTripSafe, isTripInputValid } from '../src/lib/persistence.ts'
import { calculateTrip } from '../src/lib/calculator.ts'
import { DEFAULT_SETTINGS, EMPTY_TRIP } from '../src/types.ts'

// Synthetic records. "Legacy" means saved by the original build, which had no isValid flag.
const record = (patch = {}) => ({
  ...EMPTY_TRIP,
  ...calculateTrip(EMPTY_TRIP, DEFAULT_SETTINGS),
  id: 'stored-1',
  createdAt: '2026-11-14T00:00:00.000Z',
  ...patch,
})
const legacy = (patch = {}) => {
  const { isValid, validationErrors, ...rest } = record(patch)
  return rest
}

test('a current valid record is shown', () => {
  assert.equal(isStoredTripSafe(record()), true)
})

test('a legacy record without the isValid flag is shown, so saved history is not hidden', () => {
  assert.equal(isStoredTripSafe(legacy()), true)
})

test('an explicit isValid: false is never shown', () => {
  assert.equal(isStoredTripSafe(record({ isValid: false })), false)
})

test('a stored record with a non-numeric fare is refused even when its derived values look finite', () => {
  assert.equal(isStoredTripSafe(record({ fare: 'abc' })), false)
  assert.equal(isStoredTripSafe(legacy({ fare: 'abc' })), false)
})

test('stored inputs outside calculator limits are refused', () => {
  assert.equal(isStoredTripSafe(record({ fare: 1_000_001 })), false)
  assert.equal(isStoredTripSafe(record({ pickupKm: 1_001 })), false)
  assert.equal(isStoredTripSafe(record({ extraExpenses: -1 })), false)
  assert.equal(isStoredTripSafe(record({ commissionRate: 100 })), false)
})

test('an unknown app or fare mode in a stored record is refused', () => {
  assert.equal(isStoredTripSafe(record({ app: 'Careem' })), false)
  assert.equal(isStoredTripSafe(record({ fareMode: 'bogus' })), false)
})

test('duration boundaries: 30 seconds is kept, zero, negative, subnormal and over 24 hours are refused', () => {
  assert.equal(isStoredTripSafe(record({ totalMinutes: 0.5 })), true)
  assert.equal(isStoredTripSafe(record({ totalMinutes: 0 })), false)
  assert.equal(isStoredTripSafe(record({ totalMinutes: -1 })), false)
  assert.equal(isStoredTripSafe(record({ totalMinutes: Number.MIN_VALUE })), false)
  assert.equal(isStoredTripSafe(record({ totalMinutes: 24 * 60 + 1 })), false)
})

test('non-finite derived results are refused', () => {
  assert.equal(isStoredTripSafe(record({ netProfit: Number.NaN })), false)
  assert.equal(isStoredTripSafe(record({ hourlyProfit: Number.POSITIVE_INFINITY })), false)
})

test('an unknown decision is refused', () => {
  assert.equal(isStoredTripSafe(record({ decision: 'accept-all' })), false)
})

test('isTripInputValid accepts a zero pickup distance and a zero extra expense', () => {
  assert.equal(isTripInputValid(record({ pickupKm: 0, extraExpenses: 0 })), true)
})

test('isTripInputValid rejects non-objects', () => {
  assert.equal(isTripInputValid(null), false)
  assert.equal(isTripInputValid('record'), false)
})
