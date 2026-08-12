// Thin wrapper around `marked` that (1) renders a flow-doc markdown string to
// HTML and (2) extracts a table of contents from its H2/H3 headings, giving
// each heading a stable anchor id so the right-rail TOC can deep-link to it.
import { marked } from 'marked'
import repos from './data/repos.json'

marked.setOptions({ gfm: true, breaks: false })

// ```mermaid fences become <div class="mermaid"> holding the raw (entity-
// escaped) diagram source; the portal runs mermaid over visible ones after
// render. Other languages fall through to marked's default code renderer.
marked.use({
  renderer: {
    code(token) {
      if ((token.lang || '').trim() !== 'mermaid') return false
      const src = token.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      return `<div class="mermaid">${src}</div>`
    },
  },
})

// Turn a citation path like "denowatts-backend/src/auth/auth.service.ts" into a
// GitHub blob URL, using the repo-prefix → base map. Returns null if unknown.
function githubUrl(path) {
  const i = path.indexOf('/')
  if (i === -1) return null
  const base = repos[path.slice(0, i)]
  return base ? `${base}/${path.slice(i + 1)}` : null
}

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

// Drop the leading H1 — the portal renders the doc title in its own header,
// so showing the markdown's "# Title" again would just duplicate it.
function stripLeadingH1(md) {
  return md.replace(/^\s*#\s+.*\n?/, '')
}

// Pull a leading YAML-ish frontmatter block (--- ... ---) off the top of a doc
// and return it as a plain object. Used for "last updated by / when", status, etc.
function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return { meta: {}, body: md }
  const meta = {}
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':')
    if (i === -1) continue
    const key = line.slice(0, i).trim()
    const val = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    if (key) meta[key] = val
  }
  return { meta, body: md.slice(m[0].length) }
}

// marked HTML-encodes &, <, > etc. — decode them back for the plain-text TOC
// label (otherwise "Edge cases & gotchas" shows as "Edge cases &amp; gotchas").
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
}

// Group each <h2> and the content that follows it (until the next <h2>) into a
// <section> carrying that heading's audience, so a whole section can be shown or
// hidden by view mode. The lead content before the first <h2> is "all".
function wrapSections(html) {
  return html
    .split(/(?=<h2\b)/)
    .map((chunk) => {
      if (!chunk.trim()) return chunk
      const m = chunk.match(/^<h2\b[^>]*\sdata-aud="(\w+)"/)
      return `<section class="doc-sec" data-aud="${m ? m[1] : 'all'}">${chunk}</section>`
    })
    .join('')
}

export function renderDoc(md, flowMap = {}) {
  const { meta, body } = parseFrontmatter(md)
  let html = marked.parse(stripLeadingH1(body))

  // [[name]] wikilinks → in-app section links (flowMap: doc basename sans .md
  // → { key, title }). Unknown names degrade to plain prettified text.
  html = html.replace(/\[\[([a-z0-9-]+)\]\]/gi, (_m, name) => {
    const hit = flowMap[name.toLowerCase()]
    if (hit) return `<a class="wikilink" href="#/${hit.key}">${hit.title}</a>`
    return name.replace(/-/g, ' ')
  })

  // Relative markdown links to sibling docs ("site.md", "flows/site.md") →
  // the same in-app section links instead of 404ing the SPA.
  html = html.replace(/<a href="(?:flows\/)?([a-z0-9-]+)\.md"/gi, (m, name) => {
    const hit = flowMap[name.toLowerCase()]
    return hit ? `<a class="wikilink" href="#/${hit.key}"` : m
  })
  const toc = []
  const seen = {}
  let curAud = 'all' // the audience of the most recent <h2>, inherited by its <h3>s
  html = html.replace(/<(h[23])>([\s\S]*?)<\/\1>/g, (_m, tag, inner) => {
    // A trailing {dev} / {audience} / {all} marker sets the heading's audience.
    let audience = 'all'
    const innerClean = inner.replace(/\s*\{(dev|audience|all)\}\s*$/i, (_mm, a) => {
      audience = a.toLowerCase()
      return ''
    })
    const text = decodeEntities(innerClean.replace(/<[^>]+>/g, ''))
    let id = slugify(text) || 'section'
    if (seen[id]) {
      seen[id] += 1
      id = `${id}-${seen[id]}`
    } else {
      seen[id] = 1
    }
    if (tag === 'h2') curAud = audience
    const eff = tag === 'h2' ? audience : audience !== 'all' ? audience : curAud
    toc.push({ level: tag === 'h2' ? 2 : 3, text, id, audience: eff })
    const da = audience !== 'all' ? ` data-aud="${audience}"` : ''
    return `<${tag} id="${id}"${da}>${innerClean}</${tag}>`
  })

  // Hoist the trailing "Related flows" paragraph out of whatever section it
  // physically follows (usually a {dev} one) so it stays visible in every
  // mode — it's navigation, not technical detail.
  let footer = ''
  const fi = html.lastIndexOf('<p><strong>Related flows:')
  if (fi !== -1) {
    const fe = html.indexOf('</p>', fi)
    if (fe !== -1) {
      footer = html.slice(fi, fe + 4)
      html = html.slice(0, fi) + html.slice(fe + 4)
    }
  }

  html = wrapSections(html)
  if (footer) html += `<section class="doc-sec" data-aud="all">${footer}</section>`

  // Distinguish source-file citations (e.g. `path/to/file.ts:42`, or a bare
  // `:200` continuation) from ordinary inline code like `PENDING` or `USER`,
  // so they can be styled as muted references instead of value chips.
  html = html.replace(/<code>([^<]+)<\/code>/g, (m, inner) => {
    const text = decodeEntities(inner)
    const isSource =
      (text.includes('/') && /\.\w{1,4}(:\d+)?$/.test(text)) || /^:\d+$/.test(text)
    if (!isSource) return m
    const chip = `<code class="src">${inner}</code>`
    const href = githubUrl(text)
    return href
      ? `<a class="src-link" href="${href}" target="_blank" rel="noopener" title="Open ${text} on GitHub">${chip}</a>`
      : chip
  })

  return { html, toc, meta }
}

// ---- Page → prose anchors ----------------------------------------------
// A catalogued page (name + route) is nearly always written about somewhere
// inside its section's flow doc. Find where, so navigating to a page can land
// on the writing itself instead of on the page's summary card.

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Collect every heading anchor with the audience of the <section> it sits in
// (that wrapper is what view mode shows or hides), keyed by position in the
// html so any match can be traced back to the heading above it.
function headingIndex(html) {
  const heads = []
  let aud = 'all'
  const re = /<section class="doc-sec" data-aud="(\w+)">|<(h[23]) id="([^"]+)"[^>]*>([\s\S]*?)<\/\2>/g
  let m
  while ((m = re.exec(html)) !== null) {
    if (m[1]) { aud = m[1]; continue }
    const text = decodeEntities(m[4].replace(/<[^>]+>/g, '')).trim().toLowerCase()
    heads.push({ pos: m.index, id: m[3], aud, text })
  }
  return heads
}

const MAX_ANCHORS = 8

export function mapPageAnchors(html, pages) {
  const heads = headingIndex(html)
  const out = {}
  if (!heads.length) return out

  // Blank out source-citation chips — same length, so every other offset holds
  // — otherwise a route like "/reports" matches inside "src/reports/x.service.ts".
  const hay = html.replace(/<code class="src">[\s\S]*?<\/code>/g, (m) => ' '.repeat(m.length))
  const lower = hay.toLowerCase()
  const headingAbove = (pos) => {
    let hit = null
    for (const h of heads) {
      if (h.pos > pos) break
      hit = h
    }
    return hit
  }

  for (const p of pages) {
    const cands = []
    const push = (h) => {
      if (h && cands.length < MAX_ANCHORS && !cands.some((c) => c.id === h.id)) {
        cands.push({ id: h.id, aud: h.aud })
      }
    }
    const name = String(p.name || '').trim().toLowerCase()
    const route = String(p.route || '')

    // 1. A heading that names the page outright is the best possible landing.
    if (name.length > 2) heads.filter((h) => h.text === name || h.text.includes(name)).forEach(push)
    // 2. The route quoted in the prose — "/foo" must not match "/foo/bar".
    if (route) {
      const rre = new RegExp(escapeRe(route) + '(?![\\w/:?=-])', 'g')
      let m
      while ((m = rre.exec(hay)) !== null) push(headingAbove(m.index))
    }
    // 3. Last resort: the page name mentioned anywhere in the body text.
    if (name.length > 3) {
      const nre = new RegExp('\\b' + escapeRe(name) + '\\b', 'g')
      let m
      while ((m = nre.exec(lower)) !== null) push(headingAbove(m.index))
    }
    if (cands.length) out[p.route] = cands
  }
  return out
}
