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

function check(name, condition) {
  if (!condition) throw new Error('Input check failed: ' + name)
  return name
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
  const checks = []

  // Every numeric field is a text input that accepts Arabic-Indic digits.
  const numericCount = await page.locator('input.numeric-input[type="text"][inputmode="decimal"]').count()
  checks.push(check('numeric fields are text inputs with decimal keypad', numericCount >= 5))
  checks.push(check('no browser number inputs remain on the calculator', await page.locator('input[type="number"]').count() === 0))

  // Arabic-Indic digits in the fare field produce the same value as ASCII digits.
  const fare = page.getByLabel('الأجرة المعروضة')
  await fare.fill('١٦٥')
  checks.push(check('fare accepts Arabic digits', await fare.inputValue() === '165'))

  // Commission regression: 10% of 100 EGP leaves 90 EGP net, typed with Arabic digits.
  await page.getByRole('button', { name: 'إجمالي قبل العمولة' }).click()
  await page.getByLabel('نسبة عمولة التطبيق').fill('١٠')
  await fare.fill('١٠٠')
  const netFareText = await page.locator('.metric', { hasText: 'صافي الأجرة' }).locator('strong').innerText()
  checks.push(check('10% commission on 100 gives 90.00 net with Arabic digits', netFareText.includes('90.00')))

  // Cursor stability: inserting an Arabic digit in the middle keeps the caret after it.
  await fare.fill('12')
  await fare.focus()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.type('٣')
  checks.push(check('middle insertion gives 132', await fare.inputValue() === '132'))
  checks.push(check('caret stays after the inserted digit', await fare.evaluate(el => el.selectionStart) === 2))

  // Negative and letters are dropped from distance fields; English text still works in notes.
  const passenger = page.getByLabel('مسافة الرحلة بالراكب')
  await passenger.fill('-5abc')
  checks.push(check('minus and letters are dropped from distance', await passenger.inputValue() === '5'))
  await passenger.fill('')
  checks.push(check('empty distance stays empty', await passenger.inputValue() === ''))

  const notes = page.getByPlaceholder('أي تفاصيل تساعدك في مراجعة الرحلة...')
  await notes.fill('مشوار Good trip ١٢')
  checks.push(check('mixed Arabic and English notes are kept as typed', await notes.inputValue() === 'مشوار Good trip ١٢'))
  checks.push(check('notes use automatic direction', await notes.getAttribute('dir') === 'auto'))

  // Settings: an Arabic decimal value is saved and restored after reload.
  await page.getByRole('button', { name: 'الإعدادات' }).click()
  await page.getByLabel('سعر لتر البنزين').fill('٢٢٫٥')
  await page.getByRole('button', { name: /حفظ الإعدادات/ }).click()
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'الإعدادات' }).click()
  const restoredFuel = await page.getByLabel('سعر لتر البنزين').inputValue()
  checks.push(check('saved fuel price is restored as 22.5', restoredFuel === '22.5'))

  const bodyText = await page.locator('body').innerText()
  checks.push(check('no NaN is shown anywhere', !bodyText.includes('NaN')))
  checks.push(check('no page errors', pageErrors.length === 0))

  console.log(JSON.stringify({ passed: checks, pageErrors }, null, 2))
  await context.close()
} finally {
  if (browser) await browser.close()
  server.kill('SIGTERM')
}
