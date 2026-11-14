import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateTrip } from '../../src/lib/calculator.ts'
import { DEFAULT_SETTINGS, EMPTY_TRIP } from '../../src/types.ts'
import { normalizeBackup, normalizeSettings } from '../../src/lib/backupImport.ts'
import { mergeStoredSettings } from '../../src/lib/settingsMerge.ts'
import { parseNumericDraft } from '../../src/lib/numericInput.ts'

// Controlled test percentages only: these are not real platform rates.
const withCommission = (app, percent) => ({
  ...EMPTY_TRIP, app, fare: 100, fareMode: 'gross', commissionRate: percent
})
// The platform selector copies settings.commission[app] into commissionRate. Mirror that here.
const forApp = (app, settings) => withCommission(app, settings.commission[app] ?? 0)
const settingsWith = (commission) => ({ ...DEFAULT_SETTINGS, commission: { ...DEFAULT_SETTINGS.commission, ...commission } })

test('the default Uber commission is 0 and documented as a placeholder', () => {
  assert.equal(DEFAULT_SETTINGS.commission.Uber, 0)
})

test('each platform uses its own commission only', () => {
  const s = settingsWith({ Uber: 10, inDrive: 15, DiDi: 20, 'أخرى': 5 })
  assert.equal(calculateTrip(forApp('Uber', s), s).netFare, 90)
  assert.equal(calculateTrip(forApp('inDrive', s), s).netFare, 85)
  assert.equal(calculateTrip(forApp('DiDi', s), s).netFare, 80)
  assert.equal(calculateTrip(forApp('أخرى', s), s).netFare, 95)
})

test('changing Uber does not change the other platforms', () => {
  const before = settingsWith({ Uber: 10, inDrive: 15, DiDi: 20, 'أخرى': 5 })
  const after = settingsWith({ Uber: 30, inDrive: 15, DiDi: 20, 'أخرى': 5 })
  assert.equal(calculateTrip(forApp('inDrive', after), after).netFare, calculateTrip(forApp('inDrive', before), before).netFare)
  assert.equal(calculateTrip(forApp('DiDi', after), after).netFare, 80)
  assert.equal(calculateTrip(forApp('أخرى', after), after).netFare, 95)
  assert.equal(calculateTrip(forApp('Uber', after), after).netFare, 70)
})

test('changing Other does not change Uber, and Other is never copied into Uber', () => {
  const s = settingsWith({ Uber: 0, 'أخرى': 25 })
  assert.equal(s.commission.Uber, 0)
  assert.equal(calculateTrip(forApp('Uber', s), s).netFare, 100)
  assert.equal(calculateTrip(forApp('أخرى', s), s).netFare, 75)
})

test('existing saved settings without an Uber key migrate with Uber at 0 and keep Other intact', () => {
  const stored = { fuelPrice: 23, commission: { inDrive: 12, DiDi: 8, 'أخرى': 7 } }
  const merged = mergeStoredSettings(stored)
  assert.equal(merged.commission.Uber, 0)
  assert.equal(merged.commission['أخرى'], 7)
  assert.equal(merged.commission.inDrive, 12)
  assert.equal(merged.commission.DiDi, 8)
  assert.equal(merged.fuelPrice, 23)
  assert.equal(merged.hourlyTarget, DEFAULT_SETTINGS.hourlyTarget)
})

test('no stored settings returns the full defaults', () => {
  assert.deepEqual(mergeStoredSettings(undefined), DEFAULT_SETTINGS)
  assert.deepEqual(mergeStoredSettings(null), DEFAULT_SETTINGS)
})

test('an old backup without Uber imports, with Uber at 0 and the other commissions kept', () => {
  const old = { schemaVersion: 1, settings: { ...DEFAULT_SETTINGS, commission: { inDrive: 12, DiDi: 8, 'أخرى': 7 } }, trips: [] }
  const result = normalizeBackup(JSON.parse(JSON.stringify(old)), DEFAULT_SETTINGS)
  assert.equal(result.ok, true)
  assert.equal(result.value.settings.commission.Uber, 0)
  assert.equal(result.value.settings.commission['أخرى'], 7)
})

test('a new backup keeps all four commissions through export and import', () => {
  const s = settingsWith({ Uber: 11, inDrive: 22, DiDi: 33, 'أخرى': 44 })
  const exported = JSON.parse(JSON.stringify({ schemaVersion: 1, settings: s, trips: [] }))
  const restored = normalizeBackup(exported, DEFAULT_SETTINGS)
  assert.equal(restored.ok, true)
  assert.deepEqual(restored.value.settings.commission, { Uber: 11, inDrive: 22, DiDi: 33, 'أخرى': 44 })
})

test('Arabic-Indic and Persian commission text give the same values', () => {
  const arabic = normalizeSettings({ commission: { Uber: '١٠', inDrive: '١٥٫٥', DiDi: '٢٠', 'أخرى': '٥' } }, DEFAULT_SETTINGS)
  const ascii = normalizeSettings({ commission: { Uber: '10', inDrive: '15.5', DiDi: '20', 'أخرى': '5' } }, DEFAULT_SETTINGS)
  const persian = normalizeSettings({ commission: { Uber: '۱۰', inDrive: '۱۵٫۵', DiDi: '۲۰', 'أخرى': '۵' } }, DEFAULT_SETTINGS)
  assert.deepEqual(arabic.value.commission, ascii.value.commission)
  assert.deepEqual(persian.value.commission, ascii.value.commission)
  const a = calculateTrip(forApp('inDrive', arabic.value), arabic.value)
  const b = calculateTrip(forApp('inDrive', ascii.value), ascii.value)
  assert.deepEqual(a, b)
})

test('an invalid or out-of-range Uber commission is refused and does not change settings', () => {
  assert.equal(normalizeSettings({ commission: { Uber: 'abc' } }, DEFAULT_SETTINGS).ok, false)
  assert.equal(normalizeSettings({ commission: { Uber: 150 } }, DEFAULT_SETTINGS).ok, false)
  assert.equal(normalizeSettings({ commission: { Uber: -5 } }, DEFAULT_SETTINGS).ok, false)
})

test('the 10% on 100 example works with Arabic digits for Uber', () => {
  const s = settingsWith({ Uber: parseNumericDraft('١٠').value })
  const result = calculateTrip(forApp('Uber', s), s)
  assert.equal(100 - result.netFare, 10)
  assert.equal(result.netFare, 90)
})
