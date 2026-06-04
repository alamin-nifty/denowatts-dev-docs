// scripts/screenshot.mjs
// Screenshots every page in pages.generated.json into public/screens/<slug>.png
// using the same slug rule the React app expects.
//
//   1. start your real app (e.g. `npm run dev` in the app repo) so BASE_URL serves it
//   2. node scripts/screenshot.mjs
//
// Re-run whenever the UI changes — this is what keeps the catalog "living".

import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { routeSlug } from '../src/data/slug.js'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, '..')

// ---- config ----------------------------------------------------------------
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const OUT_DIR  = join(root, 'public', 'screens')

// For routes with params (e.g. /orders/:id), supply a sample value to visit a
// real page instead of skipping it. Anything not listed is visited with the
// param stripped (".../:id" -> ".../").
const SAMPLE_PARAMS = {
  '/orders/:id':    '/orders/1024',
  '/customers/:id': '/customers/42',
}

// If your app needs login, fill these and the script will sign in once first.
const AUTH = {
  enabled: false,
  loginUrl: '/login',
  steps: async (page) => {
    await page.fill('input[name="email"]', process.env.APP_USER || '')
    await page.fill('input[name="password"]', process.env.APP_PASS || '')
    await page.click('button[type="submit"]')
    await page.waitForLoadState('networkidle')
  },
}
// ----------------------------------------------------------------------------

const pages = JSON.parse(readFileSync(join(root, 'src/data/pages.generated.json'), 'utf8'))
mkdirSync(OUT_DIR, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

if (AUTH.enabled) {
  await page.goto(BASE_URL + AUTH.loginUrl)
  await AUTH.steps(page)
}

let ok = 0, fail = 0
for (const p of pages) {
  const path = SAMPLE_PARAMS[p.route] || p.route.replace(/\/:[^/]+/g, '')
  const file = join(OUT_DIR, `${routeSlug(p.route)}.png`)
  try {
    await page.goto(BASE_URL + path, { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(500) // let animations settle
    await page.screenshot({ path: file })
    console.log(`✓ ${p.route}  ->  screens/${routeSlug(p.route)}.png`)
    ok++
  } catch (e) {
    console.warn(`✗ ${p.route}  (${e.message.split('\n')[0]})`)
    fail++
  }
}

await browser.close()
console.log(`\nDone. ${ok} captured, ${fail} failed.`)
