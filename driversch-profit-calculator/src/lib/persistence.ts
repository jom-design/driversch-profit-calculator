import { calculateTrip } from './calculator.ts'
import type { Calculation, SavedTrip, Settings } from '../types.ts'

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

const APPS = ['Uber', 'DiDi', 'inDrive', 'أخرى']
const FARE_MODES = ['net', 'gross', 'unknown']
const MIN_NORMAL_DURATION_MINUTES = 2.2250738585072014e-308

/**
 * Checks the original inputs of a trip, without settings. The same limits as calculateTrip apply, so a stored
 * record cannot carry an input the calculator would refuse. Used for records read back from storage.
 */
export function isTripInputValid(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const trip = value as Partial<SavedTrip>
  if (!APPS.includes(String(trip.app))) return false
  if (!FARE_MODES.includes(String(trip.fareMode))) return false
  const nonNegativeLimits: Array<[unknown, number]> = [
    [trip.fare, 1_000_000], [trip.pickupKm, 1_000], [trip.passengerKm, 1_000],
    [trip.returnKm, 1_000], [trip.extraExpenses, 1_000_000], [trip.commissionRate, 100],
  ]
  if (!nonNegativeLimits.every(([v, max]) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max)) return false
  if (trip.commissionRate !== undefined && trip.commissionRate >= 100) return false
  const minutes = trip.totalMinutes
  return typeof minutes === 'number' && Number.isFinite(minutes) &&
    minutes >= MIN_NORMAL_DURATION_MINUTES && minutes <= 24 * 60
}

/**
 * A record is shown in history only if its inputs are valid and its derived results are finite.
 * Records from builds before the isValid flag existed have no flag: they are accepted on input checks alone,
 * because excluding them would hide trips the driver saved. An explicit isValid: false is always excluded.
 */
export function isStoredTripSafe(value: unknown): value is SavedTrip {
  if (!value || typeof value !== 'object') return false
  const trip = value as Partial<SavedTrip>
  if (trip.isValid !== undefined && trip.isValid !== true) return false
  if (!isTripInputValid(trip)) return false
  if (typeof trip.id !== 'string' || !trip.id || typeof trip.createdAt !== 'string' || !Number.isFinite(Date.parse(trip.createdAt))) return false
  if (!['accept', 'review', 'reject'].includes(String(trip.decision))) return false
  return DERIVED_FIELDS.every(field => Number.isFinite(trip[field]))
}
