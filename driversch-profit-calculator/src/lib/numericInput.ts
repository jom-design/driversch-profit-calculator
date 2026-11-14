/**
 * Single source of truth for numeric text entry. Pure functions only (no DOM, no React),
 * so the same rules are tested in Node and used by every numeric input in the app.
 *
 * Why text inputs: browsers reject non-ASCII digits in <input type="number"> (Chromium
 * reports an empty value). Numeric fields therefore use type="text" with inputMode="decimal"
 * and parse the text here, so Arabic-Indic (٠-٩), Persian (۰-۹) and ASCII digits all work.
 */

const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

/** Converts Arabic-Indic and Persian digits to ASCII. Other characters are unchanged. */
export function toAsciiDigits(text: string): string {
  let out = ''
  for (const ch of text) {
    const arabic = ARABIC_INDIC_DIGITS.indexOf(ch)
    const persian = PERSIAN_DIGITS.indexOf(ch)
    out += arabic !== -1 ? String(arabic) : persian !== -1 ? String(persian) : ch
  }
  return out
}

/** Maps one typed character to its numeric meaning: a digit, '.', '-', or the original character. */
function mapChar(ch: string): string {
  const digit = toAsciiDigits(ch)
  if (digit !== ch) return digit
  switch (ch) {
    case '٫': // Arabic decimal separator
    case '،': // Arabic comma, often typed as decimal separator
    case ',':
    case '.':
      return '.'
    case '−': // Unicode minus
    case '–': // en dash typed as minus
    case '-':
      return '-'
    default:
      return ch
  }
}

export interface NumericDraftOptions {
  /** Accept a leading minus sign. Off by default: fares, distances, times and fees are never negative. */
  allowNegative?: boolean
  /** Upper bound on characters, to keep absurd values out of the field. */
  maxLength?: number
}

export interface SanitizedDraft {
  /** ASCII-only text: digits, at most one decimal point, optional leading minus. */
  text: string
  /** Where the caret should sit inside `text` so it stays after the same logical character. */
  caret: number
}

/**
 * Cleans text as the user types. Keeps digits, converts Arabic/Persian digits and separators,
 * and drops everything else (letters, spaces, thousands separators, extra dots).
 * The caret is mapped so typing in the middle of the field does not jump to the end.
 */
export function sanitizeNumericDraft(raw: string, caret: number, options: NumericDraftOptions = {}): SanitizedDraft {
  const allowNegative = options.allowNegative ?? false
  const maxLength = options.maxLength ?? 12
  let out = ''
  let sawDot = false
  let caretOut = 0
  const chars = Array.from(raw)
  for (let i = 0; i < chars.length; i++) {
    const ch = mapChar(chars[i])
    let keep = ''
    if (ch >= '0' && ch <= '9') {
      keep = ch
    } else if (ch === '.' && !sawDot) {
      keep = '.'
      sawDot = true
    } else if (ch === '-' && allowNegative && out.length === 0) {
      keep = '-'
    }
    if (keep && out.length < maxLength) out += keep
    if (i < caret) caretOut = out.length
  }
  return { text: out, caret: caretOut }
}

export type NumericParse =
  | { kind: 'value'; value: number }
  | { kind: 'empty' }
  | { kind: 'incomplete' } // "-", ".", "-." while the user is still typing
  | { kind: 'invalid' }

/** Strict parser for numeric text. Accepts ASCII, Arabic-Indic and Persian digits. Never returns NaN. */
export function parseNumericDraft(text: string): NumericParse {
  const clean = toAsciiDigits(text).replace(/[٫،,]/g, '.').replace(/[−–]/g, '-').trim()
  if (clean === '') return { kind: 'empty' }
  if (/^-?\.?$/.test(clean)) return { kind: 'incomplete' }
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(clean)) return { kind: 'invalid' }
  const value = Number(clean)
  return Number.isFinite(value) ? { kind: 'value', value } : { kind: 'invalid' }
}

/** Text shown for a stored number. Never "NaN" or an exponent; empty for missing values. */
export function formatNumericValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return ''
  return String(Number(value.toFixed(6)))
}
