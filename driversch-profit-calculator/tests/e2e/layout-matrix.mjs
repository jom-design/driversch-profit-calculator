import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'

// Full browser visual matrix: six screens × six viewports × two locales × two themes.
const require = createRequire(import.meta.url)
const axePath = require.resolve('axe-core')
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
  { name: 'settings', open: async page => page.getByRole('button', { name: /Settings|الإعدادات/ }).click() },
  { name: 'assistant', open: async page => page.getByRole('button', { name: /Smart assistant|المساعد الذكي/ }).click() },
  { name: 'inbox', open: async page => page.getByRole('button', { name: /Captured trips|الرحلات الملتقطة/ }).click() },
  { name: 'history', open: async page => page.getByRole('button', { name: /Trip history|سجل الرحلات/ }).click() },
  { name: 'reports', open: async page => page.getByRole('button', { name: /Reports|التقارير/ }).click() }
]
const locales = ['ar', 'en']
const themes = ['dark', 'light']
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
    for (const locale of locales) {
      for (const theme of themes) {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          locale: locale === 'ar' ? 'ar-EG' : 'en-US',
          colorScheme: 'dark',
          deviceScaleFactor: 2
        })
        const page = await context.newPage()
        page.on('pageerror', error => pageErrors.push(vp.name + '/' + locale + '/' + theme + ': ' + error.message))
        page.on('dialog', dialog => { void dialog.accept() })
        await page.goto(baseUrl, { waitUntil: 'networkidle' })
        await page.addScriptTag({ path: axePath })

        if (locale === 'en') {
          await page.locator('.utility-btn').first().click()
          await page.waitForFunction(() => document.documentElement.lang === 'en' && document.documentElement.dir === 'ltr')
        }
        if (theme === 'light') {
          await page.locator('.utility-btn').nth(1).click()
          await page.waitForFunction(() => document.documentElement.dataset.theme === 'light')
        }
        const expectedDir = locale === 'ar' ? 'rtl' : 'ltr'
        check(`${vp.name}/${locale}/${theme}: locale and direction are applied`,
          await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, theme: document.documentElement.dataset.theme }))
            .then(state => state.lang === locale && state.dir === expectedDir && state.theme === theme))

        // Reload proves both preferences survive a fresh document lifecycle.
        await page.reload({ waitUntil: 'networkidle' })
        check(`${vp.name}/${locale}/${theme}: locale and theme persist after reload`,
          await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, theme: document.documentElement.dataset.theme }))
            .then(state => state.lang === locale && state.dir === expectedDir && state.theme === theme))

        for (const screen of screens) {
          await screen.open(page)
          await delay(100)
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
          check(`${vp.name}/${locale}/${theme} ${screen.name}: no horizontal page scroll`, overflow <= 0)
          const offscreen = await page.evaluate(() => {
            const controls = [...document.querySelectorAll('input.numeric-input, textarea, button')]
            return controls.filter(el => !el.closest('.nav')).filter(el => {
              const r = el.getBoundingClientRect()
              return r.width > 0 && r.height > 0 && (r.right > window.innerWidth + 1 || r.left < -1)
            }).map(el => (el.className || el.tagName) + ' "' + (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30) + '"')
          })
          check(`${vp.name}/${locale}/${theme} ${screen.name}: controls stay inside viewport (offending: ${offscreen.join(' | ') || 'none'})`, offscreen.length === 0)
          const contrast = await page.evaluate(async () => window.axe.run(document, {
            runOnly: { type: 'rule', values: ['color-contrast'] }
          }))
          const contrastFailures = contrast.violations.flatMap(v => v.nodes.map(n => ({ id: v.id, target: n.target, summary: n.failureSummary })))
          check(`${vp.name}/${locale}/${theme} ${screen.name}: no color contrast violations (${JSON.stringify(contrastFailures).slice(0, 500)})`, contrastFailures.length === 0)
          await page.screenshot({ path: `${outDir}/${vp.name}-${screen.name}-${locale}-${theme}.png`, fullPage: true })
          if (screen.name !== 'calculator') {
            await page.getByRole('button', { name: /Trip Calculator|حاسبة المشوار/ }).click()
          }
        }

        await page.getByRole('button', { name: /Settings|الإعدادات/ }).click()
        const uber = page.getByLabel(/Uber commission|عمولة Uber/)
        check(`${vp.name}/${locale}/${theme}: Uber commission field exists`, await uber.count() === 1)
        await uber.scrollIntoViewIfNeeded()
        check(`${vp.name}/${locale}/${theme}: Uber commission field is visible`, await uber.isVisible())
        await context.close()
      }
    }
  }

  // First-install preference follows the OS when the user has not chosen a theme.
  const systemContext = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light' })
  const systemPage = await systemContext.newPage()
  await systemPage.goto(baseUrl, { waitUntil: 'networkidle' })
  check('first launch respects system light preference', await systemPage.evaluate(() => document.documentElement.dataset.theme === 'light'))
  await systemContext.close()

  check('no page errors across the complete locale/theme/viewport matrix', pageErrors.length === 0)
  console.log(JSON.stringify({ passed, count: passed.length, screenshots: outDir, viewportCount: viewports.length, screenCount: screens.length, localeCount: locales.length, themeCount: themes.length, pageErrors }, null, 2))
} finally {
  if (browser) await browser.close()
  server.kill('SIGTERM')
}
