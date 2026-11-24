import test from 'node:test'
import assert from 'node:assert/strict'
import { extractOcrDistances } from '../../src/lib/ocr.ts'

test('OCR extracts pickup and passenger distances only from explicit labels', () => {
  assert.deepEqual(
    extractOcrDistances('مسافة الوصول: ٣ كم\\nمسافة الرحلة: ٢٢ كم'),
    { pickupKm: 3, passengerKm: 22 }
  )
})

test('OCR does not guess the meaning of two unlabelled distances', () => {
  assert.deepEqual(
    extractOcrDistances('3 كم\\n22 كم'),
    { pickupKm: null, passengerKm: null }
  )
})

test('OCR keeps a single labelled distance in its own field only', () => {
  assert.deepEqual(
    extractOcrDistances('Pickup distance: 1.5 km'),
    { pickupKm: 1.5, passengerKm: null }
  )
})

test('OCR converts explicitly labelled metres to kilometres', () => {
  assert.deepEqual(
    extractOcrDistances('To pickup: 750 متر; Trip distance: ١٨ كم'),
    { pickupKm: 0.75, passengerKm: 18 }
  )
})
