import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'

const port = 5175
const baseUrl = 'http://127.0.0.1:' + port
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' })
let browser

try {
  let ready = false
  for (let i = 0; i < 60; i += 1) {
    try { const response = await fetch(baseUrl); if (response.ok) { ready = true; break } } catch { /* server is starting */ }
    await delay(250)
  }
  if (!ready) throw new Error('Vite did not become ready for native voice bridge test')

  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ar-EG' })
  await page.addInitScript(() => {
    window.__nativeVoiceCalls = []
    window.DriverAndroid = {
      startSpeechRecognition() {
        window.__nativeVoiceCalls.push({ method: 'startSpeechRecognition' })
        setTimeout(() => window.dispatchEvent(new CustomEvent('driverandroidvoice', {
          detail: { type: 'result', value: 'افتح صندوق الرحلات' }
        })), 0)
        return true
      },
      stopSpeechRecognition() { window.__nativeVoiceCalls.push({ method: 'stopSpeechRecognition' }); return true },
      speakText(text) { window.__nativeVoiceCalls.push({ method: 'speakText', text }); return true },
      stopSpeaking() { window.__nativeVoiceCalls.push({ method: 'stopSpeaking' }); return true }
    }
  })
  await page.goto(baseUrl, { waitUntil: 'networkidle' })

  await page.getByRole('button', { name: 'أمر صوتي' }).click()
  await page.getByText(/سمعت:/).waitFor()
  if (!(await page.getByText(/افتح صندوق الرحلات/).count())) throw new Error('Native transcript was not rendered')
  if (!(await page.getByRole('heading', { name: 'احسبها قبل ما تقبل المشوار' }).isVisible())) {
    throw new Error('A native voice command ran before explicit confirmation')
  }

  await page.getByRole('button', { name: 'نطق القرار' }).click()
  await page.waitForFunction(() => window.__nativeVoiceCalls.some(call => call.method === 'speakText'))
  const spoken = await page.evaluate(() => window.__nativeVoiceCalls.find(call => call.method === 'speakText')?.text)
  if (!spoken || !spoken.includes('صافي الربح')) throw new Error('Result narration did not call the native TTS bridge')

  await page.getByRole('button', { name: 'نفّذ الأمر' }).click()
  const inboxNav = page.getByRole('button', { name: 'الرحلات الملتقطة' })
  await inboxNav.waitFor()
  if (!(await inboxNav.getAttribute('class') ?? '').includes('active')) {
    throw new Error('Confirmed native voice command did not navigate to the inbox')
  }
  const calls = await page.evaluate(() => window.__nativeVoiceCalls.map(call => call.method))
  if (!calls.includes('startSpeechRecognition') || !calls.includes('speakText')) {
    throw new Error('Expected native voice bridge calls were not observed')
  }
  console.log('Native voice bridge UI test passed: push-to-talk, transcript confirmation, navigation, and TTS delegation.')
} finally {
  if (browser) await browser.close()
  server.kill('SIGTERM')
}
