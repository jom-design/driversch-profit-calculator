import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateTrip } from '../src/lib/calculator.ts'
import { DEFAULT_SETTINGS, EMPTY_TRIP } from '../src/types.ts'

const calc = (patch = {}, settings = DEFAULT_SETTINGS) => calculateTrip({ ...EMPTY_TRIP, ...patch }, settings)
const closeTo = (actual, expected, tolerance = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance} of ${expected}`)

test('test helper is defined and callable', () => {
  assert.equal(typeof calc, 'function')
  assert.equal(calc().decision, 'accept')
})

test('reference case returns exact operating costs and ACCEPT', () => {
  const r = calc()
  assert.equal(r.isValid, true)
  assert.equal(r.totalKm, 22)
  closeTo(r.fuelCost, 48.95)
  closeTo(r.maintenanceCost, 55.00)
  closeTo(r.totalCost, 103.95)
  closeTo(r.netProfit, 61.05)
  closeTo(r.hourlyProfit, 91.58)
  closeTo(r.requiredFare, 153.95)
  closeTo(r.fareGap, -11.05)
  assert.equal(r.decision, 'accept')
})

test('classifies REVIEW when trip profit passes but hourly target fails', () => {
  const r = calc({ fare: 158.95, totalMinutes: 60 })
  assert.equal(r.netProfit, 55)
  assert.equal(r.hourlyProfit, 55)
  assert.equal(r.decision, 'review')
})

test('classifies REJECT below minimum trip profit', () => {
  const r = calc({ fare: 138.95 })
  assert.equal(r.netProfit, 35)
  assert.equal(r.decision, 'reject')
})

test('unknown fare mode never produces a final ACCEPT', () => {
  assert.equal(calc({ fareMode: 'unknown' }).decision, 'review')
})

test('rejects negative, non-finite and zero-duration inputs without NaN output', () => {
  for (const patch of [
    { pickupKm: -1 }, { fare: -1 }, { extraExpenses: -1 },
    { fare: Number.NaN }, { returnKm: Infinity }, { passengerKm: -Infinity },
    { fare: Number.MAX_VALUE }, { totalMinutes: 0 }, { totalMinutes: -1 }
  ]) {
    const r = calc(patch)
    assert.equal(r.isValid, false)
    assert.equal(r.decision, 'review')
    for (const key of ['totalKm','fuelCost','maintenanceCost','totalCost','netFare','netProfit','hourlyProfit','requiredFare','fareGap']) {
      assert.equal(Number.isFinite(r[key]), true, `${key} must be finite`)
    }
  }
})

test('accepts a valid 30-second trip and calculates a finite hourly profit', () => {
  const r = calc({ totalMinutes: 0.5 })
  assert.equal(r.isValid, true)
  assert.equal(r.hourlyProfit, 7326)
  assert.equal(r.decision, 'accept')
  for (const key of ['totalKm','fuelCost','maintenanceCost','totalCost','netFare','netProfit','hourlyProfit','requiredFare','fareGap']) {
    assert.equal(Number.isFinite(r[key]), true, `${key} must be finite`)
  }
})

test('invalidates zero, negative and subnormal durations without ACCEPT', () => {
  for (const duration of [0, -1, Number.MIN_VALUE]) {
    const r = calc({ totalMinutes: duration })
    assert.equal(r.isValid, false)
    assert.equal(r.decision, 'review')
    assert.ok(r.validationErrors.length > 0)
  }
})

test('invalidates a positive duration when hourly-profit arithmetic exceeds the safe currency range', () => {
  const r = calc({ totalMinutes: 1e-300 })
  assert.equal(r.isValid, false)
  assert.equal(r.decision, 'review')
  assert.ok(r.validationErrors.some(error => error.includes('النطاق العددي الآمن')))
})

test('minimum-profit and hourly-target boundaries are inclusive', () => {
  const settings = { ...DEFAULT_SETTINGS, minNetProfit: 50, hourlyTarget: 50 }
  const exactBoundary = calc({ fare: 153.95, totalMinutes: 60 }, settings)
  assert.equal(exactBoundary.netProfit, 50)
  assert.equal(exactBoundary.hourlyProfit, 50)
  assert.equal(exactBoundary.decision, 'accept')
  assert.equal(calc({ fare: 153.94, totalMinutes: 60 }, settings).decision, 'reject')
  assert.equal(calc({ fare: 153.95, totalMinutes: 60.01 }, settings).decision, 'review')
})

test('gross fare is converted consistently and required gross fare is returned', () => {
  const r = calc({ fare: 200, fareMode: 'gross', commissionRate: 20 })
  assert.equal(r.netFare, 160)
  assert.equal(r.requiredFare, 192.44)
})

test('100 percent commission is invalid because gross fare cannot meet a net target', () => {
  const r = calc({ fareMode: 'gross', commissionRate: 100 })
  assert.equal(r.isValid, false)
  assert.equal(r.decision, 'review')
})

test('invalid fare mode is rejected and cannot produce ACCEPT', () => {
  const r = calc({ fareMode: 'unexpected' })
  assert.equal(r.isValid, false)
  assert.equal(r.decision, 'review')
  assert.ok(r.validationErrors.length > 0)
})

test('missing required trip values and invalid settings are rejected', () => {
  const missing = calculateTrip({ ...EMPTY_TRIP, passengerKm: undefined, fare: undefined }, DEFAULT_SETTINGS)
  assert.equal(missing.isValid, false)
  assert.equal(missing.decision, 'review')
  const invalidSettings = [
    { ...DEFAULT_SETTINGS, fuelPrice: -1 },
    { ...DEFAULT_SETTINGS, consumptionPer100: 0 },
    { ...DEFAULT_SETTINGS, maintenancePerKm: Number.NaN },
    { ...DEFAULT_SETTINGS, minNetProfit: -1 },
    { ...DEFAULT_SETTINGS, hourlyTarget: Infinity }
  ].map(settings => calc({}, settings))
  for (const result of invalidSettings) {
    assert.equal(result.isValid, false)
    assert.equal(result.decision, 'review')
  }
  const missingSettings = calculateTrip(EMPTY_TRIP, null)
  assert.equal(missingSettings.isValid, false)
  assert.equal(missingSettings.decision, 'review')
  const missingTrip = calculateTrip(null, DEFAULT_SETTINGS)
  assert.equal(missingTrip.isValid, false)
  assert.equal(missingTrip.decision, 'review')
  for (const result of [missing, ...invalidSettings, missingSettings, missingTrip]) {
    assert.ok(result.validationErrors.length > 0)
    for (const value of Object.values(result).filter(value => typeof value === 'number')) {
      assert.equal(Number.isFinite(value), true)
    }
  }
})

test('calculates the required fare increase for a low offer', () => {
  const r = calc({ fare: 130 })
  assert.equal(r.netProfit, 26.05)
  assert.equal(r.requiredFare, 153.95)
  assert.equal(r.fareGap, 23.95)
  assert.equal(r.decision, 'reject')
})
