import test from 'node:test'
import assert from 'node:assert/strict'
import { assessStoredTrip, prepareImportedTrip, prepareSavedTrip, readStoredTrip, snapshotOf } from '../src/lib/persistence.ts'
import { calculateTrip } from '../src/lib/calculator.ts'
import { DEFAULT_SETTINGS, EMPTY_TRIP } from '../src/types.ts'

// All values are synthetic. "Legacy" means saved before settingsSnapshot existed.
const OTHER_SETTINGS = { ...DEFAULT_SETTINGS, fuelPrice: 30, minNetProfit: 10, commission: { ...DEFAULT_SETTINGS.commission } }
const base = (patch = {}) => ({ ...EMPTY_TRIP, id: 'h-1', createdAt: '2026-11-14T00:00:00.000Z', ...patch })
const withoutSnapshot = (trip) => {
  const { settingsSnapshot, ...rest } = trip
  return rest
}

test('a new trip stores the settings it was calculated with', () => {
  const saved = prepareSavedTrip(base(), DEFAULT_SETTINGS)
  assert.deepEqual(saved.settingsSnapshot, snapshotOf(DEFAULT_SETTINGS))
})

test('a trip with a snapshot is verified from its own settings, even after current settings change', () => {
  const saved = prepareSavedTrip(base(), DEFAULT_SETTINGS)
  // Assessment never reads the current settings; it uses only the record's own snapshot.
  assert.equal(assessStoredTrip(saved), 'verified')
  assert.equal(readStoredTrip(saved).integrity, 'verified')
  assert.notEqual(saved.settingsSnapshot.fuelPrice, OTHER_SETTINGS.fuelPrice)
})

test('a snapshot that does not reproduce the stored results is flagged as a mismatch, not trusted', () => {
  const saved = prepareSavedTrip(base(), DEFAULT_SETTINGS)
  assert.equal(readStoredTrip({ ...saved, netProfit: 999999 }).integrity, 'mismatch')
})

test('a legacy record without a snapshot is shown as recorded and labelled unverified', () => {
  const legacy = withoutSnapshot(prepareSavedTrip(base(), DEFAULT_SETTINGS))
  const shown = readStoredTrip({ ...legacy, netProfit: 12345 })
  assert.equal(shown.integrity, 'legacy-unverified')
  // The recorded value is kept as recorded. It is not replaced with a recalculation.
  assert.equal(shown.netProfit, 12345)
})

test('a zero-duration historical record is kept with a not-recalculable status, not hidden', () => {
  const historical = withoutSnapshot({ ...prepareSavedTrip(base(), DEFAULT_SETTINGS), totalMinutes: 0 })
  const shown = readStoredTrip(historical)
  assert.ok(shown)
  assert.equal(shown.integrity, 'not-recalculable')
  assert.equal(shown.totalMinutes, 0)
})

test('a zero-duration record with a snapshot is still not-recalculable', () => {
  const historical = { ...prepareSavedTrip(base(), DEFAULT_SETTINGS), totalMinutes: 0 }
  assert.equal(assessStoredTrip(historical), 'not-recalculable')
})

const legacyWithMinutes = (totalMinutes) => withoutSnapshot({ ...prepareSavedTrip(base(), DEFAULT_SETTINGS), totalMinutes })

test('a subnormal or over-24-hour duration is not-recalculable, and remains visible', () => {
  assert.equal(readStoredTrip(legacyWithMinutes(Number.MIN_VALUE))?.integrity, 'not-recalculable')
  assert.equal(readStoredTrip(legacyWithMinutes(1441))?.integrity, 'not-recalculable')
})

test('a negative or non-finite duration is unreadable and is not shown as history', () => {
  assert.equal(readStoredTrip(legacyWithMinutes(-1)), null)
  assert.equal(readStoredTrip(legacyWithMinutes(Number.NaN)), null)
})

test('a malformed snapshot cannot verify a record, so the record is legacy-unverified', () => {
  const saved = prepareSavedTrip(base(), DEFAULT_SETTINGS)
  assert.equal(assessStoredTrip({ ...saved, settingsSnapshot: { ...saved.settingsSnapshot, fuelPrice: Number.NaN } }), 'legacy-unverified')
})

test('an unreadable record (non-numeric fare) returns null from readStoredTrip', () => {
  assert.equal(readStoredTrip(withoutSnapshot({ ...prepareSavedTrip(base(), DEFAULT_SETTINGS), fare: 'abc' })), null)
})

test('an imported record keeps its recorded values and does not take the backup settings', () => {
  const saved = prepareSavedTrip(base(), DEFAULT_SETTINGS)
  const forgedLegacy = withoutSnapshot({ ...saved, netProfit: 777 })
  const imported = prepareImportedTrip(forgedLegacy)
  assert.equal(imported.netProfit, 777)
  assert.equal(imported.settingsSnapshot, undefined)
})

test('an imported record drops any integrity field that came from an export', () => {
  const saved = prepareSavedTrip(base(), DEFAULT_SETTINGS)
  const imported = prepareImportedTrip({ ...saved, integrity: 'verified' })
  assert.equal('integrity' in imported, false)
})

test('an imported record with a snapshot keeps its own snapshot unchanged', () => {
  const saved = prepareSavedTrip(base(), DEFAULT_SETTINGS)
  assert.deepEqual(prepareImportedTrip(saved).settingsSnapshot, saved.settingsSnapshot)
})

test('recalculating a snapshot record with its own settings reproduces the stored results', () => {
  const saved = prepareSavedTrip(base({ fare: 200, totalMinutes: 30 }), DEFAULT_SETTINGS)
  const again = calculateTrip(saved, saved.settingsSnapshot)
  assert.equal(again.netProfit, saved.netProfit)
  assert.equal(again.decision, saved.decision)
})
