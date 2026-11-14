import { calculateTrip } from './calculator'
import type { Calculation, SavedTrip, Settings } from '../types'

const DERIVED_FIELDS: Array<keyof Calculation> = [
  'totalKm', 'fuelCost', 'maintenanceCost', 'totalCost', 'netFare',
  'netProfit', 'hourlyProfit', 'requiredFare', 'fareGap'
]

export function prepareSavedTrip(value: unknown, settings: Settings): SavedTrip | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<SavedTrip>
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) return null
  if (typeof candidate.createdAt !== 'string' || !Number.isFinite(Date.parse(candidate.createdAt))) return null

  const calculation = calculateTrip(candidate as SavedTrip, settings)
  if (!calculation.isValid) return null

  return { ...(candidate as SavedTrip), ...calculation }
}

export function isStoredTripSafe(value: unknown): value is SavedTrip {
  if (!value || typeof value !== 'object') return false
  const trip = value as Partial<SavedTrip>
  if (trip.isValid !== true || !Number.isFinite(trip.totalMinutes) || (trip.totalMinutes ?? 0) <= 0) return false
  if (!['accept', 'review', 'reject'].includes(String(trip.decision))) return false
  if (typeof trip.id !== 'string' || !trip.id || typeof trip.createdAt !== 'string' || !Number.isFinite(Date.parse(trip.createdAt))) return false
  return DERIVED_FIELDS.every(field => Number.isFinite(trip[field]))
}
