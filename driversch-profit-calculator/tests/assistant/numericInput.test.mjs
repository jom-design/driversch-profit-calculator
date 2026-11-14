import test from 'node:test'
import assert from 'node:assert/strict'
import { toAsciiDigits, sanitizeNumericDraft, parseNumericDraft, formatNumericValue } from '../../src/lib/numericInput.ts'
import { normalizeDigits } from '../../src/lib/numberParser.ts'

test('English digits are accepted unchanged', () => {
  assert.deepEqual(parseNumericDraft('0123456789'), { kind: 'value', value: 123456789 })
})

test('Arabic-Indic digits convert to the same numbers', () => {
  assert.equal(toAsciiDigits('٠١٢٣٤٥٦٧٨٩'), '0123456789')
  assert.deepEqual(parseNumericDraft('١٠'), { kind: 'value', value: 10 })
})

test('Persian digits convert to the same numbers', () => {
  assert.equal(toAsciiDigits('۰۱۲۳۴۵۶۷۸۹'), '0123456789')
  assert.deepEqual(parseNumericDraft('۱۲'), { kind: 'value', value: 12 })
})

test('decimal values work with dot, Arabic decimal separator and comma', () => {
  assert.deepEqual(parseNumericDraft('22.25'), { kind: 'value', value: 22.25 })
  assert.deepEqual(parseNumericDraft('٢٢٫٢٥'), { kind: 'value', value: 22.25 })
  assert.deepEqual(parseNumericDraft('1,5'), { kind: 'value', value: 1.5 })
  assert.deepEqual(parseNumericDraft('1.'), { kind: 'value', value: 1 })
  assert.deepEqual(parseNumericDraft('.5'), { kind: 'value', value: 0.5 })
})

test('negative values are parsed when they are valid', () => {
  assert.deepEqual(parseNumericDraft('-2.5'), { kind: 'value', value: -2.5 })
  assert.deepEqual(parseNumericDraft('−٣'), { kind: 'value', value: -3 })
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
  assert.deepEqual(parseNumericDraft('-.'), { kind: 'incomplete' })
})

test('invalid numeric input is rejected and never produces NaN', () => {
  assert.deepEqual(parseNumericDraft('abc'), { kind: 'invalid' })
  assert.deepEqual(parseNumericDraft('1e5'), { kind: 'invalid' })
  assert.deepEqual(parseNumericDraft('1..2'), { kind: 'invalid' })
  assert.notEqual(parseNumericDraft('١٢a').kind, 'value')
})

test('sanitizing removes letters, spaces, thousands separators and extra dots', () => {
  assert.equal(sanitizeNumericDraft('1 000.5.2 ج.م', 14).text, '1000.52')
  assert.equal(sanitizeNumericDraft('١٬٠٠٠', 4).text, '1000')
})

test('sanitizing respects the length limit', () => {
  assert.equal(sanitizeNumericDraft('1234567890123456', 16, { maxLength: 12 }).text, '123456789012')
})

test('cursor stays after the same logical character while cleaning', () => {
  // typing an Arabic digit in the middle: caret lands after the converted digit
  assert.deepEqual(sanitizeNumericDraft('1٢3', 2), { text: '123', caret: 2 })
  // a dropped letter before the caret moves the caret back by one
  assert.deepEqual(sanitizeNumericDraft('12a3', 3), { text: '123', caret: 2 })
  // a second dot is dropped and the caret follows the kept text
  assert.deepEqual(sanitizeNumericDraft('1.2.3', 5), { text: '1.23', caret: 4 })
})

test('saving and restoring a value keeps it exact', () => {
  for (const value of [22.25, 2.5, 50, 75, 0.1, 1234.5, 10]) {
    const text = formatNumericValue(value)
    assert.equal(parseNumericDraft(text).value, value)
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
