import { calculateTrip } from './calculator.ts'
import type { Calculation, CalcSettings, HistoryIntegrity, HistoryTrip, SavedTrip, Settings, SettingsSnapshot } from '../types.ts'

// The numeric results of a calculation. Text fields such as decisionReason are not part of this list.
const DERIVED_FIELDS = [
  'totalKm', 'fuelCost', 'maintenanceCost', 'totalCost', 'netFare',
  'netProfit', 'hourlyProfit', 'requiredFare', 'fareGap'
] as const satisfies ReadonlyArray<keyof Calculation>
type DerivedField = typeof DERIVED_FIELDS[number]
const APPS = ['Uber', 'DiDi', 'inDrive', 'أخرى']
const FARE_MODES = ['net', 'gross', 'unknown']
const MIN_NORMAL_DURATION_MINUTES = 2.2250738585072014e-308
const MAX_CALCULABLE_MINUTES = 24 * 60
// Tolerance for comparing a recalculated result with the stored one (money is kept to the cent).
const MATCH_TOLERANCE = 0.01

/** The settings in effect for a trip, copied so the trip keeps them even after settings change. */
export function snapshotOf(settings: CalcSettings | Settings): SettingsSnapshot {
  return {
    fuelPrice: settings.fuelPrice,
    consumptionPer100: settings.consumptionPer100,
    maintenancePerKm: settings.maintenancePerKm,
    minNetProfit: settings.minNetProfit,
    hourlyTarget: settings.hourlyTarget
  }
}

/** Calculates and validates a NEW trip. Refuses anything the calculator refuses, and stores the settings used. */
export function prepareSavedTrip(value: unknown, settings: Settings): SavedTrip | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<SavedTrip>
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) return null
  if (typeof candidate.createdAt !== 'string' || !Number.isFinite(Date.parse(candidate.createdAt))) return null

  const calculation = calculateTrip(candidate as SavedTrip, settings)
  if (!calculation.isValid) return null

  return { ...(candidate as SavedTrip), ...calculation, settingsSnapshot: snapshotOf(settings) }
}

/**
 * Input checks for a stored trip, without settings. Durations of zero or above the calculator's range are
 * still accepted here: such records are historical and are shown with a status, not hidden. Negative,
 * non-finite and out-of-limit values are refused.
 */
export function isTripInputValid(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const trip = value as Partial<SavedTrip>
  if (!APPS.includes(String(trip.app))) return false
  if (!FARE_MODES.includes(String(trip.fareMode))) return false
  const limits: Array<[unknown, number]> = [
    [trip.fare, 1_000_000], [trip.pickupKm, 1_000], [trip.passengerKm, 1_000],
    [trip.returnKm, 1_000], [trip.extraExpenses, 1_000_000], [trip.commissionRate, 100],
  ]
  if (!limits.every(([v, max]) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max)) return false
  if (trip.commissionRate !== undefined && trip.commissionRate >= 100) return false
  const minutes = trip.totalMinutes
  return typeof minutes === 'number' && Number.isFinite(minutes) && minutes >= 0
}

/**
 * A stored record can be read and shown when its structure is intact, its inputs pass isTripInputValid,
 * and its recorded results are finite. An explicit isValid: false is never readable.
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

/** Whether the duration alone allows the calculator to produce results for this trip. */
function durationCalculable(minutes: number): boolean {
  return minutes >= MIN_NORMAL_DURATION_MINUTES && minutes <= MAX_CALCULABLE_MINUTES
}

/**
 * Decides how far a stored record can be trusted. The record's own snapshot is used, never the current settings.
 * Only a record with a usable snapshot can be verified; the rest are shown as recorded.
 */
export function assessStoredTrip(trip: SavedTrip): HistoryIntegrity {
  if (!durationCalculable(trip.totalMinutes)) return 'not-recalculable'
  const snapshot = trip.settingsSnapshot
  if (!snapshot) return 'legacy-unverified'
  const recalculated = calculateTrip(trip, snapshot)
  // A malformed snapshot cannot verify anything, so the record is treated as legacy.
  if (!recalculated.isValid) return 'legacy-unverified'
  const matches = DERIVED_FIELDS.every((field: DerivedField) => Math.abs(recalculated[field] - trip[field]) <= MATCH_TOLERANCE) &&
    recalculated.decision === trip.decision
  return matches ? 'verified' : 'mismatch'
}

/** A readable stored record with its integrity status. Null when the record cannot be read at all. */
export function readStoredTrip(value: unknown): HistoryTrip | null {
  if (!isStoredTripSafe(value)) return null
  return { ...value, integrity: assessStoredTrip(value) }
}

/**
 * Prepares a backup record for storage. Records are kept exactly as recorded: a backup's settings are never
 * applied to trips that were saved with other settings. The derived integrity status is not stored.
 */
export function prepareImportedTrip(value: unknown): SavedTrip | null {
  if (!isStoredTripSafe(value)) return null
  const { integrity, ...record } = value as SavedTrip & { integrity?: unknown }
  return record as SavedTrip
}
