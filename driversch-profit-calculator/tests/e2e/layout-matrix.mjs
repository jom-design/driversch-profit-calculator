import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'

// Browser layout matrix. Android WebView insets are checked separately in android/ (unit + APK resource checks).
const port = 5176
const baseUrl = 'http://127.0.0.1:' + port
const outDir = process.env.LAYOUT_SCREENSHOT_DIR ?? 'test-results/layout'
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' })
let browser

const viewports = [
  { name: 'small-android-360x640', width: 360, height: 640 },
  { name: 'small-android-360x800', width: 360, height: 800 },
  { name: 'phone-390x844', width: 390, height: 844 },
  { name: 'large-phone-412x915', width: 412, height: 915 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
  { name: 'landscape-844x390', width: 844, height: 390 }
]
const screens = [
  { name: 'calculator', open: async () => {} },
  { name: 'settings', open: async page => page.getByRole('button', { name: 'الإعدادات', exact: true }).click() },
  { name: 'assistant', open: async page => page.getByRole('button', { name: /المساعد الذكي/ }).click() },
  { name: 'inbox', open: async page => page.getByRole('button', { name: /الرحلات الملتقطة/ }).click() },
  { name: 'history', open: async page => page.getByRole('button', { name: /سجل الرحلات/ }).click() },
  { name: 'reports', open: async page => page.getByRole('button', { name: /التقارير/ }).click() }
]

const passed = []
function check(name, condition) {
  if (!condition) throw new Error('Layout check failed: ' + name)
  passed.push(name)
}

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try { const response = await fetch(baseUrl); if (response.ok) return } catch { /* starting */ }
    await delay(250)
  }
  throw new Error('Vite did not become ready on port ' + port)
}

try {
  await waitForServer()
  mkdirSync(outDir, { recursive: true })
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox'] })
  const pageErrors = []

  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: 'ar-EG', deviceScaleFactor: 2 })
    const page = await context.newPage()
    page.on('pageerror', error => pageErrors.push(vp.name + ': ' + error.message))
    page.on('dialog', dialog => { void dialog.accept() })
    await page.goto(baseUrl, { waitUntil: 'networkidle' })

    for (const screen of screens) {
      await screen.open(page)
      await delay(150)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      check(`${vp.name} ${screen.name}: no horizontal page scroll`, overflow <= 0)
      // The navigation strip is a deliberate horizontal scroller, so its buttons are excluded.
      const offscreen = await page.evaluate(() => {
        const controls = [...document.querySelectorAll('input.numeric-input, textarea, button')]
        return controls
          .filter(el => !el.closest('.nav'))
          .filter(el => {
            const r = el.getBoundingClientRect()
            return r.width > 0 && r.height > 0 && (r.right > window.innerWidth + 1 || r.left < -1)
          })
          .map(el => (el.className || el.tagName) + ' "' + (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30) + '"')
      })
      check(`${vp.name} ${screen.name}: controls stay inside the viewport width (offending: ${offscreen.join(' | ') || 'none'})`, offscreen.length === 0)
      await page.screenshot({ path: `${outDir}/${vp.name}-${screen.name}.png`, fullPage: true })
      if (screen.name !== 'calculator') await page.getByRole('button', { name: /حاسبة المشوار/ }).click()
    }

    // Settings: the Uber commission field exists, is labelled exactly, and is visible at this size.
    await page.getByRole('button', { name: 'الإعدادات', exact: true }).click()
    const uber = page.getByLabel('عمولة Uber')
    check(`${vp.name}: settings has the "عمولة Uber" field`, await uber.count() === 1)
    await uber.scrollIntoViewIfNeeded()
    check(`${vp.name}: "عمولة Uber" is visible`, await uber.isVisible())
    await context.close()
  }

  check('no page errors across the matrix', pageErrors.length === 0)
  console.log(JSON.stringify({ passed, count: passed.length, screenshots: outDir, pageErrors }, null, 2))
} finally {
  if (browser) await browser.close()
  server.kill('SIGTERM')
}
