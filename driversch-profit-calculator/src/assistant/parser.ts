import { toAsciiDigits } from '../lib/numericInput.ts'
import type { CaptureSource, EvidenceSpan, FieldCandidate, RideOfferDraft, RideProvider } from './types'

interface Pattern {
  regex: RegExp
  group: number
  confidence: number
  scale?: number
}

const PROVIDERS: Array<{ provider: RideProvider; regex: RegExp }> = [
  { provider: 'uber', regex: /\buber\b|أوبر|اوبر/i },
  { provider: 'didi', regex: /\bdidi\b|ديدي/i },
  { provider: 'indrive', regex: /\bindrive\b|in\s*drive|إندرايف|اندرايف/i }
]

export function normalizeRideText(input: string): string {
  return toAsciiDigits(input)
    .replace(/[٫]/g, '.')
    .replace(/[٬]/g, ',')
    .replace(/\u00a0/g, ' ')
}

function parseNumber(raw: string): number | null {
  let value = raw.trim().replace(/\s/g, '')
  if (!value) return null
  if (value.includes(',') && value.includes('.')) {
    value = value.lastIndexOf(',') > value.lastIndexOf('.')
      ? value.replace(/\./g, '').replace(',', '.')
      : value.replace(/,/g, '')
  } else if (value.includes(',')) {
    const parts = value.split(',')
    const decimals = parts[parts.length - 1]?.length ?? 0
    value = decimals > 0 && decimals <= 2 ? value.replace(',', '.') : value.replace(/,/g, '')
  }
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

function missing<T>(): FieldCandidate<T> {
  return { value: null, confidence: 0, evidence: [], status: 'missing' }
}

function extract<T>(text: string, patterns: Pattern[], convert: (raw: string) => T | null): FieldCandidate<T> {
  for (const pattern of patterns) {
    const match = pattern.regex.exec(text)
    const raw = match?.[pattern.group]
    if (match && raw !== undefined) {
      let value: T | null = convert(raw)
      if (typeof value === 'number' && pattern.scale !== undefined) value = (value * pattern.scale) as T
      if (value !== null) {
        const start = match.index
        const end = start + match[0].length
        const evidence: EvidenceSpan[] = [{ text: match[0], start, end }]
        return { value, confidence: pattern.confidence, evidence, status: pattern.confidence >= 0.85 ? 'candidate' : 'needs-review' }
      }
    }
  }
  return missing<T>()
}

const MONEY = '([0-9]+(?:[.,][0-9]{1,3})?)'
const NUMBER = '([0-9]+(?:[.,][0-9]{1,3})?)'

function genericDistanceMatches(text: string): Array<{ value: number; evidence: EvidenceSpan[] }> {
  const regex = new RegExp(NUMBER + '\\s*(كم|كيلومتر|km|متر|m)(?=\\s|$|[،,])', 'gi')
  return [...text.matchAll(regex)].flatMap(match => {
    const value = parseNumber(match[1])
    if (value === null || match.index === undefined) return []
    const normalized = /متر|^m$/i.test(match[2]) ? value / 1000 : value
    return [{ value: normalized, evidence: [{ text: match[0], start: match.index, end: match.index + match[0].length }] }]
  })
}

function farePatterns(provider: RideProvider): Pattern[] {
  if (provider === 'indrive') return [
    { regex: new RegExp('(?:القبول\\s*مقابل|قبول\\s*مقابل)\\s*' + MONEY + '\\s*(?:EGP|جنيه|ج\\.م)?', 'i'), group: 1, confidence: 0.96 },
    { regex: new RegExp('(?:offer|your offer|المبلغ المقترح)\\s*[:：]?\\s*' + MONEY, 'i'), group: 1, confidence: 0.72 }
  ]
  if (provider === 'uber') return [
    { regex: new RegExp('(?:صافي\\s*رسوم\\s*الخدمة|المبلغ المستحق|fare)\\s*[:：]?\\s*(?:EGP\\s*)?' + MONEY, 'i'), group: 1, confidence: 0.94 }
  ]
  return [
    { regex: new RegExp('(?:الأجرة|السعر|المبلغ|fare|trip price)\\s*[:：]?\\s*(?:EGP\\s*)?' + MONEY, 'i'), group: 1, confidence: provider === 'didi' ? 0.78 : 0.55 }
  ]
}

function providerFrom(text: string): { provider: RideProvider; confidence: number } {
  const matches = PROVIDERS.filter(item => item.regex.test(text))
  if (matches.length !== 1) return { provider: 'unknown', confidence: 0 }
  return { provider: matches[0].provider, confidence: 0.98 }
}

export function parseRideOffer(input: {
  text: string
  source?: CaptureSource
  now?: Date
}): RideOfferDraft {
  const rawText = normalizeRideText(input.text)
  const detected = providerFrom(rawText)
  const pickupDistance = extract(rawText, [
    { regex: new RegExp('(?:مسافة الوصول|مسافة الاستلام|pickup(?: distance)?|to pickup)\\s*[:：]?\\s*' + NUMBER + '\\s*(?:كم|كيلومتر|km)', 'i'), group: 1, confidence: 0.96 },
    { regex: new RegExp('(?:مسافة الوصول|مسافة الاستلام|pickup(?: distance)?|to pickup)\\s*[:：]?\\s*' + NUMBER + '\\s*(?:متر|m)', 'i'), group: 1, confidence: 0.96, scale: 0.001 },
    { regex: new RegExp(NUMBER + '\\s*(?:كم|كيلومتر|km)\\s*(?:للوصول|استلام|pickup)', 'i'), group: 1, confidence: 0.96 },
    { regex: new RegExp(NUMBER + '\\s*(?:متر|m)\\s*(?:للوصول|استلام|pickup)', 'i'), group: 1, confidence: 0.96, scale: 0.001 }
  ], parseNumber)
  const explicitTripDistance = extract(rawText, [
    { regex: new RegExp('(?:مسافة الرحلة|مسافة الراكب|مع الراكب|trip distance|ride distance)\\s*[:：]?\\s*' + NUMBER + '\\s*(?:كم|كيلومتر|km)', 'i'), group: 1, confidence: 0.96 },
    { regex: new RegExp('(?:مسافة الرحلة|مسافة الراكب|مع الراكب|trip distance|ride distance)\\s*[:：]?\\s*' + NUMBER + '\\s*(?:متر|m)', 'i'), group: 1, confidence: 0.96, scale: 0.001 }
  ], parseNumber)
  const allDistanceMatches = genericDistanceMatches(rawText)
  const unassignedDistances = allDistanceMatches.filter(match =>
    ![...pickupDistance.evidence, ...explicitTripDistance.evidence].some(evidence =>
      match.evidence[0].start < evidence.end && match.evidence[0].end > evidence.start
    )
  )
  const distance = explicitTripDistance.value !== null ? explicitTripDistance
    : unassignedDistances.length === 1
      ? { value: unassignedDistances[0].value, confidence: 0.72, evidence: unassignedDistances[0].evidence, status: 'needs-review' as const }
      : missing<number>()
  const duration = extract(rawText, [
    { regex: new RegExp(NUMBER + '\\s*(?:دقيقة|دقائق|min|mins)(?=\\s|$|[،,])', 'i'), group: 1, confidence: 0.86 },
    { regex: new RegExp(NUMBER + '\\s*(?:ساعة|ساعات|hr|hours)(?=\\s|$|[،,])', 'i'), group: 1, confidence: 0.84, scale: 60 }
  ], raw => { const value = parseNumber(raw); return value === null ? null : Math.round(value) })
  const fare = extract(rawText, farePatterns(detected.provider), parseNumber)
  const warnings: string[] = []
  if (detected.provider === 'unknown') warnings.push('لم يتم تحديد تطبيق النقل بشكل مؤكد؛ راجع المصدر يدويًا.')
  if (fare.value === null) warnings.push('لم يتم استخراج الأجرة؛ لن يتم تخمينها.')
  if (distance.value === null) warnings.push(allDistanceMatches.length > 1 ? 'تم العثور على أكثر من مسافة دون تسميات واضحة؛ لم يتم تخمين مسافة الرحلة.' : 'لم يتم استخراج مسافة الرحلة؛ أدخلها يدويًا.')
  if (pickupDistance.value === null) warnings.push('مسافة الوصول غير محددة؛ أدخلها يدويًا قبل التأكيد.')
  if (duration.value === null) warnings.push('لم يتم استخراج مدة الرحلة؛ أدخلها يدويًا.')
  if (fare.confidence < 0.85 && fare.value !== null) warnings.push('ثقة استخراج الأجرة أقل من الحد المطلوب؛ يلزم تأكيد يدوي.')
  return {
    provider: detected.provider,
    providerConfidence: detected.confidence,
    source: input.source ?? 'manual',
    rawText,
    fields: {
      fare,
      distanceKm: distance,
      durationMinutes: duration,
      pickupDistanceKm: pickupDistance,
      currency: /EGP|جنيه|ج\.م/i.test(rawText)
        ? { value: 'EGP', confidence: 0.98, evidence: [], status: 'candidate' }
        : missing<'EGP'>()
    },
    warnings,
    createdAt: (input.now ?? new Date()).toISOString()
  }
}
