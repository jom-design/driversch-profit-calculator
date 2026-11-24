import type { Settings } from '../types.ts'
import { DEFAULT_SETTINGS } from '../types.ts'

const COMMISSION_APPS = ['Uber', 'DiDi', 'inDrive', 'أخرى'] as const

function sanitizeNonNegative(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

function sanitizeCommission(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : fallback
}

/**
 * Merges and validates persisted settings. Corrupt or unsupported values fall back to safe
 * defaults, while valid user values are preserved. This protects the calculator from damaged
 * browser storage and older app versions without silently treating malformed values as zero.
 */
export function mergeStoredSettings(stored: Partial<Settings> | undefined | null): Settings {
  const source: Partial<Settings> = stored && typeof stored === 'object' ? stored : {}
  const storedCommission: Partial<Settings['commission']> = source.commission && typeof source.commission === 'object' && !Array.isArray(source.commission)
    ? source.commission
    : {}
  const commission = { ...DEFAULT_SETTINGS.commission }
  for (const app of COMMISSION_APPS) {
    commission[app] = sanitizeCommission(storedCommission[app], DEFAULT_SETTINGS.commission[app])
  }

  return {
    fuelPrice: sanitizeNonNegative(source.fuelPrice, DEFAULT_SETTINGS.fuelPrice),
    consumptionPer100: sanitizeNonNegative(source.consumptionPer100, DEFAULT_SETTINGS.consumptionPer100),
    maintenancePerKm: sanitizeNonNegative(source.maintenancePerKm, DEFAULT_SETTINGS.maintenancePerKm),
    minNetProfit: sanitizeNonNegative(source.minNetProfit, DEFAULT_SETTINGS.minNetProfit),
    hourlyTarget: sanitizeNonNegative(source.hourlyTarget, DEFAULT_SETTINGS.hourlyTarget),
    commission,
    defaultReturnKm: sanitizeOptionalKm(source.defaultReturnKm),
    defaultExtraExpenses: sanitizeOptionalKm(source.defaultExtraExpenses)
  }
}

/** Keeps an optional default only when it is a finite, non-negative number; null means unset. */
export function sanitizeOptionalKm(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}
