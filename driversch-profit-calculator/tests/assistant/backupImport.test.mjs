import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeBackup, normalizeTrip, readBackupNumber } from '../../src/lib/backupImport.ts'
import { DEFAULT_SETTINGS } from '../../src/types.ts'
import { calculateTrip } from '../../src/lib/calculator.ts'

const trip = (overrides = {}) => ({
  id: 't1', createdAt: '2026-11-14T10:00:00.000Z', app: 'Uber', fare: 165, fareMode: 'net', commissionRate: 0,
  pickupKm: 1, passengerKm: 20, returnKm: 1, totalMinutes: 40, extraExpenses: 0, notes: 'مشوار Good trip',
  totalKm: 22, fuelCost: 48.95, maintenanceCost: 55, totalCost: 103.95, netFare: 165, netProfit: 61.05,
  hourlyProfit: 91.58, requiredFare: 153.95, fareGap: -11.05, decision: 'accept', decisionReason: 'ok', ...overrides
})
const backup = (settings, trips) => ({ schemaVersion: 1, exportedAt: '2026-11-14T10:00:00.000Z', settings, trips })

test('numbers in Arabic-Indic and Persian digits are read as the same values', () => {
  assert.equal(readBackupNumber('٢٢٫٥', { allowNegative: false }), 22.5)
  assert.equal(readBackupNumber('۲۲.۵', { allowNegative: false }), 22.5)
  assert.equal(readBackupNumber(22.5, { allowNegative: false }), 22.5)
})

test('invalid and negative values are rejected instead of becoming NaN', () => {
  assert.equal(readBackupNumber('abc', { allowNegative: false }), null)
  assert.equal(readBackupNumber('', { allowNegative: false }), null)
  assert.equal(readBackupNumber(Number.NaN, { allowNegative: false }), null)
  assert.equal(readBackupNumber(-5, { allowNegative: false }), null)
  assert.equal(readBackupNumber(-5, { allowNegative: true }), -5)
})

test('an imported backup with Arabic digits restores settings that calculate correctly', () => {
  const result = normalizeBackup(backup({ ...DEFAULT_SETTINGS, fuelPrice: '٢٢٫٢٥', hourlyTarget: '٧٥' }, []), DEFAULT_SETTINGS)
  assert.equal(result.ok, true)
  assert.equal(result.value.settings.fuelPrice, 22.25)
  assert.equal(result.value.settings.hourlyTarget, 75)
  const sample = { app: 'Uber', fare: 165, fareMode: 'net', commissionRate: 0, pickupKm: 1, passengerKm: 20, returnKm: 1, totalMinutes: 40, extraExpenses: 0, notes: '' }
  const fromBackup = calculateTrip(sample, result.value.settings)
  const direct = calculateTrip(sample, DEFAULT_SETTINGS)
  assert.deepEqual(fromBackup, direct)
  assert.equal(fromBackup.netProfit, 61.05)
})

test('a broken setting is reported and the whole import is refused', () => {
  const result = normalizeBackup(backup({ ...DEFAULT_SETTINGS, fuelPrice: 'عشرين' }, []), DEFAULT_SETTINGS)
  assert.equal(result.ok, false)
  assert.match(result.reason, /fuelPrice/)
})

test('a broken trip is skipped and counted, valid trips are kept', () => {
  const result = normalizeBackup(backup(DEFAULT_SETTINGS, [trip(), trip({ id: 't2', fare: 'بدون رقم' }), trip({ id: '' })]), DEFAULT_SETTINGS)
  assert.equal(result.ok, true)
  assert.equal(result.value.trips.length, 1)
  assert.equal(result.value.skippedTrips, 2)
})

test('trip numbers with Arabic digits are normalized and notes keep both languages', () => {
  const cleaned = normalizeTrip(trip({ fare: '١٦٥', netProfit: '٦١٫٠٥', notes: 'Trip ملاحظة ١٢' }))
  assert.equal(cleaned.fare, 165)
  assert.equal(cleaned.netProfit, 61.05)
  assert.equal(cleaned.notes, 'Trip ملاحظة ١٢')
})

test('a negative trip result is allowed, a negative input is not', () => {
  assert.equal(normalizeTrip(trip({ netProfit: -12 })).netProfit, -12)
  assert.equal(normalizeTrip(trip({ pickupKm: -1 })), null)
})

test('export then import returns the same settings and trips', () => {
  const settings = { ...DEFAULT_SETTINGS, fuelPrice: 23.5, commission: { ...DEFAULT_SETTINGS.commission, DiDi: 12.5 } }
  const exported = JSON.parse(JSON.stringify(backup(settings, [trip()])))
  const restored = normalizeBackup(exported, DEFAULT_SETTINGS)
  assert.equal(restored.ok, true)
  assert.deepEqual(restored.value.settings, settings)
  assert.deepEqual(restored.value.trips, [trip()])
})

test('wrong format or version is refused', () => {
  assert.equal(normalizeBackup({ schemaVersion: 2, settings: {}, trips: [] }, DEFAULT_SETTINGS).ok, false)
  assert.equal(normalizeBackup(null, DEFAULT_SETTINGS).ok, false)
})
