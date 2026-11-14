import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateTrip } from '../src/lib/calculator.ts'
import { DEFAULT_SETTINGS, EMPTY_TRIP } from '../src/types.ts'

const calc = (patch = {}, settings = DEFAULT_SETTINGS) => calculateTrip({ ...EMPTY_TRIP, ...patch }, settings)

test('reference case returns exact operating costs and ACCEPT', () => {
  const r = calc()
  assert.equal(r.isValid, true)
  assert.equal(r.totalKm, 22)
  assert.equal(r.fuelCost, 48.95)
  assert.equal(r.maintenanceCost, 55)
  assert.equal(r.totalCost, 103.95)
  assert.equal(r.netProfit, 61.05)
  assert.equal(r.hourlyProfit, 91.58)
  assert.equal(r.requiredFare, 153.95)
  assert.equal(r.fareGap, -11.05)
  assert.equal(r.decision, 'accept')
})

test('classifies REVIEW when trip profit passes but hourly target fails', () => {
  const r = call({ fare: 158.95, totalMinutes: 60 })
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
  assert.equal(call({ fareMode: 'unknown' }).decision, 'review')
})

test('rejects negative, non-finite and zero-duration inputs without NaN output', () => {
  for (const patch of [{ pickupKm: -1 }, { fare: Number.NaN }, { returnKm: Infinity }, { fare: Number.MAX_VALUE }, { totalMinutes: 0 }]) {
    const r = calc(patch)
    assert.equal(r.isValid, false)
    assert.equal(r.decision, 'review')
    for (const key of ['totalKm','fuelCost','maintenanceCost','totalCost','netFare','netProfit','hourlyProfit','requiredFare','fareGap']) {
      assert.equal(Number.isFinite(r[key]), true, `${key} must be finite`)
    }
  }
})

test('gross fare is converted consistently and required gross fare is returned', () => {
  const r = calc({ fare: 200, fareMode: 'gross', commissionRate: 20 })
  assert.equal(r.netFare, 160)
  assert.equal(r.requiredFare, 192.44)
})

test('100 percent commission is invalid because gross fare cannot meet a net target', () => {
  const r = call({ fareMode: 'gross', commissionRate: 100 })
  assert.equal(r.isValid, false)
  assert.equal(r.decision, 'review')
})

test('calculates the required fare increase for a low offer', () => {
  const r = calc({ fare: 130 })
  assert.equal(r.netProfit, 26.05)
  assert.equal(r.requiredFare, 153.95)
  assert.equal(r.fareGap, 23.95)
  assert.equal(r.decision, 'reject')
})
