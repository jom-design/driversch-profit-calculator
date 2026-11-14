import test from 'node:test'
import assert from 'node:assert/strict'
import { detectBrowserCapabilities } from '../../src/platform/browserCapabilities.ts'

test('reports supported browser APIs without requesting permissions', () => {
  const capabilities = detectBrowserCapabilities({
    navigator: { mediaDevices: { getUserMedia() {}, getDisplayMedia() {} }, serviceWorker: {} },
    SpeechRecognition() {},
    speechSynthesis: {},
    SpeechSynthesisUtterance() {},
    Notification() {},
    indexedDB: {}
  })
  assert.deepEqual(capabilities, {
    speechRecognition: true, textToSpeech: true, microphone: true, camera: true,
    screenCapture: true, notificationsApi: true, serviceWorker: true, indexedDb: true
  })
})

test('reports unsupported APIs as false', () => {
  const capabilities = detectBrowserCapabilities({})
  assert.ok(Object.values(capabilities).every(value => value === false))
})

test('does not confuse microphone support with screen capture support', () => {
  const capabilities = detectBrowserCapabilities({ navigator: { mediaDevices: { getUserMedia() {} } } })
  assert.equal(capabilities.microphone, true)
  assert.equal(capabilities.camera, true)
  assert.equal(capabilities.screenCapture, false)
})

test('does not treat a notification permission value as API availability', () => {
  const capabilities = detectBrowserCapabilities({ Notification: { permission: 'granted' } })
  assert.equal(capabilities.notificationsApi, false)
})
