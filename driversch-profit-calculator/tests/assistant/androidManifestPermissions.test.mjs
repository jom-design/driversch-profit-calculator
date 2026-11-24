import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const manifest = readFileSync(new URL('../../../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8')

test('Android declares network access required for Tesseract OCR assets', () => {
  assert.match(manifest, /<uses-permission android:name="android\.permission\.INTERNET"\s*\/>/)
})

test('Android keeps microphone access explicit and notification capture protected', () => {
  assert.match(manifest, /android\.permission\.RECORD_AUDIO/)
  assert.match(manifest, /android:permission="android\.permission\.BIND_NOTIFICATION_LISTENER_SERVICE"/)
})
