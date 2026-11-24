import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'

const port = 5176
const baseUrl = 'http://127.0.0.1:' + port
const notificationId = 'com.ubercab.driver:synthetic-auto-sync-1'
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' })
let browser

try {
  let ready = false
  for (let i = 0; i < 60; i += 1) {
    try { const response = await fetch(baseUrl); if (response.ok) { ready = true; break } } catch { /* server is starting */ }
    await delay(250)
  }
  if (!ready) throw new Error('Vite did not become ready for native notification sync test')

  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ar-EG' })
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.addInitScript(id => {
    const field = value => ({ value, confidence: 0.97, evidence: [], status: 'candidate' })
    const pending = [{
      notificationId: id,
      packageName: 'com.ubercab.driver',
      appLabel: 'Uber',
      postedAt: '2026-11-24T08:00:00.000Z',
      capturedAt: '2026-11-24T08:00:01.000Z',
      offer: {
        fare: field(165),
        pickupDistanceKm: field(2),
        distanceKm: field(22),
        durationMinutes: field(40),
        pickupMinutes: field(5),
        currency: 'EGP',
        fareMode: 'unknown'
      },
      analysis: {
        recommendation: 'insufficient_data',
        netProfit: null,
        hourlyProfit: null,
        totalCost: null,
        requiredFare: null,
        partialCost: 94.5,
        missingFields: ['returnDistance', 'extraExpenses'],
        reason: 'review',
        payloadVerified: false,
        userDefaults: []
      }
    }]
    window.__nativeNotificationState = { pending, acknowledged: [] }
    window.DriverAndroid = {
      getStatusJson() {
        return JSON.stringify({
          isAndroid: true,
          hasNotificationAccess: true,
          serviceConnected: true,
          enabledProviders: ['uber'],
          lastReceivedAt: '2026-11-24T08:00:01.000Z',
          queueHealthy: true,
          queuedEvents: pending.length,
          captureCounters: { received: 1, stored: 1 }
        })
      },
      getPendingNotificationsJson() { return JSON.stringify(pending) },
      acknowledgeNotification(notificationId) {
        const index = pending.findIndex(item => item.notificationId === notificationId)
        if (index < 0) return false
        window.__nativeNotificationState.acknowledged.push(notificationId)
        pending.splice(index, 1)
        return true
      },
      setProviderEnabled() { return true },
      openNotificationAccessSettings() { return true },
      setTripAnalysisSettings() { return true },
      setVoiceLanguage() { return true },
      setSystemTheme() { return true },
      startSpeechRecognition() { return true },
      stopSpeechRecognition() { return true },
      speakText() { return true },
      stopSpeaking() { return true }
    }
  }, notificationId)

  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'الرحلات الملتقطة' }).click()
  await page.locator('.inbox-row').first().waitFor({ timeout: 8000 })
  await page.waitForFunction(id => window.__nativeNotificationState.acknowledged.includes(id), notificationId, { timeout: 8000 })

  const imported = await page.evaluate(async id => {
    const request = indexedDB.open('driver-assistant-inbox')
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const tx = db.transaction('items', 'readonly')
    const item = await new Promise((resolve, reject) => {
      const get = tx.objectStore('items').get(id)
      get.onsuccess = () => resolve(get.result)
      get.onerror = () => reject(get.error)
    })
    db.close()
    return item ? { id: item.id, status: item.status, fare: item.draft.fields.fare.value, source: item.draft.source } : null
  }, notificationId)

  if (!imported || imported.status !== 'needs-review' || imported.fare !== 165 || imported.source !== 'notification') {
    throw new Error('Native offer was not durably imported into the review inbox: ' + JSON.stringify(imported))
  }
  const nativeState = await page.evaluate(() => ({
    pending: window.__nativeNotificationState.pending.length,
    acknowledged: window.__nativeNotificationState.acknowledged.length
  }))
  if (nativeState.pending !== 0 || nativeState.acknowledged !== 1) {
    throw new Error('Native queue was not acknowledged after local inbox persistence: ' + JSON.stringify(nativeState))
  }

  await page.getByRole('button', { name: 'سجل الرحلات' }).click()
  if (!(await page.locator('body').innerText()).includes('لسه مفيش رحلات محفوظة')) {
    throw new Error('Notification import unexpectedly confirmed or saved a trip')
  }
  if (pageErrors.length) throw new Error('Browser page errors: ' + JSON.stringify(pageErrors))

  console.log(JSON.stringify({
    result: 'PASS',
    imported,
    nativeState,
    guarantees: {
      automaticInboxImport: true,
      acknowledgedOnlyAfterLocalPersistence: true,
      requiresManualReview: true,
      noAutomaticTripHistoryWrite: true
    },
    pageErrors
  }, null, 2))
} finally {
  if (browser) await browser.close()
  server.kill('SIGTERM')
}
