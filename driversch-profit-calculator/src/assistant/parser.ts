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

const DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
}

export function normalizeRideText(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, digit => DIGITS[digit] ?? digit)
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
    const decimals = value.split(',').at(-1)?.length ?? 0
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
      const converted = convert(raw)
      const value = converted === null ? null : (typeof converted === 'number' && pattern.scale ? converted * pattern.scale : converted)
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

function farePatterns(provider: RideProvider): Pattern[] {
  if (provider === 'indrive') return [
    { regex: new RegExp('(?:القبول\\s*مقابل|قبول\\s*مقابل)\\s*' + MONEY + '\\s*(?:EGP|جنيه|ج\\.م)?', 'i'), group: 1, confidence: 0.96 },
    { regex: new RegExp('(?:offer|your offer|المبلغ المقترح)\\s*[:：]?\\s*' + MONEY, 'i'), group: 1, confidence: 0.72 }
  ]
  if (provider === 'uber') return [
    { regex: new RegExp('(?:صافي\\s*رسوم\\s*الخدمة|المبلغ المستحق|fare)\\s*[:：]?\\s*(?:EGP\\s*)?' + MONEY, 'i'), group: 1, confidence: 0.94 },
    { regex: new RegExp(MONEY + '\\s*(?:EGP|جنيه|ج\\.م)', 'i'), group: 1, confidence: 0.68 }
  ]
  return [
    { regex: new RegExp('(?:الأجرة|السعر|المبلغ|fare|trip price)\\s*[:：]?\\s*(?:EGP\\s*)?' + MONEY, 'i'), group: 1, confidence: provider === 'didi' ? 0.78 : 0.55 },
    { regex: new RegExp(MONEY + '\\s*(?:EGP|جنيه|ج\\.م)', 'i'), group: 1, confidence: 0.58 }
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
  const distance = extract(rawText, [
    { regex: new RegExp(NUMBER + '\\s*(?:كم|كيلومتر|km)\\b?', 'i'), group: 1, confidence: 0.82 },
    { regex: new RegExp(NUMBER + '\\s*(?:متر|m)\\b?', 'i'), group: 1, confidence: 0.72 }
  ], raw => {
    const value = parseNumber(raw)
    if (value === null) return null
    return /متر|\bm\b/i.test(rawText.slice(0, rawText.indexOf(raw) + raw.length)) ? value / 1000 : value
  })
  const duration = extract(rawText, [
    { regex: new RegExp(NUMBER + '\\s*(?:دقيقة|دقائق|min|mins)\\b?', 'i'), group: 1, confidence: 0.86 },
    { regex: new RegExp(NUMBER + '\\s*(?:ساعة|ساعات|hr|hours)\\b?', 'i'), group: 1, confidence: 0.84 }
  ], raw => {
    const value = parseNumber(raw)
    if (value === null) return null
    const match = rawText.match(new RegExp(NUMBER + '\\s*(?:ساعة|ساعات|hr|hours)\\b?', 'i'))
    return match ? Math.round(value * 60) : Math.round(value)
  })
  const fare = extract(rawText, farePatterns(detected.provider), parseNumber)
  const warnings: string[] = []
  if (detected.provider === 'unknown') warnings.push('لم يتم تحديد تطبيق النقل بشكل مؤكد؛ راجع المصدر يدويًا.')
  if (fare.value === null) warnings.push('لم يتم استخراج الأجرة؛ لن يتم تخمينها.')
  if (distance.value === null) warnings.push('لم يتم استخراج المسافة؛ أدخلها يدويًا.')
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
      pickupDistanceKm: missing<number>(),
      currency: /EGP|جنيه|ج\.م/i.test(rawText)
        ? { value: 'EGP', confidence: 0.98, evidence: [], status: 'candidate' }
        : missing<'EGP'>()
    },
    warnings,
    createdAt: (input.now ?? new Date()).toISOString()
  }
}
