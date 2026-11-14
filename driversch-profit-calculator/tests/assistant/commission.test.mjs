import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateTrip } from '../../src/lib/calculator.ts'
import { DEFAULT_SETTINGS, EMPTY_TRIP } from '../../src/types.ts'
import { parseNumericDraft } from '../../src/lib/numericInput.ts'

const grossTrip = (fare, commissionRate) => ({ ...EMPTY_TRIP, fare, fareMode: 'gross', commissionRate })

test('10% commission on a 100 EGP fare leaves 90 EGP before other expenses', () => {
  const result = calculateTrip(grossTrip(100, 10), DEFAULT_SETTINGS)
  assert.equal(result.netFare, 90)
  assert.equal(100 - result.netFare, 10)
})

test('Arabic-Indic and ASCII digits produce identical calculations', () => {
  const ascii = calculateTrip(grossTrip(parseNumericDraft('100').value, parseNumericDraft('10').value), DEFAULT_SETTINGS)
  const arabic = calculateTrip(grossTrip(parseNumericDraft('١٠٠').value, parseNumericDraft('١٠').value), DEFAULT_SETTINGS)
  const persian = calculateTrip(grossTrip(parseNumericDraft('۱۰۰').value, parseNumericDraft('۱۰').value), DEFAULT_SETTINGS)
  assert.deepEqual(arabic, ascii)
  assert.deepEqual(persian, ascii)
})

test('the reference trip gives the same result with Arabic digits', () => {
  const trip = { ...EMPTY_TRIP, fare: parseNumericDraft('١٦٥').value, pickupKm: parseNumericDraft('١').value,
    passengerKm: parseNumericDraft('٢٠').value, returnKm: parseNumericDraft('١').value, totalMinutes: parseNumericDraft('٤٠').value }
  const ascii = { ...EMPTY_TRIP, fare: 165, pickupKm: 1, passengerKm: 20, returnKm: 1, totalMinutes: 40 }
  assert.deepEqual(calculateTrip(trip, DEFAULT_SETTINGS), calculateTrip(ascii, DEFAULT_SETTINGS))
})
