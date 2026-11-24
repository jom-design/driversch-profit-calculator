import { toAsciiDigits } from './numericInput.ts'

export function normalizeDigits(value: string) {
  return toAsciiDigits(value).replace(/[٬]/g, ',').replace(/[٫]/g, '.')
}
export function parseLocalizedNumber(value: string): number | null {
  let s = normalizeDigits(value).replace(/[^\d.,\-]/g, '')
  if (!s || s === '-') return null
  // Arabic screenshots commonly use comma as decimal separator (e.g. 1,9 km).
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '')
  else if (s.includes(',')) s = s.replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
export function parseDistance(text: string): number | null {
  const s = normalizeDigits(text.toLowerCase())
  const m = s.match(/([\d.,]+)\s*(متر|م\b|m\b|كم|كلم|كيلومتر|km\b)/i)
  if (!m) return null
  const n = parseLocalizedNumber(m[1])
  if (n === null) return null
  const unit = m[2].toLowerCase()
  return /^(?:متر|م|m)$/.test(unit) ? n / 1000 : n
}
export function parseDuration(text: string): number | null {
  const s = normalizeDigits(text.toLowerCase())
  let total = 0
  let found = false
  const hours = s.match(/([\d.,]+)\s*(?:ساعات|ساعة|س(?=[\s،,]|$)|سا|h\b|hr\b)/i)
  const mins = s.match(/([\d.,]+)\s*(?:دقائق|دقيقة|د(?=[\s،,]|$)|دق|min\b)/i)
  if (hours) { total += (parseLocalizedNumber(hours[1]) || 0) * 60; found = true }
  if (mins) { total += parseLocalizedNumber(mins[1]) || 0; found = true }
  if (!found) {
    const plain = s.match(/([\d.,]+)\s*(?:د|دقيقة|min)/i)
    if (plain) { total = parseLocalizedNumber(plain[1]) || 0; found = true }
  }
  return found ? Math.round(total) : null
}
