import type { Calculation, Settings, TripInput } from '../types'

// Monetary rounding is centralized so every consumer sees the same result.
const money = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100
const finite = (value: number): boolean => Number.isFinite(value)

function validate(input: TripInput, settings: Settings): string[] {
  const errors: string[] = []
  if (!input || typeof input !== 'object') errors.push('بيانات الرحلة غير متاحة؛ راجع الإدخال.')
  if (!settings || typeof settings !== 'object') errors.push('الإعدادات غير متاحة؛ راجع الإعدادات.')
  input = input && typeof input === 'object' ? input : {} as TripInput
  settings = settings && typeof settings === 'object' ? settings : {} as Settings
  const fields: Array<[string, number]> = [
    ['الأجرة', input.fare],
    ['مسافة الوصول', input.pickupKm],
    ['مسافة الراكب', input.passengerKm],
    ['مسافة العودة', input.returnKm],
    ['الوقت الإجمالي', input.totalMinutes],
    ['المصروفات الإضافية', input.extraExpenses],
    ['نسبة العمولة', input.commissionRate],
    ['سعر الوقود', settings.fuelPrice],
    ['استهلاك الوقود', settings.consumptionPer100],
    ['الصيانة لكل كيلومتر', settings.maintenancePerKm],
    ['الحد الأدنى للربح', settings.minNetProfit],
    ['هدف الربح بالساعة', settings.hourlyTarget]
  ]

  if (input.fareMode !== 'net' && input.fareMode !== 'gross' && input.fareMode !== 'unknown') {
    errors.push('حدد نوع الأجرة بشكل صحيح.')
  }

  for (const [label, value] of fields) {
    if (!finite(value)) errors.push(`${label}: أدخل رقمًا صالحًا.`)
    else if (value < 0) errors.push(`${label}: لا يمكن أن تكون القيمة سالبة.`)
  }
  if (finite(input.totalMinutes) && input.totalMinutes <= 0) errors.push('أدخل وقتًا أكبر من صفر قبل إصدار قرار موثوق.')
  if (finite(input.totalMinutes) && input.totalMinutes > 24 * 60) errors.push('مدة الرحلة تتجاوز 24 ساعة؛ راجع الإدخال.')
  if (finite(input.fare) && input.fare > 1_000_000) errors.push('الأجرة تتجاوز الحد المعقول للتحقق؛ راجع الإدخال.')
  if (finite(input.extraExpenses) && input.extraExpenses > 1_000_000) errors.push('المصروفات الإضافية تتجاوز الحد المعقول للتحقق؛ راجع الإدخال.')
  if (finite(settings.fuelPrice) && settings.fuelPrice > 1_000) errors.push('سعر الوقود يتجاوز الحد المعقول للتحقق؛ راجع الإعدادات.')
  if (finite(settings.consumptionPer100) && settings.consumptionPer100 > 100) errors.push('استهلاك الوقود يتجاوز 100 لتر/100 كم؛ راجع الإعدادات.')
  if (finite(settings.maintenancePerKm) && settings.maintenancePerKm > 1_000) errors.push('تكلفة الصيانة لكل كم تتجاوز الحد المعقول للتحقق.')
  if (finite(settings.minNetProfit) && settings.minNetProfit > 1_000_000) errors.push('الحد الأدنى للربح يتجاوز الحد المعقول للتحقق.')
  if (finite(settings.hourlyTarget) && settings.hourlyTarget > 1_000_000) errors.push('هدف الربح بالساعة يتجاوز الحد المعقول للتحقق.')
  for (const [label, value] of [['مسافة الوصول', input.pickupKm], ['مسافة الراكب', input.passengerKm], ['مسافة العودة', input.returnKm]] as const) {
    if (finite(value) && value > 1000) errors.push(`${label}: المسافة أكبر من 1000 كم؛ راجع الإدخال.`)
  }
  if (finite(input.commissionRate) && input.commissionRate >= 100) errors.push('نسبة العمولة يجب أن تكون أقل من 100%.')
  if (finite(settings.consumptionPer100) && settings.consumptionPer100 <= 0) errors.push('استهلاك الوقود يجب أن يكون أكبر من صفر.')
  if (finite(settings.fuelPrice) && settings.fuelPrice <= 0) errors.push('سعر الوقود يجب أن يكون أكبر من صفر.')
  return [...new Set(errors)]
}

export function calculateTrip(input: TripInput, settings: Settings): Calculation {
  const validationErrors = validate(input, settings)
  const trip = input && typeof input === 'object' ? input : {} as TripInput
  const config = settings && typeof settings === 'object' ? settings : {} as Settings
  const validNumber = (value: number, maximum = 1_000_000): number =>
    finite(value) && value >= 0 && value <= maximum ? value : 0
  const pickupKm = validNumber(trip.pickupKm, 1000)
  const passengerKm = validNumber(trip.passengerKm, 1000)
  const returnKm = validNumber(trip.returnKm, 1000)
  const totalMinutes = validNumber(trip.totalMinutes, 24 * 60)
  const fare = validNumber(trip.fare)
  const extraExpenses = validNumber(trip.extraExpenses)
  const fuelPrice = validNumber(config.fuelPrice, 1000)
  const consumption = validNumber(config.consumptionPer100, 100)
  const maintenanceRate = validNumber(config.maintenancePerKm, 1000)
  const minimumProfit = validNumber(config.minNetProfit)
  const hourlyTarget = validNumber(config.hourlyTarget)
  const commission = finite(trip.commissionRate) && trip.commissionRate >= 0 && trip.commissionRate < 100
    ? trip.commissionRate : 0

  const totalKm = pickupKm + passengerKm + returnKm
  const fuelCost = money(totalKm * fuelPrice * consumption / 100)
  const maintenanceCost = money(totalKm * maintenanceRate)
  const totalCost = money(fuelCost + maintenanceCost + extraExpenses)
  const netFare = money(trip.fareMode === 'gross' ? fare * (1 - commission / 100) : fare)
  const netProfit = money(netFare - totalCost)
  const hourlyProfit = totalMinutes > 0 ? money(netProfit * 60 / totalMinutes) : 0
  const targetByTrip = totalCost + minimumProfit
  const targetByHour = totalMinutes > 0 ? totalCost + hourlyTarget * totalMinutes / 60 : targetByTrip
  const requiredNetFare = money(Math.max(targetByTrip, targetByHour))
  const requiredFare = money(trip.fareMode === 'gross' ? requiredNetFare / (1 - commission / 100) : requiredNetFare)
  const fareGap = money(requiredFare - fare)

  let decision: Calculation['decision'] = 'review'
  let decisionReason = validationErrors[0] ?? ''
  if (validationErrors.length === 0 && trip.fareMode === 'unknown') {
    decisionReason = 'أكد أولًا هل الأجرة صافية أم إجمالية قبل اعتماد قرار الربحية.'
  } else if (validationErrors.length === 0 && netProfit < minimumProfit) {
    decision = 'reject'
    decisionReason = `صافي الربح أقل من الحد الأدنى ${minimumProfit.toFixed(2)} ج.م.`
  } else if (validationErrors.length === 0 && hourlyProfit < hourlyTarget) {
    decision = 'review'
    decisionReason = `الربح لا يحقق هدف الساعة ${hourlyTarget.toFixed(2)} ج.م.`
  } else if (validationErrors.length === 0) {
    decision = 'accept'
    decisionReason = 'الرحلة تحقق الحد الأدنى لصافي الربح وهدف الربح بالساعة.'
  }

  return {
    totalKm: money(totalKm), fuelCost, maintenanceCost, totalCost, netFare,
    netProfit, hourlyProfit, requiredFare, fareGap, decision,
    decisionReason, isValid: validationErrors.length === 0, validationErrors
  }
}
