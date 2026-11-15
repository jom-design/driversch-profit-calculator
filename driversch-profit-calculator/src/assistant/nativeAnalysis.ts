import type { NativeProfitabilityPreview, NativeRecommendation } from './types'

const RECOMMENDATIONS: readonly NativeRecommendation[] = ['accept', 'review', 'reject', 'insufficient_data']
const MONEY_FIELDS = ['netProfit', 'hourlyProfit', 'totalCost', 'requiredFare', 'partialCost'] as const
const MAX_REASON_LENGTH = 300
const MAX_MISSING_CODE_LENGTH = 40

/** Arabic labels for the missing-input codes the Kotlin analyzer emits. */
export const MISSING_FIELD_LABELS: Record<string, string> = {
  settings: 'إعدادات الحساب',
  fare: 'الأجرة',
  pickupDistance: 'مسافة الوصول',
  tripDistance: 'مسافة الرحلة',
  duration: 'مدة الرحلة',
  pickupTime: 'وقت الوصول للراكب',
  currency: 'العملة',
  currencyMismatch: 'عملة غير الجنيه المصري',
  fareMode: 'نوع الأجرة (صافية أم إجمالية)',
  commission: 'نسبة العمولة',
  returnDistance: 'مسافة العودة',
  extraExpenses: 'المصروفات الإضافية',
}

export const RECOMMENDATION_LABELS: Record<NativeRecommendation, string> = {
  accept: 'قبول مقترح',
  review: 'مراجعة',
  reject: 'رفض مقترح',
  insufficient_data: 'بيانات غير كافية',
}

/**
 * Checks an analysis object received from the native bridge. Anything malformed is dropped rather
 * than displayed. A net profit is refused unless the recommendation is backed by complete data.
 */
export function validateNativeAnalysis(value: unknown): NativeProfitabilityPreview | undefined {
  if (!value || typeof value !== 'object') return undefined
  const a = value as Record<string, unknown>
  if (!RECOMMENDATIONS.includes(a.recommendation as NativeRecommendation)) return undefined
  for (const key of MONEY_FIELDS) {
    const v = a[key]
    if (v !== null && !(typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e12)) return undefined
  }
  if (!Array.isArray(a.missingFields) || a.missingFields.length > 20 ||
      !a.missingFields.every(code => typeof code === 'string' && code.length > 0 && code.length <= MAX_MISSING_CODE_LENGTH)) return undefined
  if (typeof a.reason !== 'string' || a.reason.length > MAX_REASON_LENGTH) return undefined
  if (typeof a.payloadVerified !== 'boolean') return undefined
  const recommendation = a.recommendation as NativeRecommendation
  if (recommendation === 'insufficient_data' && a.netProfit !== null) return undefined
  if (recommendation !== 'insufficient_data' && a.netProfit === null) return undefined
  return {
    recommendation,
    netProfit: a.netProfit as number | null,
    hourlyProfit: a.hourlyProfit as number | null,
    totalCost: a.totalCost as number | null,
    requiredFare: a.requiredFare as number | null,
    partialCost: a.partialCost as number | null,
    missingFields: a.missingFields as string[],
    reason: a.reason,
    payloadVerified: a.payloadVerified
  }
}

export type AnalysisTone = 'positive' | 'negative' | 'neutral' | 'insufficient'

/** Visual state of the net-profit headline. Insufficient data never reads as a profit. */
export function analysisTone(analysis: NativeProfitabilityPreview | undefined): AnalysisTone {
  if (!analysis || analysis.netProfit === null) return 'insufficient'
  if (analysis.recommendation === 'reject') return 'negative'
  if (analysis.recommendation === 'accept') return 'positive'
  return 'neutral'
}

/** Arabic labels for the missing inputs, in the order received, without duplicates. */
export function missingFieldLabels(analysis: NativeProfitabilityPreview | undefined): string[] {
  if (!analysis) return []
  return [...new Set(analysis.missingFields.map(code => MISSING_FIELD_LABELS[code] ?? 'بيانات أخرى'))]
}
