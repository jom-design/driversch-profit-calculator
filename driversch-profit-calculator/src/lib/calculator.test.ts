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
  it('rejects an unsupported fare mode', () => {
    const result = calculate({ fareMode: 'unexpected' as never })
    expect(result.isValid).toBe(false)
    expect(result.validationErrors.length).toBeGreaterThan(0)
    expect(result.decision).toBe('review')
  })
  it('rejects missing trip data and invalid settings without non-finite outputs', () => {
    const missingTrip = calculateTrip({ ...EMPTY_TRIP, passengerKm: undefined } as never, DEFAULT_SETTINGS)
    const invalidSettings = calculateTrip(EMPTY_TRIP, { ...DEFAULT_SETTINGS, fuelPrice: -1 })
    for (const result of [missingTrip, invalidSettings]) {
      expect(result.isValid).toBe(false)
      expect(result.validationErrors.length).toBeGreaterThan(0)
      expect(result.decision).toBe('review')
      expect(Object.values(result).filter(value => typeof value === 'number').every(Number.isFinite)).toBe(true)
    }
  })
  it('rejects sub-minute durations without non-finite calculated values', () => {
    for (const duration of [0, 0.5, Number.MIN_VALUE]) {
      const result = calculate({ totalMinutes: duration })
      expect(result.isValid).toBe(false)
      expect(result.decision).toBe('review')
      expect(result.validationErrors.length).toBeGreaterThan(0)
      expect(Object.values(result).filter(value => typeof value === 'number').every(Number.isFinite)).toBe(true)
    }
  })
  it('treats exact minimum-profit and hourly-target boundaries as inclusive', () => {
    const settings = { ...DEFAULT_SETTINGS, minNetProfit: 50, hourlyTarget: 50 }
    expect(calculateTrip({ ...EMPTY_TRIP, fare: 153.95, totalMinutes: 60 }, settings).decision).toBe('accept')
    expect(calculateTrip({ ...EMPTY_TRIP, fare: 153.94, totalMinutes: 60 }, settings).decision).toBe('reject')
    expect(calculateTrip({ ...EMPTY_TRIP, fare: 153.95, totalMinutes: 60.01 }, settings).decision).toBe('review')
  })
  it('converts gross fare and calculates required gross fare', () => {
    const result = calculate({ fare: 200, fareMode: 'gross', commissionRate: 20 })
    expect(result.netFare).toBe(160)
    expect(result.requiredFare).toBe(192.44)
  })
})
