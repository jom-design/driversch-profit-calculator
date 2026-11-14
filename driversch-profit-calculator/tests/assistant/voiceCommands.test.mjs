import test from 'node:test'
import assert from 'node:assert/strict'
import { parseVoiceCommand, normalizeArabicSpeech } from '../../src/assistant/voice/voiceCommands.ts'

test('recognises the calculator command in common phrasings', () => {
  assert.equal(parseVoiceCommand('احسب المشوار').intent, 'calculate')
  assert.equal(parseVoiceCommand('احسب صافي ربح رحلة').intent, 'calculate')
  assert.equal(parseVoiceCommand('حساب الرحلة').intent, 'calculate')
})

test('recognises the last trip command with and without hamza', () => {
  assert.equal(parseVoiceCommand('اعرض آخر رحلة').intent, 'last-trip')
  assert.equal(parseVoiceCommand('اعرض اخر رحلة').intent, 'last-trip')
})

test('opens the trip inbox', () => {
  assert.equal(parseVoiceCommand('افتح صندوق الرحلات').intent, 'open-inbox')
  assert.equal(parseVoiceCommand('صندوق').intent, 'open-inbox')
})

test('lists unconfirmed offers, including the definite form', () => {
  assert.equal(parseVoiceCommand('اعرض الرحلات غير المؤكدة').intent, 'unconfirmed-offers')
  assert.equal(parseVoiceCommand('اعرض العروض الغير مؤكدة').intent, 'unconfirmed-offers')
  assert.equal(parseVoiceCommand('مش متأكد من العرض').intent, 'unconfirmed-offers')
})

test('starts a review', () => {
  assert.equal(parseVoiceCommand('ابدأ مراجعة').intent, 'start-review')
  assert.equal(parseVoiceCommand('ابدا مراجعه').intent, 'start-review')
  assert.equal(parseVoiceCommand('راجع رحلة').intent, 'start-review')
})

test('cancels the current command', () => {
  assert.equal(parseVoiceCommand('إلغاء').intent, 'cancel')
  assert.equal(parseVoiceCommand('الغاء').intent, 'cancel')
  assert.equal(parseVoiceCommand('الغ').intent, 'cancel')
})

test('does not treat the word الغير as a cancel command', () => {
  assert.equal(parseVoiceCommand('الغير مؤكدة').intent, 'unconfirmed-offers')
})

test('an explicit last-trip request wins over the calculator word', () => {
  assert.equal(parseVoiceCommand('احسب آخر رحلة').intent, 'last-trip')
})

test('ignores tashkeel and punctuation', () => {
  assert.equal(parseVoiceCommand('احْسُبِ!').intent, 'calculate')
  assert.equal(parseVoiceCommand('افتح، صندوق الرحلات.').intent, 'open-inbox')
})

test('does not match partial words', () => {
  assert.equal(parseVoiceCommand('احسبها').intent, 'unknown')
})

test('returns unknown for empty or unrelated speech', () => {
  assert.deepEqual(parseVoiceCommand(''), { intent: 'unknown', normalized: '' })
  assert.deepEqual(parseVoiceCommand('   ').intent, 'unknown')
  assert.equal(parseVoiceCommand('مرحبا يا صاحبي').intent, 'unknown')
})

test('normalises alef, ya, ta marbuta, diacritics and Arabic digits', () => {
  assert.equal(normalizeArabicSpeech('إِلغَاءُ'), 'الغاء')
  assert.equal(normalizeArabicSpeech('مدرسة ى'), 'مدرسه ي')
  assert.equal(normalizeArabicSpeech('رحلة ٣٠'), 'رحله 30')
})
