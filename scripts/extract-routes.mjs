// scripts/extract-routes.mjs
// Generates/refreshes src/data/pages.generated.json from your app's routes,
// and reports DRIFT (routes added/removed vs the current catalog).
//
// This step is the only framework-specific piece. The example below assumes a
// React Router <Route path="..."> setup discovered by scanning source files.
// Adapt SCAN / ROUTE_REGEX to your router, or replace with the real thing:
//   - React Router  : scan for <Route path="...">  (example below)
//   - Next.js (app) : walk app/ for page.tsx files -> derive route from folder
//   - TanStack Router: read the generated route tree
//
// It NEVER writes aliases.json — your hand-written client phrasing is safe.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, '..')

// ---- config: point this at YOUR app's source -------------------------------
const APP_SRC = process.env.APP_SRC || join(root, '..', 'your-app', 'src')
const ROUTE_REGEX = /<Route\s+[^>]*path=["'`]([^"'`]+)["'`]/g
// ----------------------------------------------------------------------------

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (['.jsx', '.tsx', '.js', '.ts'].includes(extname(full))) out.push(full)
  }
  return out
}

function discoverRoutes() {
  const found = new Set()
  let files = []
  try { files = walk(APP_SRC) } catch {
    console.error(`Could not read APP_SRC=${APP_SRC}. Set APP_SRC to your app's src folder.`)
    process.exit(1)
  }
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    let m
    while ((m = ROUTE_REGEX.exec(src))) {
      if (m[1] && m[1] !== '*') found.add(m[1].startsWith('/') ? m[1] : '/' + m[1])
    }
  }
  return [...found].sort()
}

const catalogPath = join(root, 'src/data/pages.generated.json')
const current = JSON.parse(readFileSync(catalogPath, 'utf8'))
const currentRoutes = new Set(current.map(p => p.route))
const discovered = discoverRoutes()

const added = discovered.filter(r => !currentRoutes.has(r))
const removed = [...currentRoutes].filter(r => !discovered.includes(r))

console.log(`Discovered ${discovered.length} routes.`)
if (added.length)   console.log('\n+ NEW (add purpose/actions, then add aliases):\n  ' + added.join('\n  '))
if (removed.length) console.log('\n- GONE (page removed from app?):\n  ' + removed.join('\n  '))
if (!added.length && !removed.length) console.log('No drift — catalog matches the app.')

// Append skeletons for new routes so you only fill purpose/actions/module.
if (added.length) {
  const stubs = added.map(route => ({
    name: route.split('/').filter(Boolean).pop() || 'Home',
    route,
    module: 'TODO',
    purpose: 'TODO',
    actions: [],
    flow: '',
  }))
  writeFileSync(catalogPath, JSON.stringify([...current, ...stubs], null, 2) + '\n')
  console.log(`\nWrote ${stubs.length} stub(s) to pages.generated.json — fill the TODOs.`)
}
