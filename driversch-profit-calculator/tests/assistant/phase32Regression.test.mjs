import test from 'node:test'
import assert from 'node:assert/strict'
import { isNativePayloadShape, acceptNativeNotification } from '../../src/assistant/notificationBridge.ts'
import { validateNativeAnalysis, userDefaultLabels } from '../../src/assistant/nativeAnalysis.ts'
import { mergeStoredSettings } from '../../src/lib/settingsMerge.ts'
import { normalizeSettings } from '../../src/lib/backupImport.ts'
import { DEFAULT_SETTINGS } from '../../src/types.ts'

// All notification values here are SYNTHETIC.
const now = new Date('2026-11-15T12:00:00.000Z').toISOString()
const offerPayload = (patch = {}) => ({
  notificationId: 'synthetic-1',
  packageName: 'com.ubercab.driver',
  title: '',
  text: '',
  postedAt: now,
  offer: { fare: { value: 200, confidence: 0.9, evidence: [], status: 'candidate' } },
  ...patch,
})
const analysis = (patch = {}) => ({
  recommendation: 'review', netProfit: 54.25, hourlyProfit: 40, totalCost: 118.13, requiredFare: 180,
  partialCost: null, missingFields: [], reason: 'synthetic', payloadVerified: false, ...patch,
})

// Regression: analysed offers arrive with empty title and text, and the panel used to drop them.
test('an analysed offer with empty title and text is a valid payload shape', () => {
  assert.equal(isNativePayloadShape(offerPayload()), true)
})

test('a payload with empty text and no offer is not a valid shape', () => {
  assert.equal(isNativePayloadShape(offerPayload({ offer: undefined })), false)
})

test('an unsupported or prototype-named package is refused', () => {
  assert.equal(isNativePayloadShape(offerPayload({ packageName: 'com.example.other' })), false)
  assert.equal(isNativePayloadShape(offerPayload({ packageName: 'constructor' })), false)
  assert.equal(isNativePayloadShape(offerPayload({ packageName: 'toString' })), false)
})

test('the bridge accepts the same analysed offer the panel now accepts', () => {
  const item = acceptNativeNotification(offerPayload(), new Set(), new Date(now))
  assert.notEqual(item, null)
})

test('a duplicate notification id is still refused by the bridge', () => {
  const seen = new Set(['synthetic-1'])
  assert.equal(acceptNativeNotification(offerPayload(), seen, new Date(now)), null)
})

// userDefaults: which inputs came from the driver's saved settings.
test('an analysis without userDefaults is valid, with an empty list', () => {
  const validated = validateNativeAnalysis(analysis())
  assert.deepEqual(validated.userDefaults, [])
})

test('userDefaults are kept when present', () => {
  const validated = validateNativeAnalysis(analysis({ userDefaults: ['returnDistance', 'extraExpenses'] }))
  assert.deepEqual(validated.userDefaults, ['returnDistance', 'extraExpenses'])
  assert.deepEqual(userDefaultLabels(validated), ['مسافة العودة', 'المصروفات الإضافية'])
})

test('a malformed userDefaults value refuses the analysis instead of displaying it', () => {
  assert.equal(validateNativeAnalysis(analysis({ userDefaults: 'returnDistance' })), undefined)
  assert.equal(validateNativeAnalysis(analysis({ userDefaults: [42] })), undefined)
})

// Default settings: unset stays null, never zero.
test('stored optional defaults stay null when unset, and invalid stored values become null', () => {
  assert.equal(mergeStoredSettings({}).defaultReturnKm, null)
  assert.equal(mergeStoredSettings({ defaultReturnKm: 'abc' }).defaultReturnKm, null)
  assert.equal(mergeStoredSettings({ defaultReturnKm: -1 }).defaultReturnKm, null)
  assert.equal(mergeStoredSettings({ defaultExtraExpenses: Number.NaN }).defaultExtraExpenses, null)
})

test('corrupted persisted numeric settings and commission rates fall back to safe defaults', () => {
  const merged = mergeStoredSettings({
    fuelPrice: Number.NaN,
    consumptionPer100: '10',
    maintenancePerKm: -1,
    minNetProfit: Number.POSITIVE_INFINITY,
    hourlyTarget: 90,
    commission: { Uber: 120, DiDi: Number.NaN, inDrive: 15, 'أخرى': -1 }
  })
  assert.equal(merged.fuelPrice, DEFAULT_SETTINGS.fuelPrice)
  assert.equal(merged.consumptionPer100, DEFAULT_SETTINGS.consumptionPer100)
  assert.equal(merged.maintenancePerKm, DEFAULT_SETTINGS.maintenancePerKm)
  assert.equal(merged.minNetProfit, DEFAULT_SETTINGS.minNetProfit)
  assert.equal(merged.hourlyTarget, 90)
  assert.equal(merged.commission.Uber, DEFAULT_SETTINGS.commission.Uber)
  assert.equal(merged.commission.DiDi, DEFAULT_SETTINGS.commission.DiDi)
  assert.equal(merged.commission.inDrive, 15)
  assert.equal(merged.commission['أخرى'], DEFAULT_SETTINGS.commission['أخرى'])
})

test('an explicit zero stored default is kept as zero, not treated as unset', () => {
  assert.equal(mergeStoredSettings({ defaultReturnKm: 0 }).defaultReturnKm, 0)
  assert.equal(mergeStoredSettings({ defaultExtraExpenses: 0 }).defaultExtraExpenses, 0)
})

test('a backup accepts null optional defaults and a valid number, and refuses text', () => {
  const nullable = normalizeSettings({ ...DEFAULT_SETTINGS, defaultReturnKm: null, defaultExtraExpenses: null }, DEFAULT_SETTINGS)
  assert.equal(nullable.ok, true)
  assert.equal(nullable.value.defaultReturnKm, null)
  const numeric = normalizeSettings({ ...DEFAULT_SETTINGS, defaultReturnKm: 12 }, DEFAULT_SETTINGS)
  assert.equal(numeric.value.defaultReturnKm, 12)
  assert.equal(normalizeSettings({ ...DEFAULT_SETTINGS, defaultReturnKm: 'x' }, DEFAULT_SETTINGS).ok, false)
})
