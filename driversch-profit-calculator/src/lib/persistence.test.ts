import { describe, expect, it } from 'vitest'
import { calculateTrip } from './calculator'
import { isStoredTripSafe, prepareSavedTrip } from './persistence'
import { DEFAULT_SETTINGS, EMPTY_TRIP } from '../types'

const validRecord = () => ({
  ...EMPTY_TRIP,
  ...calculateTrip(EMPTY_TRIP, DEFAULT_SETTINGS),
  id: 'trip-test-1',
  createdAt: '2026-11-14T00:00:00.000Z'
})

describe('trip persistence validation', () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('refuses invalid duration %s before persistence', duration => {
    const forged = { ...validRecord(), totalMinutes: duration, isValid: true }
    expect(prepareSavedTrip(forged, DEFAULT_SETTINGS)).toBeNull()
  })

  it('refuses invalid records during backup restoration', () => {
    const forged = { ...validRecord(), totalMinutes: 0, isValid: true }
    expect(prepareSavedTrip(forged, DEFAULT_SETTINGS)).toBeNull()
  })

  it('recalculates and accepts a valid 30-second record', () => {
    const candidate = { ...validRecord(), totalMinutes: 0.5 }
    const prepared = prepareSavedTrip(candidate, DEFAULT_SETTINGS)
    expect(prepared).not.toBeNull()
    expect(prepared).toMatchObject({ totalMinutes: 0.5, isValid: true, decision: 'accept', hourlyProfit: 7326 })
    expect(isStoredTripSafe(prepared)).toBe(true)
  })

  it('does not expose invalid legacy records as safe history rows', () => {
    expect(isStoredTripSafe({ ...validRecord(), totalMinutes: -1 })).toBe(false)
    expect(isStoredTripSafe({ ...validRecord(), isValid: false })).toBe(false)
  })
})
