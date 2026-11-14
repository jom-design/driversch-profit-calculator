import { parseNumericDraft } from './numericInput.ts'
import type { AppName, Decision, FareMode, SavedTrip, Settings } from '../types.ts'

/**
 * Validates and normalizes backup data before it is stored. Numbers may come as JSON numbers
 * or as text in any digit system ("٢٢٫٥", "22.5"). Anything that cannot be read as a finite
 * number is rejected, so a broken backup never turns into NaN inside the calculator.
 */

export type ImportResult<T> = { ok: true; value: T } | { ok: false; reason: string }

const SETTING_KEYS = ['fuelPrice', 'consumptionPer100', 'maintenancePerKm', 'minNetProfit', 'hourlyTarget'] as const
// Every platform keeps its own commission. A backup from before Uber had a field simply has no 'Uber' key,
// and the defaults supply 0 for it. Nothing is copied from 'أخرى' into 'Uber'.
const COMMISSION_KEYS = ['Uber', 'inDrive', 'DiDi', 'أخرى'] as const
// Inputs the driver types. They can never be negative.
const TRIP_INPUT_KEYS = ['fare', 'commissionRate', 'pickupKm', 'passengerKm', 'returnKm', 'totalMinutes', 'extraExpenses'] as const
// Results can be negative (a losing trip, or a fare below the required fare).
const TRIP_RESULT_KEYS = ['totalKm', 'fuelCost', 'maintenanceCost', 'totalCost', 'netFare', 'netProfit', 'hourlyProfit', 'requiredFare', 'fareGap'] as const
const APPS: AppName[] = ['Uber', 'DiDi', 'inDrive', 'أخرى']
const FARE_MODES: FareMode[] = ['net', 'gross', 'unknown']
const DECISIONS: Decision[] = ['accept', 'review', 'reject']

/** Reads a JSON number or numeric text in any digit system. Returns null when it is not a finite number. */
export function readBackupNumber(value: unknown, { allowNegative }: { allowNegative: boolean }): number | null {
  let n: number | null = null
  if (typeof value === 'number') n = Number.isFinite(value) ? value : null
  else if (typeof value === 'string') {
    const parsed = parseNumericDraft(value)
    n = parsed.kind === 'value' ? parsed.value : null
  }
  if (n === null) return null
  return !allowNegative && n < 0 ? null : n
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeSettings(raw: unknown, defaults: Settings): ImportResult<Settings> {
  if (!isRecord(raw)) return { ok: false, reason: 'إعدادات النسخة غير صالحة' }
  const next: Settings = { ...defaults, commission: { ...defaults.commission } }
  for (const key of SETTING_KEYS) {
    if (raw[key] === undefined) continue
    const value = readBackupNumber(raw[key], { allowNegative: false })
    if (value === null) return { ok: false, reason: `القيمة ${key} في الإعدادات ليست رقمًا صحيحًا` }
    next[key] = value
  }
  if (isRecord(raw.commission)) {
    for (const app of COMMISSION_KEYS) {
      if (raw.commission[app] === undefined) continue
      const value = readBackupNumber(raw.commission[app], { allowNegative: false })
      if (value === null || value > 100) return { ok: false, reason: `عمولة ${app} في الإعدادات ليست نسبة صحيحة من 0 إلى 100` }
      next.commission[app] = value
    }
  }
  return { ok: true, value: next }
}

/** Returns a cleaned trip, or null when the record is too broken to keep. */
export function normalizeTrip(raw: unknown): SavedTrip | null {
  if (!isRecord(raw)) return null
  if (typeof raw.id !== 'string' || raw.id.length === 0) return null
  if (typeof raw.createdAt !== 'string' || Number.isNaN(Date.parse(raw.createdAt))) return null
  if (!APPS.includes(raw.app as AppName)) return null
  if (!FARE_MODES.includes(raw.fareMode as FareMode)) return null
  if (!DECISIONS.includes(raw.decision as Decision)) return null
  const trip: Record<string, unknown> = { ...raw, notes: typeof raw.notes === 'string' ? raw.notes : '' }
  for (const key of TRIP_INPUT_KEYS) {
    const value = readBackupNumber(raw[key], { allowNegative: false })
    if (value === null) return null
    trip[key] = value
  }
  for (const key of TRIP_RESULT_KEYS) {
    const value = readBackupNumber(raw[key], { allowNegative: true })
    if (value === null) return null
    trip[key] = value
  }
  return trip as unknown as SavedTrip
}

export interface NormalizedBackup {
  settings: Settings
  trips: SavedTrip[]
  skippedTrips: number
}

export function normalizeBackup(data: unknown, defaults: Settings): ImportResult<NormalizedBackup> {
  if (!isRecord(data) || data.schemaVersion !== 1 || !Array.isArray(data.trips) || data.settings === undefined) {
    return { ok: false, reason: 'ملف النسخة الاحتياطية غير متوافق' }
  }
  const settings = normalizeSettings(data.settings, defaults)
  if (!settings.ok) return settings
  const trips: SavedTrip[] = []
  let skippedTrips = 0
  for (const entry of data.trips) {
    const trip = normalizeTrip(entry)
    if (trip) trips.push(trip)
    else skippedTrips += 1
  }
  return { ok: true, value: { settings: settings.value, trips, skippedTrips } }
}
