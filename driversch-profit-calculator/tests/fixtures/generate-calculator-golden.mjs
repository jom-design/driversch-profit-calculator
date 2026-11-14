// Regenerates tests/fixtures/calculator-golden.json from the real TypeScript engine.
// Usage (from the app directory): node --experimental-strip-types tests/fixtures/generate-calculator-golden.mjs
// The Kotlin parity test (android/app/src/test/.../TripCalculatorGoldenTest.kt) consumes this file.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const { calculateTrip } = await import(join(here, '../../src/lib/calculator.ts'))
const { DEFAULT_SETTINGS, EMPTY_TRIP } = await import(join(here, '../../src/types.ts'))

const settingsVariants = [
  { name: 'default', s: DEFAULT_SETTINGS },
  { name: 'zero-minimums', s: { ...DEFAULT_SETTINGS, minNetProfit: 0, hourlyTarget: 0 } },
  { name: 'high-hourly', s: { ...DEFAULT_SETTINGS, hourlyTarget: 200 } },
  { name: 'free-fuel', s: { ...DEFAULT_SETTINGS, fuelPrice: 0, maintenancePerKm: 0 } },
  { name: 'strict-min', s: { ...DEFAULT_SETTINGS, minNetProfit: 120, consumptionPer100: 14.5 } },
]
const fares = [0, 1, 37.5, 95, 165, 333.33]
const commissions = [0, 12.5, 25, 100, 150, -5]
const modes = ['net', 'gross', 'unknown']
const km = [[0, 22, 0], [3.2, 8, 1.1], [0, 0, 0], [12.75, 40, 9.9]]
const minutes = [0, 1, 40, 95]
const extras = [0, 15.5]

const pick = (s) => ({ fuelPrice: s.fuelPrice, consumptionPer100: s.consumptionPer100, maintenancePerKm: s.maintenancePerKm, minNetProfit: s.minNetProfit, hourlyTarget: s.hourlyTarget })
const cases = []
let idx = 0
for (const sv of settingsVariants) for (const mode of modes) for (const fare of fares)
  for (const commissionRate of commissions) for (const [pickupKm, passengerKm, returnKm] of km)
    for (const totalMinutes of minutes) for (const extraExpenses of extras) {
      // Deterministic thinning keeps the fixture small but still covers every dimension.
      idx++
      if ((idx * 7919) % 5 !== 0 && mode !== 'unknown' && !(fare === 0 && idx % 3 === 0)) continue
      const input = { ...EMPTY_TRIP, fare, fareMode: mode, commissionRate, pickupKm, passengerKm, returnKm, totalMinutes, extraExpenses }
      cases.push({
        name: `${sv.name}|${mode}|fare=${fare}|c=${commissionRate}|km=${pickupKm}/${passengerKm}/${returnKm}|min=${totalMinutes}|x=${extraExpenses}`,
        settings: pick(sv.s),
        input: { fare, fareMode: mode, commissionRate, pickupKm, passengerKm, returnKm, totalMinutes, extraExpenses },
        expected: calculateTrip(input, sv.s),
      })
    }
const ref = calculateTrip(EMPTY_TRIP, DEFAULT_SETTINGS)
cases.unshift({
  name: 'reference-EMPTY_TRIP-DEFAULT',
  settings: pick(DEFAULT_SETTINGS),
  input: { fare: EMPTY_TRIP.fare, fareMode: EMPTY_TRIP.fareMode, commissionRate: EMPTY_TRIP.commissionRate, pickupKm: EMPTY_TRIP.pickupKm, passengerKm: EMPTY_TRIP.passengerKm, returnKm: EMPTY_TRIP.returnKm, totalMinutes: EMPTY_TRIP.totalMinutes, extraExpenses: EMPTY_TRIP.extraExpenses },
  expected: ref,
})

writeFileSync(join(here, 'calculator-golden.json'), JSON.stringify({ version: 1, generatedFrom: 'src/lib/calculator.ts', caseCount: cases.length, cases }) + '\n')
console.log('cases', cases.length)
