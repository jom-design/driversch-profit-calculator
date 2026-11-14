import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'

const port = 5175
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

const passed = []
function check(name, condition) {
  if (!condition) throw new Error('Input check failed: ' + name)
  passed.push(name)
}

const backupWithArabicDigits = JSON.stringify({
  schemaVersion: 1,
  exportedAt: '2026-11-14T10:00:00.000Z',
  settings: { fuelPrice: '٢١٫٧٥', consumptionPer100: '١٠', maintenancePerKm: 2.5, minNetProfit: 50, hourlyTarget: 75, commission: { inDrive: 0, DiDi: '١٢٫٥', 'أخرى': 0 } },
  trips: []
})
const brokenBackup = JSON.stringify({ schemaVersion: 1, settings: { fuelPrice: 'عشرين' }, trips: [] })

try {
  await waitForServer()
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar-EG' })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseUrl })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('dialog', dialog => { void dialog.accept() })

  await page.goto(baseUrl, { waitUntil: 'networkidle' })

  // ---- Calculator ----
  const numericCount = await page.locator('input.numeric-input[type="text"][inputmode="decimal"]').count()
  check('calculator numeric fields are text inputs with decimal keypad', numericCount >= 5)
  check('no browser number inputs anywhere on the calculator', await page.locator('input[type="number"]').count() === 0)

  const fare = page.getByLabel('الأجرة المعروضة')
  await fare.fill('١٦٥')
  check('fare accepts Arabic-Indic digits', await fare.inputValue() === '165')

  const passenger = page.getByLabel('مسافة الرحلة بالراكب')
  await passenger.fill('۲۵')
  check('passenger distance accepts Persian digits', await passenger.inputValue() === '25')

  await page.getByRole('button', { name: 'إجمالي قبل العمولة' }).click()
  await page.getByLabel('نسبة عمولة التطبيق').fill('١٠')
  await fare.fill('١٠٠')
  const netFareText = await page.locator('.metric', { hasText: 'صافي الأجرة' }).locator('strong').innerText()
  check('10% commission on 100 gives 90.00 net with Arabic digits', netFareText.includes('90.00'))
  await page.getByRole('button', { name: 'صافي للسائق' }).click()

  await fare.fill('12')
  await fare.focus()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.type('٣')
  check('typing an Arabic digit mid-field keeps the value', await fare.inputValue() === '132')
  check('caret stays after the inserted digit', await fare.evaluate(el => el.selectionStart) === 2)

  await passenger.fill('-5abc')
  check('minus sign and letters are dropped from distance', await passenger.inputValue() === '5')
  await passenger.fill('')
  check('empty distance stays empty', await passenger.inputValue() === '')

  await passenger.fill('')
  await page.evaluate(text => navigator.clipboard.writeText(text), '٣٠')
  await passenger.focus()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Control+V')
  check('pasting Arabic digits into a numeric field keeps them as numbers', await passenger.inputValue() === '30')

  const notes = page.getByPlaceholder('أي تفاصيل تساعدك في مراجعة الرحلة...')
  await notes.fill('مشوار Good trip ١٢')
  check('mixed Arabic and English notes are kept as typed', await notes.inputValue() === 'مشوار Good trip ١٢')
  check('notes use automatic direction', await notes.getAttribute('dir') === 'auto')

  // ---- Assistant (screenshot capture) ----
  await page.getByRole('button', { name: /المساعد الذكي/ }).click()
  check('screenshot upload control is present', await page.locator('input[type="file"][accept="image/*"]').count() === 1)
  check('assistant screen has no raw number inputs', await page.locator('input[type="number"]').count() === 0)

  // ---- Inbox: pasted offer text in Arabic digits, English labels, manual correction ----
  await page.getByRole('button', { name: /الرحلات الملتقطة/ }).click()
  await page.getByLabel('إضافة عرض يدويًا أو لصق نص إشعار').fill('inDrive\nالقبول مقابل ١٦٥ جنيه\nمسافة الوصول: ٤ كم\nمسافة الرحلة: ٢٢ كم\n٤٠ دقيقة')
  await page.locator('#ride-offer-text').press('Tab')
  await page.keyboard.press('Enter')
  await page.locator('.inbox-row').first().waitFor()
  const inboxFare = page.locator('.inbox-field input.numeric-input').first()
  check('inbox parses an offer written with Arabic digits', await inboxFare.inputValue() === '165')
  await inboxFare.fill('١٧٥')
  check('inbox manual correction accepts Arabic digits', await inboxFare.inputValue() === '175')
  check('inbox offer text uses automatic direction', await page.locator('#ride-offer-text').getAttribute('dir') === 'auto')

  // ---- History and reports: read-only screens must not contain raw number inputs ----
  await page.getByRole('button', { name: /سجل الرحلات/ }).click()
  check('history has no raw number inputs', await page.locator('input[type="number"]').count() === 0)
  await page.getByRole('button', { name: /التقارير/ }).click()
  check('reports have no editable number inputs', await page.locator('input').count() === 0)

  // ---- Settings: decimal values, commission, backup import with Arabic digits ----
  await page.getByRole('button', { name: 'الإعدادات' }).click()
  await page.getByLabel('سعر لتر البنزين').fill('٢٢٫٥')
  await page.getByRole('button', { name: /حفظ الإعدادات/ }).click()
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'الإعدادات' }).click()
  check('saved fuel price is restored as 22.5', await page.getByLabel('سعر لتر البنزين').inputValue() === '22.5')

  await page.locator('input[type="file"][accept="application/json"]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backupWithArabicDigits) })
  await page.locator('.toast', { hasText: 'تم استيراد' }).waitFor()
  check('backup with Arabic digits imports as 21.75 fuel price', await page.getByLabel('سعر لتر البنزين').inputValue() === '21.75')
  check('backup with Arabic digits imports the DiDi commission as 12.5', await page.getByLabel('عمولة DiDi').inputValue() === '12.5')

  await page.locator('input[type="file"][accept="application/json"]').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from(brokenBackup) })
  await page.locator('.toast', { hasText: 'fuelPrice' }).waitFor()
  check('broken backup is refused and the stored fuel price is kept', await page.getByLabel('سعر لتر البنزين').inputValue() === '21.75')

  // ---- Uber commission: its own field, applied only when Uber is selected ----
  await page.getByRole('button', { name: 'الإعدادات', exact: true }).click()
  await page.getByLabel('عمولة Uber').fill('١٠')
  await page.getByLabel('عمولة DiDi').fill('٢٠')
  await page.getByRole('button', { name: /حفظ الإعدادات/ }).click()
  await page.getByRole('button', { name: 'حاسبة المشوار' }).click()
  await page.getByRole('button', { name: 'DiDi', exact: true }).click()
  await page.getByRole('button', { name: 'إجمالي قبل العمولة' }).click()
  check('selecting DiDi uses the DiDi commission (20%)', await page.getByLabel('نسبة عمولة التطبيق').inputValue() === '20')
  await page.getByRole('button', { name: 'Uber', exact: true }).click()
  await page.getByRole('button', { name: 'إجمالي قبل العمولة' }).click()
  check('selecting Uber uses the Uber commission (10%), not DiDi', await page.getByLabel('نسبة عمولة التطبيق').inputValue() === '10')
  await fare.fill('١٠٠')
  const uberNet = await page.locator('.metric', { hasText: 'صافي الأجرة' }).locator('strong').innerText()
  check('100 EGP fare with 10% Uber commission leaves 90.00', uberNet.includes('90.00'))
  await page.getByRole('button', { name: 'صافي للسائق' }).click()

  const bodyText = await page.locator('body').innerText()
  check('no NaN is shown anywhere', !bodyText.includes('NaN'))
  check('no page errors', pageErrors.length === 0)

  console.log(JSON.stringify({ passed, count: passed.length, pageErrors }, null, 2))
  await context.close()
} finally {
  if (browser) await browser.close()
  server.kill('SIGTERM')
}
