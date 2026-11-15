import type { CalcSettings, Calculation, TripInput } from '../types.ts'

const MAX_SAFE_CURRENCY = Number.MAX_SAFE_INTEGER / 100
const MIN_NORMAL_DURATION_MINUTES = 2.2250738585072014e-308
const money = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100
const finite = (value: number): boolean => Number.isFinite(value)

function validate(input: TripInput, settings: CalcSettings): string[] {
  const errors: string[] = []
  if (!input || typeof input !== 'object') errors.push('بيانات الرحلة غير متاحة؛ راجع الإدخال.')
  if (!settings || typeof settings !== 'object') errors.push('الإعدادات غير متاحة؛ راجع الإعدادات.')
  input = input && typeof input === 'object' ? input : {} as TripInput
  settings = settings && typeof settings === 'object' ? settings : {} as CalcSettings
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
  if (finite(input.totalMinutes) && input.totalMinutes <= 0) {
    errors.push('مدة الرحلة يجب أن تكون أكبر من صفر.')
  } else if (finite(input.totalMinutes) && input.totalMinutes < MIN_NORMAL_DURATION_MINUTES) {
    errors.push('مدة الرحلة خارج النطاق العددي الآمن للحساب.')
  }
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

// Numeric fields are display placeholders only when isValid=false; the UI must not present them as calculated results.
function invalidCalculation(validationErrors: string[]): Calculation {
  return {
    totalKm: 0,
    fuelCost: 0,
    maintenanceCost: 0,
    totalCost: 0,
    netFare: 0,
    netProfit: 0,
    hourlyProfit: 0,
    requiredFare: 0,
    fareGap: 0,
    decision: 'review',
    decisionReason: validationErrors[0] ?? 'تعذر التحقق من بيانات الرحلة.',
    isValid: false,
    validationErrors
  }
}

export function calculateTrip(input: TripInput, settings: CalcSettings): Calculation {
  const validationErrors = validate(input, settings)
  if (validationErrors.length > 0) return invalidCalculation(validationErrors)

  const trip = input
  const config = settings
  const totalKmRaw = trip.pickupKm + trip.passengerKm + trip.returnKm
  const fuelCostRaw = totalKmRaw * config.consumptionPer100 * config.fuelPrice / 100
  const maintenanceCostRaw = totalKmRaw * config.maintenancePerKm
  const totalCostRaw = fuelCostRaw + maintenanceCostRaw + trip.extraExpenses
  const netFareRaw = trip.fareMode === 'gross'
    ? trip.fare * (1 - trip.commissionRate / 100)
    : trip.fare
  const netProfitRaw = netFareRaw - totalCostRaw
  const hourlyProfitRaw = netProfitRaw * 60 / trip.totalMinutes
  const targetByTripRaw = totalCostRaw + config.minNetProfit
  const targetByHourRaw = totalCostRaw + config.hourlyTarget * trip.totalMinutes / 60
  const requiredNetFareRaw = Math.max(targetByTripRaw, targetByHourRaw)
  const requiredFareRaw = trip.fareMode === 'gross'
    ? requiredNetFareRaw / (1 - trip.commissionRate / 100)
    : requiredNetFareRaw
  const fareGapRaw = requiredFareRaw - trip.fare

  const derivedValues: Array<[string, number, number]> = [
    ['إجمالي المسافة', totalKmRaw, Number.MAX_SAFE_INTEGER],
    ['تكلفة الوقود', fuelCostRaw, MAX_SAFE_CURRENCY],
    ['تكلفة الصيانة', maintenanceCostRaw, MAX_SAFE_CURRENCY],
    ['إجمالي تكلفة التشغيل', totalCostRaw, MAX_SAFE_CURRENCY],
    ['صافي الأجرة', netFareRaw, MAX_SAFE_CURRENCY],
    ['صافي الربح', netProfitRaw, MAX_SAFE_CURRENCY],
    ['الربح بالساعة', hourlyProfitRaw, MAX_SAFE_CURRENCY],
    ['الحد الأدنى للأجرة', requiredFareRaw, MAX_SAFE_CURRENCY],
    ['فرق الأجرة', fareGapRaw, MAX_SAFE_CURRENCY]
  ]
  const arithmeticErrors = derivedValues
    .filter(([, value, maximum]) => !finite(value) || Math.abs(value) > maximum)
    .map(([label]) => `${label}: نتيجة الحساب خارج النطاق العددي الآمن؛ لا يمكن إصدار قرار موثوق.`)
  if (arithmeticErrors.length > 0) return invalidCalculation(arithmeticErrors)

  const totalKm = money(totalKmRaw)
  const fuelCost = money(fuelCostRaw)
  const maintenanceCost = money(maintenanceCostRaw)
  const totalCost = money(totalCostRaw)
  const netFare = money(netFareRaw)
  const netProfit = money(netProfitRaw)
  const hourlyProfit = money(hourlyProfitRaw)
  const requiredFare = money(requiredFareRaw)
  const fareGap = money(fareGapRaw)

  let decision: Calculation['decision'] = 'review'
  let decisionReason = ''
  if (trip.fareMode === 'unknown') {
    decisionReason = 'أكد أولًا هل الأجرة صافية أم إجمالية قبل اعتماد قرار الربحية.'
  } else if (netProfit < config.minNetProfit) {
    decision = 'reject'
    decisionReason = `صافي الربح أقل من الحد الأدنى ${config.minNetProfit.toFixed(2)} ج.م.`
  } else if (hourlyProfit < config.hourlyTarget) {
    decision = 'review'
    decisionReason = `الربح لا يحقق هدف الساعة ${config.hourlyTarget.toFixed(2)} ج.م.`
  } else {
    decision = 'accept'
    decisionReason = 'الرحلة تحقق الحد الأدنى لصافي الربح وهدف الربح بالساعة.'
  }

  return {
    totalKm, fuelCost, maintenanceCost, totalCost, netFare,
    netProfit, hourlyProfit, requiredFare, fareGap, decision,
    decisionReason, isValid: true, validationErrors: []
  }
}
