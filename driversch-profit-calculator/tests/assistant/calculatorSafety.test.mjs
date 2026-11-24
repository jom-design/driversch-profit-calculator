import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateTrip, isSafeTripInput, isSavableTripInput } from '../../src/lib/calculator.ts'
import { DEFAULT_SETTINGS, EMPTY_TRIP } from '../../src/types.ts'

const settings = structuredClone(DEFAULT_SETTINGS)
const validTrip = { ...EMPTY_TRIP, fare: 165, fareMode: 'net', totalMinutes: 40 }

test('the normal reference trip remains calculable and savable', () => {
  const result = calculateTrip(validTrip, settings)
  assert.equal(result.totalCost, 103.95)
  assert.equal(result.netProfit, 61.05)
  assert.equal(result.hourlyProfit, 91.58)
  assert.equal(result.decision, 'accept')
  assert.equal(isSavableTripInput(validTrip, settings), true)
})

test('short positive durations remain valid, including 30, 59 and 60 seconds', () => {
  for (const seconds of [30, 59, 60]) {
    const trip = { ...validTrip, totalMinutes: seconds / 60 }
    assert.equal(isSafeTripInput(trip, settings), true)
    assert.equal(isSavableTripInput(trip, settings), true)
    assert.ok(Number.isFinite(calculateTrip(trip, settings).hourlyProfit))
  }
})

test('NaN, infinities, negatives and commission rates above 100 are refused safely', () => {
  for (const patch of [
    { fare: Number.NaN }, { fare: Number.POSITIVE_INFINITY }, { fare: Number.NEGATIVE_INFINITY },
    { pickupKm: -1 }, { passengerKm: Number.NaN }, { returnKm: Number.POSITIVE_INFINITY },
    { extraExpenses: -0.01 }, { totalMinutes: Number.NaN }, { commissionRate: 100.01 }
  ]) {
    const trip = { ...validTrip, ...patch }
    assert.equal(isSafeTripInput(trip, settings), false)
    const result = calculateTrip(trip, settings)
    assert.equal(result.decision, 'review')
    assert.ok([result.totalCost, result.netFare, result.netProfit, result.hourlyProfit, result.requiredFare, result.fareGap].every(Number.isFinite))
    assert.equal(isSavableTripInput(trip, settings), false)
  }
})

test('malformed or non-finite settings never produce NaN or Infinity', () => {
  for (const broken of [
    { ...settings, fuelPrice: Number.NaN },
    { ...settings, consumptionPer100: Number.POSITIVE_INFINITY },
    { ...settings, maintenancePerKm: -1 },
    { ...settings, hourlyTarget: Number.NaN },
    { ...settings, commission: null },
    { ...settings, commission: { ...settings.commission, Uber: 101 } },
    { ...settings, defaultReturnKm: Number.NaN }
  ]) {
    assert.equal(isSafeTripInput(validTrip, broken), false)
    const result = calculateTrip(validTrip, broken)
    assert.equal(result.decision, 'review')
    assert.ok([result.totalCost, result.netProfit, result.hourlyProfit].every(Number.isFinite))
  }
})

test('unknown fare mode, zero duration and 100 percent gross commission cannot be saved', () => {
  assert.equal(isSavableTripInput({ ...validTrip, fareMode: 'unknown' }, settings), false)
  assert.equal(isSavableTripInput({ ...validTrip, totalMinutes: 0 }, settings), false)
  assert.equal(isSavableTripInput({ ...validTrip, fareMode: 'gross', commissionRate: 100 }, settings), false)
})

test('overflowing intermediate arithmetic is converted to a review result, never leaked', () => {
  const huge = { ...validTrip, fare: Number.MAX_VALUE, pickupKm: Number.MAX_VALUE, passengerKm: 1 }
  const result = calculateTrip(huge, settings)
  assert.equal(result.decision, 'review')
  assert.ok([result.totalKm, result.totalCost, result.netFare, result.netProfit, result.hourlyProfit, result.requiredFare, result.fareGap].every(Number.isFinite))
  assert.equal(isSavableTripInput(huge, settings), false)
})
