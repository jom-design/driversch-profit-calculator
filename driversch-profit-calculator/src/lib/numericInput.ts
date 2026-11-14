/**
 * Single source of truth for numeric text entry. Pure functions only (no DOM, no React),
 * so the same rules are tested in Node and used by every numeric input in the app.
 *
 * Why text inputs: browsers reject non-ASCII digits in <input type="number"> (Chromium
 * reports an empty value). Numeric fields therefore use type="text" with inputMode="decimal"
 * and parse the text here, so Arabic-Indic (٠-٩), Persian (۰-۹) and ASCII digits all work.
 *
 * Separator policy (what the parser accepts; anything else is rejected, never guessed):
 *   1,000        -> 1000    comma + exactly 3 digits, integer part 1-3 digits, no leading 0: thousands
 *   ١٬٠٠٠        -> 1000    Arabic thousands separator (U+066C) is the same as the comma
 *   1.000        -> REJECTED "ambiguous": English reads 1, Arabic/European reads 1000
 *   1,5 / ١٫٥    -> 1.5     one comma or Arabic decimal separator (U+066B) with 1-2 digits: decimal
 *   1.5          -> 1.5     dot with 1-2 digits: decimal
 *   0.125        -> 0.125   leading-zero integer part is always decimal
 *   1234.567     -> 1234.567  integer part of 4+ digits is always decimal
 *   1,000.5      -> 1000.5  both kinds: the last one is the decimal, the other must group in 3s
 *   1.000,5      -> 1000.5
 *   1,000,000    -> 1000000 repeated separator must group in 3s
 *   1,5,5 / 1,00,000 -> REJECTED (irregular grouping)
 *   1 000        -> 1000    a space is allowed only as a thousands group of exactly 3 digits
 *   1 5          -> REJECTED
 * Nothing is truncated. Values with more than 15 digits are rejected as "tooLong".
 */

const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
/** Largest number of digits accepted; beyond this a Number can no longer keep every digit exactly. */
export const MAX_NUMERIC_DIGITS = 15

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

/**
 * Maps separators and signs to ASCII: Arabic decimal (٫) -> '.', Arabic thousands (٬),
 * Arabic comma (،) -> ',', Unicode minus and en dash -> '-'. Digits become ASCII.
 */
function mapCharacters(text: string): string {
  let out = ''
  for (const ch of toAsciiDigits(text)) {
    switch (ch) {
      case '٫': // Arabic decimal separator ٫
        out += '.'
        break
      case '٬': // Arabic thousands separator ٬
      case '،': // Arabic comma ،
        out += ','
        break
      case '−': // Unicode minus −
      case '–': // en dash –
        out += '-'
        break
      default:
        out += ch
    }
  }
  return out
}

export interface SanitizedDraft {
  /** ASCII text made of digits, '.', ',', spaces and an optional leading minus. Never truncated. */
  text: string
  /** Where the caret should sit inside `text` so it stays after the same logical character. */
  caret: number
}

export interface NumericDraftOptions {
  /** Accept a leading minus sign. Off by default: fares, distances, times and fees are never negative. */
  allowNegative?: boolean
}

/**
 * Cleans text as the user types. Keeps digits (any digit system), separators and spaces, and drops letters
 * and symbols. It does not decide what the separators mean: that is done by parseNumericDraft, so the field
 * shows what was typed and marks ambiguous input instead of silently changing it.
 * The caret is mapped so typing in the middle of the field does not jump to the end.
 */
export function sanitizeNumericDraft(raw: string, caret: number, options: NumericDraftOptions = {}): SanitizedDraft {
  const allowNegative = options.allowNegative ?? false
  let out = ''
  let caretOut = 0
  const chars = Array.from(raw)
  for (let i = 0; i < chars.length; i++) {
    const ch = mapCharacters(chars[i])
    let keep = ''
    if ((ch >= '0' && ch <= '9') || ch === '.' || ch === ',' || ch === ' ') {
      keep = ch
    } else if (ch === '-' && allowNegative && out.length === 0) {
      keep = '-'
    }
    out += keep
    if (i < caret) caretOut = out.length
  }
  return { text: out, caret: caretOut }
}

export type NumericInvalidReason = 'format' | 'ambiguous' | 'tooLong'

export type NumericParse =
  | { kind: 'value'; value: number }
  | { kind: 'empty' }
  | { kind: 'incomplete' } // "-", ".", "," while the user is still typing
  | { kind: 'invalid'; reason: NumericInvalidReason }

const invalid = (reason: NumericInvalidReason): NumericParse => ({ kind: 'invalid', reason })

/** True when every group is digits, the first group has 1-3 digits and every later group has exactly 3. */
function isThousandsGrouping(groups: string[]): boolean {
  if (groups.length < 2) return false
  if (!groups.every(g => /^\d+$/.test(g))) return false
  if (groups[0].length < 1 || groups[0].length > 3) return false
  return groups.slice(1).every(g => g.length === 3)
}

/** Strict parser for numeric text, following the separator policy at the top of this file. Never returns NaN. */
export function parseNumericDraft(text: string): NumericParse {
  const clean = mapCharacters(text).trim()
  if (clean === '') return { kind: 'empty' }
  const negative = clean.startsWith('-')
  let body = negative ? clean.slice(1) : clean
  if (body.includes('-')) return invalid('format')
  // A space is only a thousands group: "1 000" is fine, "1 5" is not.
  body = body.replace(/(\d) (?=\d{3}(?!\d))/g, '$1').trim()
  if (body === '' || body === '.' || body === ',') return { kind: 'incomplete' }
  if (!/^[\d.,]+$/.test(body) || !/\d/.test(body)) return invalid('format')

  const seps = body.match(/[.,]/g) ?? []
  const kinds = new Set(seps)
  let integerDigits: string
  let fractionDigits = ''

  if (kinds.size === 2) {
    // Both separators: the last one is the decimal point, the other one must group in threes.
    const decimal = seps[seps.length - 1] ?? ''
    const thousands = decimal === ',' ? '.' : ','
    if (seps.filter(s => s === decimal).length !== 1) return invalid('format')
    const cut = body.lastIndexOf(decimal)
    const groups = body.slice(0, cut).split(thousands)
    if (!isThousandsGrouping(groups)) return invalid('format')
    integerDigits = groups.join('')
    fractionDigits = body.slice(cut + 1)
  } else if (seps.length > 1) {
    // One kind repeated: it can only be thousands grouping.
    const groups = body.split(seps[0] ?? '')
    if (!isThousandsGrouping(groups)) return invalid('format')
    integerDigits = groups.join('')
  } else if (seps.length === 1) {
    const sep = seps[0] ?? ''
    const [head, tail] = body.split(sep)
    const looksLikeThousands = tail.length === 3 && head.length >= 1 && head.length <= 3 && head[0] !== '0'
    if (looksLikeThousands) {
      // 1,000 is thousands. 1.000 is ambiguous and is never guessed.
      if (sep === '.') return invalid('ambiguous')
      integerDigits = head + tail
    } else {
      integerDigits = head || '0'
      fractionDigits = tail
    }
  } else {
    integerDigits = body
  }

  if (integerDigits.length + fractionDigits.length > MAX_NUMERIC_DIGITS) return invalid('tooLong')
  const value = Number(`${negative ? '-' : ''}${integerDigits}${fractionDigits ? '.' + fractionDigits : ''}`)
  return Number.isFinite(value) ? { kind: 'value', value } : invalid('format')
}

/** Text shown for a stored number. Never "NaN" or an exponent; empty for missing values. */
export function formatNumericValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return ''
  return String(Number(value.toFixed(6)))
}
