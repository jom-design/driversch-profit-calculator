import { describe, expect, it } from 'vitest'
import { calculateTrip } from './calculator'
import { DEFAULT_SETTINGS, EMPTY_TRIP } from '../types'

const calculate = (patch: Partial<typeof EMPTY_TRIP> = {}) =>
  calculateTrip({ ...EMPTY_TRIP, ...patch }, DEFAULT_SETTINGS)

describe('calculateTrip', () => {
  it('matches the 22 km reference case', () => {
    const result = calculate()
    expect(result).toMatchObject({
      totalKm: 22, fuelCost: 48.95, maintenanceCost: 55, totalCost: 103.95,
      netProfit: 61.05, hourlyProfit: 91.58, requiredFare: 153.95, decision: 'accept'
    })
  })
  it('classifies ACCEPT, REVIEW and REJECT correctly', () => {
    expect(calculate().decision).toBe('accept')
    expect(calculate({ fare: 158.95, totalMinutes: 60 }).decision).toBe('review')
    expect(calculate({ fare: 138.95 }).decision).toBe('reject')
  })
  it('computes the required fare increase for the 130 EGP offer', () => {
    expect(calculate({ fare: 130 })).toMatchObject({ netProfit: 26.05, requiredFare: 153.95, fareGap: 23.95, decision: 'reject' })
  })
  it.each([
    { pickupKm: -1 }, { fare: Number.NaN }, { returnKm: Number.POSITIVE_INFINITY }, { fare: Number.MAX_VALUE }, { totalMinutes: 0 }
  ])('does not issue ACCEPT for invalid input %#', patch => {
    const result = calculate(patch)
    expect(result.decision).toBe('review')
    expect(result.isValid).toBe(false)
    expect(Object.values(result).filter(v => typeof v === 'number').every(Number.isFinite)).toBe(true)
  })
  it('does not issue ACCEPT when fare mode is unknown', () => {
    expect(calculate({ fareMode: 'unknown' }).decision).toBe('review')
  })
  it('converts gross fare and calculates required gross fare', () => {
    const result = calculate({ fare: 200, fareMode: 'gross', commissionRate: 20 })
    expect(result.netFare).toBe(160)
    expect(result.requiredFare).toBe(192.44)
  })
})
