import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { AR_TO_EN } from '../../src/lib/i18n.ts'
import { fileURLToPath } from 'node:url'
import {
  analysisTone,
  missingFieldLabels,
  MISSING_FIELD_LABELS,
  RECOMMENDATION_LABELS,
  validateNativeAnalysis
} from '../../src/assistant/nativeAnalysis.ts'

const full = {
  recommendation: 'accept', netProfit: 81.87, hourlyProfit: 163.74, totalCost: 118.13, requiredFare: 125,
  partialCost: null, missingFields: [], reason: 'ok', payloadVerified: false
}
const insufficient = {
  recommendation: 'insufficient_data', netProfit: null, hourlyProfit: null, totalCost: null, requiredFare: null,
  partialCost: 94.5, missingFields: ['returnDistance', 'extraExpenses'], reason: 'insufficient', payloadVerified: false
}

test('accepts a complete analysis and keeps net profit as a number', () => {
  const result = validateNativeAnalysis(full)
  assert.equal(result?.netProfit, 81.87)
  assert.equal(result?.recommendation, 'accept')
})

test('accepts insufficient data only when net profit is unavailable', () => {
  const result = validateNativeAnalysis(insufficient)
  assert.equal(result?.netProfit, null)
  assert.equal(result?.partialCost, 94.5)
})

test('refuses a net profit whose recommendation says the data is insufficient', () => {
  assert.equal(validateNativeAnalysis({ ...insufficient, netProfit: 40 }), undefined)
})

test('refuses a recommendation without a net profit', () => {
  assert.equal(validateNativeAnalysis({ ...full, netProfit: null }), undefined)
})

test('refuses unknown recommendations, non-finite numbers, and oversized text', () => {
  assert.equal(validateNativeAnalysis({ ...full, recommendation: 'auto_accept' }), undefined)
  assert.equal(validateNativeAnalysis({ ...full, totalCost: Number.NaN }), undefined)
  assert.equal(validateNativeAnalysis({ ...full, totalCost: -1 }), undefined)
  assert.equal(validateNativeAnalysis({ ...full, reason: 'x'.repeat(301) }), undefined)
  assert.equal(validateNativeAnalysis({ ...full, missingFields: 'fare' }), undefined)
  assert.equal(validateNativeAnalysis(null), undefined)
})

test('tone is positive for accept, negative for reject, neutral for review, and insufficient without profit', () => {
  assert.equal(analysisTone(validateNativeAnalysis(full)), 'positive')
  assert.equal(analysisTone(validateNativeAnalysis({ ...full, recommendation: 'reject', netProfit: 1.87 })), 'negative')
  assert.equal(analysisTone(validateNativeAnalysis({ ...full, recommendation: 'review' })), 'neutral')
  assert.equal(analysisTone(validateNativeAnalysis(insufficient)), 'insufficient')
  assert.equal(analysisTone(undefined), 'insufficient')
})

test('missing fields are shown as Arabic labels without duplicates', () => {
  const labels = missingFieldLabels(validateNativeAnalysis({ ...insufficient, missingFields: ['fare', 'fare', 'returnDistance'] }))
  assert.deepEqual(labels, ['الأجرة', 'مسافة العودة'])
})

test('every missing-input code emitted by the Kotlin analyzer has an Arabic label', () => {
  const source = readFileSync(fileURLToPath(new URL(
    '../../../android/app/src/main/java/com/driverprofitcalculator/app/capture/TripOfferAnalyzer.kt', import.meta.url)), 'utf8')
  const codes = new Set([
    ...[...source.matchAll(/missing \+= "(\w+)"/g)].map(match => match[1]),
    ...[...source.matchAll(/listOf\("(\w+)"\)/g)].map(match => match[1]),
    ...[...source.matchAll(/-> missing \+= "(\w+)"/g)].map(match => match[1])
  ])
  assert.ok(codes.size >= 10, 'expected the analyzer to declare its missing-input codes')
  for (const code of codes) {
    assert.ok(MISSING_FIELD_LABELS[code], `no Arabic label for analyzer code "${code}"`)
  }
})

test('every label the native analysis can produce is a bilingual dictionary key', () => {
  for (const label of [...Object.values(MISSING_FIELD_LABELS), ...Object.values(RECOMMENDATION_LABELS), 'بيانات أخرى']) {
    assert.ok(AR_TO_EN[label], `missing dictionary key: ${label}`)
  }
})
