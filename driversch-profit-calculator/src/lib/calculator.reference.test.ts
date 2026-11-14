import { describe, expect, it } from 'vitest'
import { calculateTrip } from './calculator'
import { DEFAULT_SETTINGS, EMPTY_TRIP } from '../types'

// Shared reference calculation, now included in the actual Vitest suite.
export function verifyReferenceCase() {
  const result = calculateTrip(EMPTY_TRIP, DEFAULT_SETTINGS)
  const expected = {
    fuelCost: 48.95,
    maintenanceCost: 55,
    totalCost: 103.95,
    netProfit: 61.05,
    hourlyProfit: 91.58,
    requiredFare: 153.95,
    decision: 'accept'
  }
  const actual = {
    fuelCost: result.fuelCost,
    maintenanceCost: result.maintenanceCost,
    totalCost: result.totalCost,
    netProfit: result.netProfit,
    hourlyProfit: Math.round(result.hourlyProfit * 100) / 100,
    requiredFare: result.requiredFare,
    decision: result.decision
  }
  for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
    if (actual[key] !== expected[key]) throw new Error(`Reference test failed at ${key}: ${actual[key]} !== ${expected[key]}`)
  }
  return actual
}

describe('calculator reference case', () => {
  it('matches the documented reference values', () => {
    expect(verifyReferenceCase()).toEqual({
      fuelCost: 48.95,
      maintenanceCost: 55,
      totalCost: 103.95,
      netProfit: 61.05,
      hourlyProfit: 91.58,
      requiredFare: 153.95,
      decision: 'accept'
    })
  })
})
