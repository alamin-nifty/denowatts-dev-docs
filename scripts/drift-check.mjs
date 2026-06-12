#!/usr/bin/env node
// Drift detector: compares the GitHub source repos against the last-reviewed
// SHAs and maps changed files onto the docs that cite them.
//
// The docs are the dependency map: every claim cites `repo/path.ts:line`, so
// "which docs does this commit affect" is a mechanical intersection.
//
// Usage:
//   node scripts/drift-check.mjs                 # report drift since last reviewed SHAs
//   node scripts/drift-check.mjs --json          # machine-readable output
//   node scripts/drift-check.mjs --seed          # set baseline = current HEADs (no report)
//   node scripts/drift-check.mjs --since-days 7  # ad-hoc: compare against HEAD~(7 days)
//   node scripts/drift-check.mjs --mark-reviewed # advance baselines to current HEADs
//
// State lives in scripts/drift-state.json; reports in reports/.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FLOWS = join(ROOT, 'flows')
const STATE_FILE = join(ROOT, 'scripts', 'drift-state.json')
const REPORTS = join(ROOT, 'reports')

const REPOS = (() => {
  const map = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'repos.json'), 'utf8'))
  // "https://github.com/org/repo/blob/branch" -> { prefix, slug: org/repo, branch }
  return Object.entries(map).map(([prefix, url]) => {
    const m = url.match(/github\.com\/([^/]+\/[^/]+)\/blob\/([^/]+)/)
    return { prefix, slug: m[1], branch: m[2] }
  })
})()

const gh = (path) => JSON.parse(execFileSync('gh', ['api', path], { maxBuffer: 64 * 1024 * 1024 }).toString())

// ---------- citation index: source file -> [{ doc, section, ranges }] ----------
const CITE_RE = /(denowatts-(?:portal|backend))\/([\w@$./[\]-]+?\.(?:ts|tsx|js|mjs|jsx|json))(?::(\d+)(?:[-–](\d+))?)?/g

export function buildCitationIndex() {
  const index = new Map() // "repoPrefix/path" -> Map(doc -> { sections:Set, ranges:[] })
  const docs = readdirSync(FLOWS).filter((f) => f.endsWith('.md') && !/coverage|COVERAGE|REVIEW|DRIFT/i.test(f))
  for (const doc of docs) {
    const text = readFileSync(join(FLOWS, doc), 'utf8')
    let section = '(intro)'
    for (const line of text.split('\n')) {
      const h = line.match(/^##\s+(.*?)(?:\s*\{\w+\})?\s*$/)
      if (h) { section = h[1]; continue }
      for (const m of line.matchAll(CITE_RE)) {
        const key = `${m[1]}/${m[2]}`
        if (!index.has(key)) index.set(key, new Map())
        const perDoc = index.get(key)
        if (!perDoc.has(doc)) perDoc.set(doc, { sections: new Set(), ranges: [] })
        const e = perDoc.get(doc)
        e.sections.add(section)
        if (m[3]) e.ranges.push([+m[3], +(m[4] || m[3])])
      }
    }
  }
  return index
}

// ---------- patch hunks -> changed old-file line ranges ----------
function changedRanges(patch) {
  const ranges = []
  if (!patch) return ranges
  for (const m of patch.matchAll(/^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/gm)) {
    const start = +m[1]
    const len = m[2] === undefined ? 1 : +m[2]
    ranges.push([start, start + Math.max(len, 1) - 1])
  }
  return ranges
}
const overlaps = (a, b) => a.some(([s1, e1]) => b.some(([s2, e2]) => s1 <= e2 && s2 <= e1))

// ---------- main (only when run directly, not when imported) ----------
import { pathToFileURL } from 'node:url'
const RUN_DIRECT = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (RUN_DIRECT) await main()

async function main() {
const args = process.argv.slice(2)
const flag = (f) => args.includes(f)
const optVal = (f) => { const i = args.indexOf(f); return i === -1 ? null : args[i + 1] }

const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {}
const heads = {}
for (const r of REPOS) heads[r.slug] = gh(`repos/${r.slug}/commits/${r.branch}`).sha

if (flag('--seed') || flag('--mark-reviewed')) {
  for (const r of REPOS) state[r.slug] = { sha: heads[r.slug], at: new Date().toISOString() }
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n')
  console.log('Baselines set to current HEADs:')
  for (const r of REPOS) console.log(' ', r.slug, heads[r.slug].slice(0, 10))
  process.exit(0)
}

const sinceDays = optVal('--since-days')
const index = buildCitationIndex()
const out = { generatedAt: new Date().toISOString(), repos: [] }

for (const r of REPOS) {
  let base = state[r.slug]?.sha
  if (sinceDays) {
    const since = new Date(Date.now() - +sinceDays * 864e5).toISOString()
    const commits = gh(`repos/${r.slug}/commits?sha=${r.branch}&since=${since}&per_page=100`)
    base = commits.length ? `${commits[commits.length - 1].sha}~1` : heads[r.slug]
  }
  if (!base) { out.repos.push({ slug: r.slug, error: 'no baseline — run with --seed first' }); continue }

  const head = heads[r.slug]
  if (base.replace(/~1$/, '') === head) { out.repos.push({ slug: r.slug, base, head, commits: [], affected: [], uncited: [] }); continue }

  const cmp = gh(`repos/${r.slug}/compare/${base}...${head}`)
  const commits = cmp.commits.map((c) => ({ sha: c.sha.slice(0, 10), message: c.commit.message.split('\n')[0], author: c.commit.author?.name }))
  const affected = []
  const uncited = []
  for (const f of cmp.files || []) {
    const key = `${r.prefix}/${f.filename}`
    const hits = index.get(key)
    if (!hits) {
      if (f.status === 'added' && /^src\//.test(f.filename) && !/\.spec\./.test(f.filename)) uncited.push({ file: f.filename, status: f.status })
      continue
    }
    const fileRanges = changedRanges(f.patch)
    for (const [doc, e] of hits) {
      const citedHit = e.ranges.length && fileRanges.length ? overlaps(fileRanges, e.ranges) : null
      affected.push({
        file: f.filename, status: f.status, doc,
        sections: [...e.sections],
        severity: f.status === 'removed' ? 'CITED FILE DELETED' : citedHit ? 'CITED LINES TOUCHED' : 'FILE CHANGED',
      })
    }
  }
  out.repos.push({ slug: r.slug, base: base.slice(0, 10), head: head.slice(0, 10), commits, affected, uncited, truncated: (cmp.files || []).length >= 300 })
}

if (flag('--json')) { console.log(JSON.stringify(out, null, 2)); process.exit(0) }

// ---------- markdown report ----------
let md = `# Doc drift report — ${out.generatedAt.slice(0, 10)}\n\n`
let any = false
for (const r of out.repos) {
  md += `## ${r.slug}\n\n`
  if (r.error) { md += `> ${r.error}\n\n`; continue }
  if (!r.commits.length) { md += `No changes since last review (\`${String(r.base).slice(0, 10)}\`).\n\n`; continue }
  any = true
  md += `\`${r.base}\` → \`${r.head}\` — **${r.commits.length} commit(s)**\n\n`
  for (const c of r.commits.slice(0, 30)) md += `- \`${c.sha}\` ${c.message}\n`
  if (r.commits.length > 30) md += `- …and ${r.commits.length - 30} more\n`
  md += '\n'
  if (r.affected.length) {
    md += `### Affected docs\n\n| Doc | Section(s) | Source file | Severity |\n|---|---|---|---|\n`
    const byDoc = {}
    for (const a of r.affected) (byDoc[a.doc] ||= []).push(a)
    for (const [doc, items] of Object.entries(byDoc).sort())
      for (const a of items) md += `| ${doc} | ${a.sections.join(' · ')} | \`${a.file}\` | ${a.severity} |\n`
    md += '\n'
  } else md += `_No cited files touched._\n\n`
  if (r.uncited.length) {
    md += `### New source files not covered by any doc\n\n`
    for (const u of r.uncited) md += `- \`${u.file}\`\n`
    md += '\n'
  }
  if (r.truncated) md += `> ⚠️ GitHub compare returned 300+ files; list may be truncated.\n\n`
}
md += `---\n*Generated by \`scripts/drift-check.mjs\`. After updating the docs, run with \`--mark-reviewed\` to advance the baseline.*\n`

mkdirSync(REPORTS, { recursive: true })
const reportPath = join(REPORTS, `drift-${out.generatedAt.slice(0, 10)}.md`)
writeFileSync(reportPath, md)
console.log(md)
console.error(`\nReport written to ${reportPath}`)
process.exit(any ? 2 : 0) // exit 2 = drift found (useful for cron/CI)
}
