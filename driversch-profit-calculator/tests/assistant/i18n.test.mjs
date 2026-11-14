import test from 'node:test'
import assert from 'node:assert/strict'
import { translateText } from '../../src/lib/i18n.ts'

test('central locale dictionary translates key calculator navigation in both directions', () => {
  assert.equal(translateText('حاسبة المشوار', 'en'), 'Trip Calculator')
  assert.equal(translateText('Trip Calculator', 'ar'), 'حاسبة المشوار')
})

test('locale translation preserves unknown content and mixed platform names', () => {
  assert.equal(translateText('Uber', 'en'), 'Uber')
  assert.equal(translateText('Uber commission ١٥٪', 'en'), 'Uber commission ١٥٪')
})

test('translation preserves surrounding whitespace', () => {
  assert.equal(translateText('  الإعدادات  ', 'en'), '  Settings  ')
})
