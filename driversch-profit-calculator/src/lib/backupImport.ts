import { parseNumericDraft } from './numericInput.ts'
import { calculateTrip } from './calculator.ts'
import { DEFAULT_SETTINGS } from '../types.ts'
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
  if (raw.commission !== undefined && !isRecord(raw.commission)) return { ok: false, reason: 'خريطة عمولات التطبيقات في النسخة غير صالحة' }
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
  const normalized = trip as unknown as SavedTrip
  if (normalized.commissionRate > 100) return null
  const nonNegativeResults: (keyof SavedTrip)[] = ['totalKm', 'fuelCost', 'maintenanceCost', 'totalCost', 'netFare', 'requiredFare']
  if (nonNegativeResults.some(key => (normalized[key] as number) < 0)) return null

  // New records carry the exact cost assumptions used at save time. Legacy records do not,
  // so validate arithmetic invariants without reinterpreting them using today's changed settings.
  if (raw.calculationSettings !== undefined) {
    const snapshot = normalizeSettings(raw.calculationSettings, DEFAULT_SETTINGS)
    if (!snapshot.ok) return null
    normalized.calculationSettings = snapshot.value
    const calculated = calculateTrip(normalized, snapshot.value)
    for (const key of TRIP_RESULT_KEYS) {
      const actual = normalized[key] as number
      const expected = calculated[key]
      if (Math.abs(actual - expected) > 0.011) return null
    }
    if (normalized.decision !== calculated.decision) return null
  } else {
    const close = (actual: number, expected: number) => Math.abs(actual - expected) <= 0.011
    const expectedKm = normalized.pickupKm + normalized.passengerKm + normalized.returnKm
    const rate = normalized.fareMode === 'gross' ? Math.min(100, normalized.commissionRate) : 0
    const expectedNetFare = normalized.fare * (1 - rate / 100)
    const expectedTotalCost = normalized.fuelCost + normalized.maintenanceCost + normalized.extraExpenses
    const expectedHourly = normalized.totalMinutes > 0 ? normalized.netProfit * 60 / normalized.totalMinutes : 0
    if (!close(normalized.totalKm, expectedKm) ||
        !close(normalized.netFare, expectedNetFare) ||
        !close(normalized.totalCost, expectedTotalCost) ||
        !close(normalized.netProfit, normalized.netFare - normalized.totalCost) ||
        !close(normalized.hourlyProfit, expectedHourly) ||
        !close(normalized.fareGap, normalized.requiredFare - normalized.fare)) return null
  }
  return normalized
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
  for (let index = 0; index < data.trips.length; index += 1) {
    const trip = normalizeTrip(data.trips[index])
    if (!trip) return { ok: false, reason: `بيانات الرحلة رقم ${index + 1} تالفة أو نتائجها المالية لا تطابق مدخلاتها؛ لم يتم استيراد أي بيانات.` }
    trips.push(trip)
  }
  return { ok: true, value: { settings: settings.value, trips, skippedTrips: 0 } }
}
