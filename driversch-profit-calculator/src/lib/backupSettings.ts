import type { Settings } from '../types.ts'

export type SettingsCheck = { ok: true; value: Settings } | { ok: false; reason: string }

/**
 * Limits mirror calculateTrip's validation, so a backup cannot store settings the calculator would refuse.
 * `exclusiveMin` marks values that must be strictly greater than zero.
 */
const NUMERIC_LIMITS = {
  fuelPrice: { min: 0, max: 1_000, exclusiveMin: true },
  consumptionPer100: { min: 0, max: 100, exclusiveMin: true },
  maintenancePerKm: { min: 0, max: 1_000, exclusiveMin: false },
  minNetProfit: { min: 0, max: 1_000_000, exclusiveMin: false },
  hourlyTarget: { min: 0, max: 1_000_000, exclusiveMin: false },
} as const

const COMMISSION_KEYS = ['inDrive', 'DiDi', 'أخرى'] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Validates the complete settings object from a backup. JSON numbers only: text is refused, not parsed,
 * so nothing is silently converted. Unknown keys are dropped, and no value is replaced by a default.
 */
export function validateBackupSettings(raw: unknown): SettingsCheck {
  if (!isRecord(raw)) return { ok: false, reason: 'إعدادات النسخة الاحتياطية غير صالحة.' }
  const numbers: Partial<Record<keyof typeof NUMERIC_LIMITS, number>> = {}
  for (const key of Object.keys(NUMERIC_LIMITS) as Array<keyof typeof NUMERIC_LIMITS>) {
    const value = raw[key]
    const rule = NUMERIC_LIMITS[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return { ok: false, reason: `الإعداد ${key} في النسخة ليس رقمًا صالحًا.` }
    }
    const belowMin = rule.exclusiveMin ? value <= rule.min : value < rule.min
    if (belowMin || value > rule.max) {
      return { ok: false, reason: `الإعداد ${key} في النسخة خارج النطاق المسموح.` }
    }
    numbers[key] = value
  }
  if (!isRecord(raw.commission)) return { ok: false, reason: 'خريطة العمولات في النسخة غير صالحة.' }
  const commission = {} as Settings['commission']
  for (const app of COMMISSION_KEYS) {
    const rate = raw.commission[app]
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate >= 100) {
      return { ok: false, reason: `عمولة ${app} في النسخة يجب أن تكون نسبة من 0 إلى أقل من 100.` }
    }
    commission[app] = rate
  }
  return {
    ok: true,
    value: {
      fuelPrice: numbers.fuelPrice!,
      consumptionPer100: numbers.consumptionPer100!,
      maintenancePerKm: numbers.maintenancePerKm!,
      minNetProfit: numbers.minNetProfit!,
      hourlyTarget: numbers.hourlyTarget!,
      commission,
    },
  }
}
