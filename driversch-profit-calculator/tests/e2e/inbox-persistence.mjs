import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'

const require = createRequire(import.meta.url)
const axePath = require.resolve('axe-core')
const port = 5174
const baseUrl = 'http://127.0.0.1:' + port
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' })
let browser

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try { const response = await fetch(baseUrl); if (response.ok) return } catch { /* server is starting */ }
    await delay(250)
  }
  throw new Error('Vite did not become ready on port ' + port)
}

async function waitForStoredStatus(page, expected) {
  await page.waitForFunction(async status => {
    const request = indexedDB.open('driver-assistant-inbox')
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const tx = db.transaction('items', 'readonly')
    const items = await new Promise((resolve, reject) => {
      const get = tx.objectStore('items').getAll()
      get.onsuccess = () => resolve(get.result)
      get.onerror = () => reject(get.error)
    })
    db.close()
    return items.some(item => item.status === status)
  }, expected, { timeout: 5000 })
}

try {
  await waitForServer()
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar-EG' })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))

  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  const rtl = await page.locator('html').evaluate(element => ({ dir: element.dir, lang: element.lang }))
  if (rtl.dir !== 'rtl' || rtl.lang !== 'ar') throw new Error('Arabic RTL document metadata is missing')

  await page.getByRole('button', { name: 'الرحلات الملتقطة' }).click()
  await page.getByLabel('إضافة عرض يدويًا أو لصق نص إشعار').fill('inDrive\nالقبول مقابل 165 جنيه\nمسافة الوصول: 4 كم\nمسافة الرحلة: 22 كم\n40 دقيقة')
  await page.locator('#ride-offer-text').press('Tab')
  const keyboardFocus = await page.evaluate(() => ({
    text: document.activeElement?.textContent?.trim() ?? '',
    outline: getComputedStyle(document.activeElement).outlineStyle
  }))
  if (keyboardFocus.outline === 'none') throw new Error('Keyboard focus indicator is missing')
  await page.keyboard.press('Enter')
  await page.locator('.inbox-row').first().waitFor()

  const numberInputs = page.locator('.inbox-field input.numeric-input')
  await numberInputs.nth(0).fill('175')
  const reviewChecks = page.locator('.inbox-reviewed input[type="checkbox"]')
  if (await reviewChecks.count() !== 4) throw new Error('Expected four independent review confirmations')
  for (let i = 0; i < 4; i += 1) await reviewChecks.nth(i).check()

  await page.addScriptTag({ path: axePath })
  const axeResults = await page.evaluate(async () => window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }
  }))
  const accessibilityViolations = axeResults.violations.map(violation => ({
    id: violation.id, impact: violation.impact, nodes: violation.nodes.map(node => ({ target: node.target, html: node.html.slice(0, 180), summary: node.failureSummary?.slice(0, 240) }))
  }))
  if (accessibilityViolations.some(violation => ['critical', 'serious'].includes(violation.impact))) {
    throw new Error('Serious/critical accessibility violations: ' + JSON.stringify(accessibilityViolations))
  }

  const reviewTargetHeights = await page.locator('.inbox-reviewed').evaluateAll(elements =>
    elements.map(element => Math.round(element.getBoundingClientRect().height))
  )
  if (reviewTargetHeights.some(height => height < 44)) throw new Error('A review checkbox target is smaller than 44 CSS px')

  const viewportSizes = [[390, 844], [768, 1024], [800, 1280], [1024, 768], [1280, 800], [1366, 768]]
  const viewportResults = []
  for (const [width, height] of viewportSizes) {
    await page.setViewportSize({ width, height })
    await page.waitForTimeout(60)
    const result = await page.evaluate(() => ({
      width: innerWidth, height: innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth
    }))
    result.horizontalOverflow = result.documentWidth > width || result.bodyWidth > width
    viewportResults.push(result)
  }
  if (viewportResults.some(result => result.horizontalOverflow)) {
    throw new Error('Horizontal overflow at required viewport(s): ' + JSON.stringify(viewportResults))
  }

  await page.setViewportSize({ width: 844, height: 390 })
  await page.setViewportSize({ width: 390, height: 844 })
  if (await reviewChecks.count() !== 4 || !(await reviewChecks.evaluateAll(elements => elements.every(element => element.checked)))) {
    throw new Error('Review state changed during orientation/viewport rotation')
  }

  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'الرحلات الملتقطة' }).click()
  await page.locator('.inbox-row').first().click()
  const restoredFare = await page.locator('.inbox-field input.numeric-input').first().inputValue()
  const restoredReview = await page.locator('.inbox-reviewed input[type="checkbox"]').evaluateAll(elements => elements.map(element => element.checked))
  if (restoredFare !== '175' || restoredReview.length !== 4 || !restoredReview.every(Boolean)) {
    throw new Error('Manual correction or review confirmations did not survive reload')
  }

  await page.getByRole('button', { name: /تأكيد العرض بعد المراجعة/ }).click()
  await page.locator('.status-confirmed').first().waitFor()
  await waitForStoredStatus(page, 'confirmed')

  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'الرحلات الملتقطة' }).click()
  await page.locator('.inbox-row').first().click()
  await page.locator('.status-confirmed').first().waitFor()
  await page.getByRole('button', { name: /نقل العرض المؤكد للحاسبة/ }).click()
  const unknownFareModeButton = page.getByRole('button', { name: 'غير متأكد' })
  await unknownFareModeButton.waitFor()
  const fareModeRemainsUnknown = (await unknownFareModeButton.getAttribute('class') ?? '').includes('chosen')
  const calculatorFare = await page.locator('input.numeric-input').first().inputValue()
  if (calculatorFare !== '175' || !fareModeRemainsUnknown) {
    throw new Error('Calculator handoff changed the fare or guessed fare mode')
  }
  await waitForStoredStatus(page, 'transferred')

  await page.getByRole('button', { name: 'الرحلات الملتقطة' }).click()
  await page.locator('.inbox-row').first().click()
  await page.locator('.status-transferred').first().waitFor()
  if (await page.getByRole('button', { name: /نقل العرض المؤكد للحاسبة/ }).count() !== 0) {
    throw new Error('Transferred item still exposes a transfer action')
  }

  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'الرحلات الملتقطة' }).click()
  await page.locator('.inbox-row').first().click()
  await page.locator('.status-transferred').first().waitFor()
  if (await page.getByRole('button', { name: /نقل العرض المؤكد للحاسبة/ }).count() !== 0) {
    throw new Error('Transferred status did not survive reload or became transferable again')
  }

  await page.getByRole('button', { name: 'سجل الرحلات' }).click()
  const historyText = await page.locator('body').innerText()
  if (!historyText.includes('لسه مفيش رحلات محفوظة')) throw new Error('Inbox handoff unexpectedly wrote a trip into history')
  if (pageErrors.length) throw new Error('Browser page errors: ' + JSON.stringify(pageErrors))

  console.log(JSON.stringify({
    result: 'PASS',
    rtl,
    keyboardFocus,
    accessibilityViolations,
    reviewTargetHeights,
    viewportResults,
    persistence: {
      manualFareRestored: restoredFare,
      reviewConfirmationsRestored: restoredReview.length,
      confirmedStatusRestored: true,
      transferredStatusRestored: true,
      transferActionHiddenAfterTransfer: true,
      fareMode: fareModeRemainsUnknown ? 'unknown' : 'not-unknown',
      noAutomaticTripHistoryWrite: true
    },
    pageErrors
  }, null, 2))
  await context.close()
} finally {
  if (browser) await browser.close()
  server.kill('SIGTERM')
}
