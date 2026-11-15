import test from 'node:test'
import assert from 'node:assert/strict'
import { planBackupReplacement } from '../src/lib/backupPlan.ts'
import { validateBackupSettings } from '../src/lib/backupSettings.ts'
import { calculateTrip } from '../src/lib/calculator.ts'
import { DEFAULT_SETTINGS, EMPTY_TRIP } from '../src/types.ts'

// All trip and settings values here are synthetic test inputs.
const settings = () => ({ ...DEFAULT_SETTINGS, commission: { ...DEFAULT_SETTINGS.commission } })
const trip = (id, patch = {}) => ({
  ...EMPTY_TRIP,
  ...calculateTrip({ ...EMPTY_TRIP, ...patch }, DEFAULT_SETTINGS),
  id,
  createdAt: '2026-11-14T00:00:00.000Z',
  ...patch,
})

test('a valid backup yields a plan with every trip recalculated from its inputs', () => {
  const stored = trip('t1', { fare: 200 })
  // A forged derived value in the file must not survive: the plan recalculates from the inputs.
  const forged = { ...stored, netProfit: 999999 }
  const plan = planBackupReplacement([forged], settings())
  assert.equal(plan.ok, true)
  assert.equal(plan.trips[0].netProfit, calculateTrip(stored, DEFAULT_SETTINGS).netProfit)
  assert.equal(plan.trips[0].isValid, true)
})

test('an empty trip list with valid settings is a valid plan that clears the history', () => {
  const plan = planBackupReplacement([], settings())
  assert.equal(plan.ok, true)
  assert.deepEqual(plan.trips, [])
})

test('invalid settings refuse the whole backup and say that nothing changed', () => {
  const plan = planBackupReplacement([trip('t1')], { ...settings(), fuelPrice: '22.25' })
  assert.equal(plan.ok, false)
  assert.match(plan.reason, /لم يتم أي تغيير/)
})

test('settings with a missing commission map are refused, not repaired with defaults', () => {
  const { commission, ...withoutCommission } = settings()
  assert.equal(planBackupReplacement([], withoutCommission).ok, false)
})

test('one invalid trip refuses the whole backup, even when the others are valid', () => {
  const plan = planBackupReplacement([trip('ok-1'), trip('bad', { totalMinutes: 0 })], settings())
  assert.equal(plan.ok, false)
})

test('duplicate trip ids refuse the backup instead of silently overwriting a trip', () => {
  const plan = planBackupReplacement([trip('same'), trip('same', { fare: 150 })], settings())
  assert.equal(plan.ok, false)
  assert.match(plan.reason, /مكررة/)
})

test('a non-array trip list is refused', () => {
  assert.equal(planBackupReplacement({ 0: trip('t1') }, settings()).ok, false)
  assert.equal(planBackupReplacement(null, settings()).ok, false)
})

test('a 30-second trip is accepted when every other input is valid', () => {
  const plan = planBackupReplacement([trip('short', { totalMinutes: 0.5 })], settings())
  assert.equal(plan.ok, true)
})

test('zero and negative durations are refused in a backup', () => {
  assert.equal(planBackupReplacement([trip('z', { totalMinutes: 0 })], settings()).ok, false)
  assert.equal(planBackupReplacement([trip('n', { totalMinutes: -1 })], settings()).ok, false)
})

test('a legacy trip without the isValid flag is accepted and recalculated', () => {
  const { isValid, validationErrors, ...legacy } = trip('legacy')
  const plan = planBackupReplacement([legacy], settings())
  assert.equal(plan.ok, true)
  assert.equal(plan.trips[0].isValid, true)
})

test('the settings in the plan contain exactly the known keys, never extra fields from the file', () => {
  const check = validateBackupSettings({ ...settings(), injected: 'x', __proto__Probe: 1 })
  assert.equal(check.ok, true)
  assert.deepEqual(Object.keys(check.value).sort(), ['commission', 'consumptionPer100', 'fuelPrice', 'hourlyTarget', 'maintenancePerKm', 'minNetProfit'])
})

test('settings validation: numeric text, NaN, negatives and out-of-range values are refused', () => {
  assert.equal(validateBackupSettings({ ...settings(), fuelPrice: '22.25' }).ok, false)
  assert.equal(validateBackupSettings({ ...settings(), fuelPrice: Number.NaN }).ok, false)
  assert.equal(validateBackupSettings({ ...settings(), fuelPrice: Number.POSITIVE_INFINITY }).ok, false)
  assert.equal(validateBackupSettings({ ...settings(), fuelPrice: 0 }).ok, false)
  assert.equal(validateBackupSettings({ ...settings(), consumptionPer100: -1 }).ok, false)
  assert.equal(validateBackupSettings({ ...settings(), consumptionPer100: 101 }).ok, false)
  assert.equal(validateBackupSettings({ ...settings(), minNetProfit: -5 }).ok, false)
  assert.equal(validateBackupSettings({ ...settings(), hourlyTarget: 1_000_001 }).ok, false)
  assert.equal(validateBackupSettings({ ...settings(), maintenancePerKm: 0 }).ok, true)
})

test('settings validation: commission must be a percentage from 0 up to but not including 100', () => {
  const withCommission = (value) => ({ ...settings(), commission: { ...settings().commission, DiDi: value } })
  assert.equal(validateBackupSettings(withCommission(0)).ok, true)
  assert.equal(validateBackupSettings(withCommission(99.5)).ok, true)
  assert.equal(validateBackupSettings(withCommission(100)).ok, false)
  assert.equal(validateBackupSettings(withCommission(-1)).ok, false)
  assert.equal(validateBackupSettings(withCommission(Number.NaN)).ok, false)
  assert.equal(validateBackupSettings(withCommission('12')).ok, false)
})

test('settings validation: a missing commission platform is refused, not defaulted', () => {
  const { inDrive, ...partial } = settings().commission
  assert.equal(validateBackupSettings({ ...settings(), commission: partial }).ok, false)
})
