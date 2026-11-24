import type { Calculation, Settings, TripInput } from '../types'

const INVALID_REASON = 'بيانات الرحلة أو الإعدادات غير صالحة؛ راجع القيم المدخلة قبل الحساب.'

// Round monetary values to cents at each displayed cost boundary.
const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * Validate every source value before arithmetic. This is deliberately independent of UI
 * validation because calculations can also be fed by imports, OCR, notification parsing,
 * browser storage, and the native Android bridge.
 */
export function isSafeTripInput(input: TripInput, settings: Settings): boolean {
  if (!input || !settings || typeof input !== 'object' || typeof settings !== 'object') return false
  if (!['Uber', 'DiDi', 'inDrive', 'أخرى'].includes(input.app)) return false
  if (!['net', 'gross', 'unknown'].includes(input.fareMode)) return false
  if (typeof input.notes !== 'string') return false

  const inputNumbers = [
    input.fare, input.commissionRate, input.pickupKm, input.passengerKm,
    input.returnKm, input.totalMinutes, input.extraExpenses
  ]
  if (inputNumbers.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) return false
  if (input.commissionRate > 100) return false

  const settingNumbers = [
    settings.fuelPrice, settings.consumptionPer100, settings.maintenancePerKm,
    settings.minNetProfit, settings.hourlyTarget
  ]
  if (settingNumbers.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) return false
  if (!settings.commission || typeof settings.commission !== 'object' || Array.isArray(settings.commission)) return false
  for (const app of ['Uber', 'DiDi', 'inDrive', 'أخرى'] as const) {
    const rate = settings.commission[app]
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 100) return false
  }
  for (const value of [settings.defaultReturnKm, settings.defaultExtraExpenses]) {
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) return false
  }
  return true
}

/** A calculation may be reviewable, but only complete, finite offers can be saved as trips. */
export function isSavableTripInput(input: TripInput, settings: Settings): boolean {
  if (!isSafeTripInput(input, settings) || input.totalMinutes <= 0 || input.fareMode === 'unknown') return false
  if (input.fareMode === 'gross' && input.commissionRate >= 100) return false
  const result = calculateTrip(input, settings)
  return result.decisionReason !== INVALID_REASON &&
    [result.totalKm, result.fuelCost, result.maintenanceCost, result.totalCost, result.netFare,
      result.netProfit, result.hourlyProfit, result.requiredFare, result.fareGap]
      .every(value => Number.isFinite(value))
}

function invalidCalculation(): Calculation {
  return {
    totalKm: 0, fuelCost: 0, maintenanceCost: 0, totalCost: 0, netFare: 0,
    netProfit: 0, hourlyProfit: 0, requiredFare: 0, fareGap: 0,
    decision: 'review', decisionReason: INVALID_REASON
  }
}

export function calculateTrip(input: TripInput, settings: Settings): Calculation {
  if (!isSafeTripInput(input, settings)) return invalidCalculation()

  const totalKm = Math.max(0, input.pickupKm) + Math.max(0, input.passengerKm) + Math.max(0, input.returnKm)
  const fuelCost = money(totalKm * settings.consumptionPer100 * settings.fuelPrice / 100)
  const maintenanceCost = money(totalKm * settings.maintenancePerKm)
  const totalCost = money(fuelCost + maintenanceCost + Math.max(0, input.extraExpenses))
  const rate = input.fareMode === 'gross' ? Math.min(100, Math.max(0, input.commissionRate)) : 0
  const netFare = money(Math.max(0, input.fare) * (1 - rate / 100))
  const netProfit = money(netFare - totalCost)
  const hourlyProfit = input.totalMinutes > 0 ? money(netProfit * 60 / input.totalMinutes) : 0
  const targetByTrip = totalCost + settings.minNetProfit
  const targetByHour = input.totalMinutes > 0 ? totalCost + settings.hourlyTarget * input.totalMinutes / 60 : targetByTrip
  const requiredNetFare = money(Math.max(targetByTrip, targetByHour))
  const requiredFare = input.fareMode === 'gross' && rate < 100
    ? money(requiredNetFare / (1 - rate / 100))
    : requiredNetFare
  const fareGap = money(requiredFare - Math.max(0, input.fare))

  const numericResults = [totalKm, fuelCost, maintenanceCost, totalCost, netFare, netProfit, hourlyProfit, requiredFare, fareGap]
  if (numericResults.some(value => !Number.isFinite(value))) return invalidCalculation()

  let decision: Calculation['decision']
  let decisionReason: string
  if (input.fareMode === 'unknown') {
    decision = 'review'; decisionReason = 'أكد أولًا هل الأجرة صافية أم إجمالية قبل اعتماد قرار الربحية.'
  } else if (input.totalMinutes <= 0) {
    decision = 'review'; decisionReason = 'أدخل وقتًا صحيحًا للرحلة قبل اتخاذ القرار.'
  } else if (input.fareMode === 'gross' && rate >= 100) {
    decision = 'review'; decisionReason = 'لا يمكن حساب أجرة مطلوبة مع عمولة 100%؛ راجع نسبة العمولة.'
  } else if (netProfit < settings.minNetProfit) {
    decision = 'reject'; decisionReason = `صافي الربح أقل من الحد الأدنى ${settings.minNetProfit.toFixed(2)} ج.م.`
  } else if (hourlyProfit < settings.hourlyTarget) {
    decision = 'review'; decisionReason = `الربح إيجابي، لكن العائد بالساعة أقل من هدفك ${settings.hourlyTarget.toFixed(2)} ج.م.`
  } else {
    decision = 'accept'; decisionReason = 'الرحلة تحقق الحد الأدنى لصافي الربح وهدف الربح بالساعة.'
  }
  return { totalKm: money(totalKm), fuelCost, maintenanceCost, totalCost, netFare, netProfit, hourlyProfit, requiredFare, fareGap, decision, decisionReason }
}
