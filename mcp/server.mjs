#!/usr/bin/env node
// denowatts-docs-brain — MCP server (stdio) exposing the Denowatts
// documentation as a queryable knowledge base for any agent/project.
//
// Tools:
//   search_docs(query, mode?)   full-text search across all flow docs
//   get_doc(name, mode?)        one doc, business view or full developer view
//   affected_docs(files)        which docs/sections cite these source files
//   check_drift()               compare GitHub repos vs last-reviewed baseline
//   get_findings(priority?)     the verified code-review findings checklist
//   define(term)                look a term up in the solar glossary
//
// Register (user scope, available in every project on this machine):
//   claude mcp add -s user denowatts-docs-brain -- node <abs path>/mcp/server.mjs

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCitationIndex } from '../scripts/drift-check.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FLOWS = join(ROOT, 'flows')

const listDocs = () =>
  readdirSync(FLOWS).filter((f) => f.endsWith('.md') && !/coverage|COVERAGE|DRIFT/i.test(f))
const readDoc = (f) => readFileSync(join(FLOWS, f), 'utf8')

// Strip {dev}-tagged H2 sections for the business view (mirrors the docs app).
function businessView(md) {
  const lines = md.split('\n')
  const out = []
  let skipping = false
  for (const line of lines) {
    const h2 = line.match(/^##\s+.*$/)
    if (h2) skipping = /\{dev\}\s*$/.test(line)
    if (!skipping) out.push(line)
  }
  return out.join('\n')
}

const resolveDoc = (name) => {
  const want = String(name).toLowerCase().replace(/\.md$/, '').replace(/[\s_]+/g, '-')
  return listDocs().find((f) => f.replace(/\.md$/, '').toLowerCase() === want)
    || listDocs().find((f) => f.toLowerCase().includes(want))
}

const text = (s) => ({ content: [{ type: 'text', text: s }] })

const server = new McpServer({ name: 'denowatts-docs-brain', version: '1.0.0' })

server.registerTool('search_docs', {
  description: 'Full-text search across all Denowatts flow docs (28 features/modules). Returns doc, section, and matching snippet for each hit.',
  inputSchema: {
    query: z.string().describe('text to search for (case-insensitive)'),
    mode: z.enum(['business', 'developer']).optional().describe('restrict to the business view (default: search everything)'),
  },
}, async ({ query, mode }) => {
  const q = query.toLowerCase()
  const hits = []
  for (const f of listDocs()) {
    let md = readDoc(f)
    if (mode === 'business') md = businessView(md)
    let section = '(intro)'
    for (const line of md.split('\n')) {
      const h = line.match(/^##\s+(.*?)(?:\s*\{\w+\})?\s*$/)
      if (h) { section = h[1]; continue }
      const i = line.toLowerCase().indexOf(q)
      if (i !== -1) {
        hits.push({ doc: f, section, snippet: line.trim().slice(0, 240) })
        if (hits.length >= 40) break
      }
    }
    if (hits.length >= 40) break
  }
  return text(hits.length ? JSON.stringify(hits, null, 2) : `No matches for "${query}".`)
})

server.registerTool('get_doc', {
  description: 'Return one Denowatts flow doc. mode=business gives the plain-language view; mode=developer (default) gives everything including implementation detail and file:line citations.',
  inputSchema: {
    name: z.string().describe('doc name, e.g. "channels", "site", "authentication", "review-findings", "solar-glossary"'),
    mode: z.enum(['business', 'developer']).optional(),
  },
}, async ({ name, mode }) => {
  const f = resolveDoc(name)
  if (!f) return text(`Unknown doc "${name}". Available: ${listDocs().map((d) => d.replace('.md', '')).join(', ')}`)
  const md = readDoc(f)
  return text(mode === 'business' ? businessView(md) : md)
})

server.registerTool('affected_docs', {
  description: 'Given source-file paths from denowatts-portal or denowatts-backend (e.g. "denowatts-backend/src/channels/services/channels.service.ts" or just "src/channels/..."), return which docs and sections cite them. Use BEFORE changing code to know which documented behavior you touch.',
  inputSchema: { files: z.array(z.string()).describe('source file paths; repo prefix optional') },
}, async ({ files }) => {
  const index = buildCitationIndex()
  const results = {}
  for (const raw of files) {
    const norm = raw.replace(/^\.?\//, '')
    const keys = [...index.keys()].filter((k) => k === norm || k.endsWith('/' + norm) || k.includes(norm))
    const matches = []
    for (const k of keys)
      for (const [doc, e] of index.get(k))
        matches.push({ citedAs: k, doc, sections: [...e.sections] })
    results[raw] = matches.length ? matches : 'not cited by any doc (undocumented surface?)'
  }
  return text(JSON.stringify(results, null, 2))
})

server.registerTool('check_drift', {
  description: 'Compare the GitHub source repos against the last-reviewed baseline and report which docs are affected by new commits. Requires gh CLI auth.',
  inputSchema: { sinceDays: z.number().optional().describe('ad-hoc window instead of the stored baseline') },
}, async ({ sinceDays }) => {
  const args = [join(ROOT, 'scripts', 'drift-check.mjs'), '--json']
  if (sinceDays) args.push('--since-days', String(sinceDays))
  try {
    const out = execFileSync('node', args, { maxBuffer: 32 * 1024 * 1024 }).toString()
    return text(out)
  } catch (e) {
    // exit code 2 = drift found; stdout still has the JSON
    if (e.status === 2 && e.stdout) return text(e.stdout.toString())
    return text(`drift check failed: ${e.message}`)
  }
})

server.registerTool('get_findings', {
  description: 'Return the verified code-review findings (security holes, confirmed bugs, placeholders, dead code, performance, architecture questions). Optionally one priority tier.',
  inputSchema: { priority: z.enum(['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6']).optional().describe('P0=new findings, P1=security, P2=bugs, ...') },
}, async ({ priority }) => {
  const md = readFileSync(join(FLOWS, 'REVIEW-FINDINGS.md'), 'utf8')
  if (!priority) return text(md)
  const tierRe = priority === 'P0' ? /^## ⚡/ : new RegExp(`^## ${priority} `)
  const parts = md.split(/^(?=## )/m)
  const tier = parts.find((p) => tierRe.test(p))
  return text(tier || `No section for ${priority}.`)
})

server.registerTool('define', {
  description: 'Look a solar/platform term up in the Denowatts glossary (e.g. "EPI", "POA", "capacity test", "channel").',
  inputSchema: { term: z.string() },
}, async ({ term }) => {
  const md = readFileSync(join(FLOWS, 'solar-glossary.md'), 'utf8')
  const q = term.toLowerCase()
  const parts = md.split(/^(?=#{2,4} )/m)
  const hits = parts.filter((p) => p.split('\n')[0].toLowerCase().includes(q))
  if (hits.length) return text(hits.slice(0, 3).join('\n'))
  const lines = md.split('\n').filter((l) => l.toLowerCase().includes(q))
  return text(lines.length ? lines.slice(0, 10).join('\n') : `"${term}" not found in the glossary.`)
})

await server.connect(new StdioServerTransport())
