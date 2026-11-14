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
    const parts = value.split(',')
    const decimals = parts[parts.length - 1]?.length ?? 0
    value = decimals > 0 && decimals <= 2 ? value.replace(',', '.') : value.replace(/,/g,���q�^