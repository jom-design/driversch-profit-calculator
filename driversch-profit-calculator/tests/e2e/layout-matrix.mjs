import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'

// Full browser visual matrix: six screens × six viewports × two locales × two themes.
const require = createRequire(import.meta.url)
const axePath = require.resolve('axe-core')
// Use a per-process high port so stale preview servers cannot make the readiness probe
// pass against the wrong process while the test server itself fails to bind.
const port = Number(process.env.LAYOUT_PORT ?? (18000 + (process.pid % 10000)))
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
  { n���q�^