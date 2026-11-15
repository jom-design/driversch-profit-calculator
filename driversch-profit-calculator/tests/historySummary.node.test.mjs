import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareSavedTrip, readStoredTrip } from '../src/lib/persistence.ts'
import { summarizeHistory, verifiedOnly } from '../src/lib/historySummary.ts'
import { DEFAULT_SETTINGS, EMPTY_TRIP } from '../src/types.ts'

// All values are synthetic. Each fixture is built through the real persistence path.
const base = (id, patch = {}) => ({ ...EMPTY_TRIP, id, createdAt: '2026-11-14T00:00:00.000Z', ...patch })
const legacy = (record) => {
  const { settingsSnapshot, ...rest } = record
  return rest
}
const verified = readStoredTrip(prepareSavedTrip(base('verified-1', { fare: 200 }), DEFAULT_SETTINGS))
const verified2 = readStoredTrip(prepareSavedTrip(base('verified-2', { fare: 150, passengerKm: 10 }), DEFAULT_SETTINGS))
const legacyTrip = readStoredTrip(legacy(prepareSavedTrip(base('legacy-1', { fare: 200 }), DEFAULT_SETTINGS)))
const mismatch = readStoredTrip({ ...prepareSavedTrip(base('mismatch-1', { fare: 200 }), DEFAULT_SETTINGS), netProfit: 999999 })
const zeroDuration = readStoredTrip(legacy({ ...prepareSavedTrip(base('zero-1', { fare: 200 }), DEFAULT_SETTINGS), totalMinutes: 0 }))

test('the fixtures carry the integrity statuses the decisions are based on', () => {
  assert.equal(verified.integrity, 'verified')
  assert.equal(verified2.integrity, 'verified')
  assert.equal(legacyTrip.integrity, 'legacy-unverified')
  assert.equal(mismatch.integrity, 'mismatch')
  assert.equal(zeroDuration.integrity, 'not-recalculable')
})

// Decision 2: verified totals exclude every unverified record.
test('verified totals include only verified records', () => {
  const summary = summarizeHistory([verified, legacyTrip, mismatch, zeroDuration, verified2])
  assert.equal(summary.verified.count, 2)
  assert.equal(summary.verified.netProfit, Math.round((verified.netProfit + verified2.netProfit) * 100) / 100)
})

test('a mismatch record never leaks its recorded profit into the verified total', () => {
  const summary = summarizeHistory([verified, mismatch])
  assert.equal(summary.verified.count, 1)
  assert.notEqual(summary.verified.netProfit, 999999 + verified.netProfit)
  assert.equal(summary.verified.netProfit, verified.netProfit)
})

test('legacy and not-recalculable records are excluded from verified totals', () => {
  const summary = summarizeHistory([legacyTrip, zeroDuration])
  assert.equal(summary.verified.count, 0)
  assert.equal(summary.verified.netProfit, 0)
  assert.equal(summary.verified.totalMinutes, 0)
})

// Decision 2 (continued): unverified records are shown separately, with their recorded values.
test('unverified records are summed as recorded values in a separate total', () => {
  const summary = summarizeHistory([verified, legacyTrip, mismatch, zeroDuration])
  assert.equal(summary.unverified.count, 3)
  assert.equal(summary.unverified.netProfit, Math.round((legacyTrip.netProfit + 999999 + zeroDuration.netProfit) * 100) / 100)
})

test('the verified total and the unverified total never double-count one record', () => {
  const trips = [verified, legacyTrip, mismatch, zeroDuration, verified2]
  const summary = summarizeHistory(trips)
  assert.equal(summary.verified.count + summary.unverified.count, trips.length)
})

test('with only verified records, the unverified total is empty', () => {
  const summary = summarizeHistory([verified, verified2])
  assert.deepEqual(summary.unverified, { count: 0, netProfit: 0 })
})

test('empty history gives zero totals in both sections', () => {
  assert.deepEqual(summarizeHistory([]), {
    verified: { count: 0, netFare: 0, totalCost: 0, netProfit: 0, totalKm: 0, totalMinutes: 0 },
    unverified: { count: 0, netProfit: 0 },
  })
})

test('per-app comparison uses verified records only', () => {
  const ids = verifiedOnly([verified, legacyTrip, mismatch, zeroDuration, verified2]).map(t => t.id)
  assert.deepEqual(ids, ['verified-1', 'verified-2'])
})
