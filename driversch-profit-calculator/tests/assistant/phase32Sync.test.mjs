import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { nativeTripSettingsPayload } from '../../src/assistant/nativeSettingsSync.ts'
import { translateMessage } from '../../src/lib/i18n.ts'
import { DEFAULT_SETTINGS } from '../../src/types.ts'

test('native settings payload carries the saved values and the active provider', () => {
  const saved = { ...DEFAULT_SETTINGS, minNetProfit: 20 }
  const payload = JSON.parse(nativeTripSettingsPayload(saved, 'Uber', 'net'))
  assert.equal(payload.minNetProfit, 20)
  assert.equal(payload.activeProvider, 'uber')
  assert.equal(payload.fareMode, 'net')
})

test('native settings payload maps every known app and falls back to unknown', () => {
  assert.equal(JSON.parse(nativeTripSettingsPayload(DEFAULT_SETTINGS, 'DiDi', 'gross')).activeProvider, 'didi')
  assert.equal(JSON.parse(nativeTripSettingsPayload(DEFAULT_SETTINGS, 'inDrive', 'net')).activeProvider, 'indrive')
  assert.equal(JSON.parse(nativeTripSettingsPayload(DEFAULT_SETTINGS, 'أخرى', 'unknown')).activeProvider, 'unknown')
})

test('every native analysis reason has an English translation', () => {
  const kotlinUrl = new URL('../../../android/app/src/main/java/com/driverprofitcalculator/app/capture/TripOfferAnalyzer.kt', import.meta.url)
  const source = readFileSync(kotlinUrl, 'utf8')
  const reasons = [...source.matchAll(/reason = "([^"]+)"/g)].map(match => match[1])
  assert.equal(reasons.length, 4, 'expected four native reason strings')
  for (const reason of reasons) {
    const english = translateMessage(reason, 'en')
    assert.notEqual(english, reason, `missing English translation for: ${reason}`)
    assert.match(english, /^[\x00-\x7F]+$/, 'English translation must be ASCII')
  }
})
