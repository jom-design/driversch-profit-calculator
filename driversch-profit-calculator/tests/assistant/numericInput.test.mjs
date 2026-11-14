import test from 'node:test'
import assert from 'node:assert/strict'
import { toAsciiDigits, sanitizeNumericDraft, parseNumericDraft, formatNumericValue } from '../../src/lib/numericInput.ts'
import { normalizeDigits } from '../../src/lib/numberParser.ts'

const value = (v) => ({ kind: 'value', value: v })
const invalid = (reason) => ({ kind: 'invalid', reason })

test('English digits are accepted unchanged', () => {
  assert.deepEqual(parseNumericDraft('0123456789'), value(123456789))
})

test('Arabic-Indic and Persian digits convert to the same numbers', () => {
  assert.equal(toAsciiDigits('٠١٢٣٤٥٦٧٨٩'), '0123456789')
  assert.equal(toAsciiDigits('۰۱۲۳۴۵۶۷۸۹'), '0123456789')
  assert.deepEqual(parseNumericDraft('١٠'), value(10))
  assert.deepEqual(parseNumericDraft('۱۲'), value(12))
})

// ---- The five required inputs ----
test('1,000 is one thousand, never 1', () => {
  assert.deepEqual(parseNumericDraft('1,000'), value(1000))
})

test('1.000 is rejected as ambiguous, never silently read as 1 or 1000', () => {
  assert.deepEqual(parseNumericDraft('1.000'), invalid('ambiguous'))
  assert.deepEqual(parseNumericDraft('12.000'), invalid('ambiguous'))
})

test('1,5 is one and a half', () => {
  assert.deepEqual(parseNumericDraft('1,5'), value(1.5))
})

test('Arabic thousands separator ١٬٠٠٠ is one thousand', () => {
  assert.deepEqual(parseNumericDraft('١٬٠٠٠'), value(1000))
})

test('Arabic decimal separator ١٫٥ is one and a half', () => {
  assert.deepEqual(parseNumericDraft('١٫٥'), value(1.5))
})

// ---- Decimal entries keep working ----
test('dot and comma decimals with one or two digits', () => {
  assert.deepEqual(parseNumericDraft('22.25'), value(22.25))
  assert.deepEqual(parseNumericDraft('٢٢٫٢٥'), value(22.25))
  assert.deepEqual(parseNumericDraft('10,50'), value(10.5))
  assert.deepEqual(parseNumericDraft('0.125'), value(0.125))
  assert.deepEqual(parseNumericDraft('0,125'), value(0.125))
  assert.deepEqual(parseNumericDraft('1234.567'), value(1234.567))
  assert.deepEqual(parseNumericDraft('1.'), value(1))
  assert.deepEqual(parseNumericDraft('.5'), value(0.5))
})

test('thousands groups with a decimal part', () => {
  assert.deepEqual(parseNumericDraft('1,000.5'), value(1000.5))
  assert.deepEqual(parseNumericDraft('1.000,5'), value(1000.5))
  assert.deepEqual(parseNumericDraft('١٬٠٠٠٫٥'), value(1000.5))
  assert.deepEqual(parseNumericDraft('12,345'), value(12345))
})

test('repeated separators must group in threes', () => {
  assert.deepEqual(parseNumericDraft('1,000,000'), value(1000000))
  assert.deepEqual(parseNumericDraft('1.000.000'), value(1000000))
  assert.deepEqual(parseNumericDraft('1,5,5'), invalid('format'))
  assert.deepEqual(parseNumericDraft('1,00,000'), invalid('format'))
  assert.deepEqual(parseNumericDraft('1.5.5'), invalid('format'))
  assert.deepEqual(parseNumericDraft('1.5,000'), invalid('format'))
})

test('spaces are thousands groups only when they are exactly three digits', () => {
  assert.deepEqual(parseNumericDraft('1 000'), value(1000))
  assert.deepEqual(parseNumericDraft('1 000 000'), value(1000000))
  assert.deepEqual(parseNumericDraft('1 5'), invalid('format'))
  assert.deepEqual(parseNumericDraft('1 0000'), invalid('format'))
})

test('negative values are parsed when they are valid', () => {
  assert.deepEqual(parseNumericDraft('-2.5'), value(-2.5))
  assert.deepEqual(parseNumericDraft('−٣'), value(-3))
  assert.deepEqual(parseNumericDraft('-1,000'), value(-1000))
})

test('negative sign is dropped by default and kept only where allowed', () => {
  assert.equal(sanitizeNumericDraft('-5', 2).text, '5')
  assert.equal(sanitizeNumericDraft('-5', 2, { allowNegative: true }).text, '-5')
  assert.equal(sanitizeNumericDraft('5-', 2, { allowNegative: true }).text, '5')
})

test('empty fields are reported as empty, not as zero or NaN', () => {
  assert.deepEqual(parseNumericDraft(''), { kind: 'empty' })
  assert.deepEqual(parseNumericDraft('   '), { kind: 'empty' })
})

test('incomplete input waits for more characters instead of becoming a number', () => {
  assert.deepEqual(parseNumericDraft('-'), { kind: 'incomplete' })
  assert.deepEqual(parseNumericDraft('.'), { kind: 'incomplete' })
  assert.deepEqual(parseNumericDraft(','), { kind: 'incomplete' })
  assert.deepEqual(parseNumericDraft('-.'), { kind: 'incomplete' })
})

test('invalid numeric input is rejected and never produces NaN', () => {
  assert.deepEqual(parseNumericDraft('1e5'), invalid('format'))
  assert.deepEqual(parseNumericDraft('1..2'), invalid('format'))
  assert.deepEqual(parseNumericDraft('abc'), invalid('format'))
  assert.notEqual(parseNumericDraft('١٢a').kind, 'value')
})

// ---- No silent truncation ----
test('long values are never cut after 12 characters', () => {
  assert.deepEqual(parseNumericDraft('1234567890123'), value(1234567890123))
  assert.deepEqual(parseNumericDraft('123456789012345'), value(123456789012345))
})

test('values beyond 15 digits are reported as too long, not truncated', () => {
  assert.deepEqual(parseNumericDraft('1234567890123456'), invalid('tooLong'))
})

test('the field keeps every typed digit while the user types', () => {
  const typed = '12345678901234567890'
  assert.equal(sanitizeNumericDraft(typed, typed.length).text, typed)
})

test('sanitizing keeps separators as typed; the parser decides what they mean', () => {
  assert.equal(sanitizeNumericDraft('1,000', 5).text, '1,000')
  assert.equal(sanitizeNumericDraft('1.2.3', 5).text, '1.2.3')
  assert.equal(sanitizeNumericDraft('١٬٠٠٠', 4).text, '1,000')
})

test('sanitizing drops letters and symbols', () => {
  assert.equal(sanitizeNumericDraft('12a3', 4).text, '123')
  assert.equal(sanitizeNumericDraft('Trip ١٠ ج.م', 11).text, ' 10 .')
})

test('cursor stays after the same logical character while cleaning', () => {
  assert.deepEqual(sanitizeNumericDraft('1٢3', 2), { text: '123', caret: 2 })
  assert.deepEqual(sanitizeNumericDraft('12a3', 3), { text: '123', caret: 2 })
})

test('saving and restoring a value keeps it exact', () => {
  for (const v of [22.25, 2.5, 50, 75, 0.1, 1234.5, 10, 1000]) {
    assert.equal(parseNumericDraft(formatNumericValue(v)).value, v)
  }
  assert.equal(formatNumericValue(0.1 + 0.2), '0.3')
})

test('formatting never shows NaN or Infinity', () => {
  assert.equal(formatNumericValue(null), '')
  assert.equal(formatNumericValue(undefined), '')
  assert.equal(formatNumericValue(Number.NaN), '')
  assert.equal(formatNumericValue(Number.POSITIVE_INFINITY), '')
})

test('the shared digit conversion is used by the existing number parser', () => {
  assert.equal(normalizeDigits('١٠٫٥ كم'), '10.5 كم')
})

test('text that is not numeric keeps both Arabic and English letters', () => {
  assert.equal(toAsciiDigits('Trip مشوار ١٠'), 'Trip مشوار 10')
})
