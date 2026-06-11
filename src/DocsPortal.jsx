import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import sections from './data/sections.json'
import pages from './data/pages.generated.json'
import aliasMap from './data/aliases.json'
import { renderDoc } from './md.js'

// Eagerly pull every flow doc's raw markdown at build time, keyed by basename
// (e.g. "authentication.md"). Adding a new flows/*.md file needs no code change.
const flowModules = import.meta.glob('../flows/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const FLOWS = Object.fromEntries(
  Object.entries(flowModules).map(([path, md]) => [path.split('/').pop(), md]),
)

// Attach each section's documented sub-pages (from pages.generated.json) and a
// pre-rendered flow doc when one exists. Module names are matched to section
// keys ignoring spaces/case ("Field Setup" -> "FieldSetup", "Device Types" ->
// "DeviceTypes"), so human-entered module labels still attach.
const normKey = (x) => String(x || '').replace(/\s+/g, '').toLowerCase()

// doc basename (sans .md) → { key, title }, so [[wikilinks]] and relative
// .md links inside docs resolve to in-app section links.
const FLOW_MAP = Object.fromEntries(
  sections
    .filter((s) => s.flow)
    .map((s) => [s.flow.split('/').pop().replace(/\.md$/, '').toLowerCase(), { key: s.key, title: s.title }]),
)

const SECTIONS = sections.map((s) => {
  const subPages = pages
    .filter((p) => normKey(p.module) === normKey(s.key))
    .map((p) => ({ ...p, aliases: aliasMap[p.route] || [] }))
  const flowFile = s.flow ? s.flow.split('/').pop() : null
  const rawMd = flowFile ? FLOWS[flowFile] : null
  return {
    ...s,
    pages: subPages,
    doc: rawMd ? renderDoc(rawMd, FLOW_MAP) : null,
    documented: Boolean(rawMd),
  }
})

// Full-text index over the rendered docs, one entry per mode-section, built
// once at module load. Powers content search: each entry knows its heading
// anchor and audience so a hit can deep-link (and flip to Developer mode when
// the match lives in a {dev} section).
const stripTags = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const DOC_INDEX = SECTIONS.flatMap((s) => {
  if (!s.doc) return []
  return s.doc.html
    .split(/(?=<section class="doc-sec")/)
    .map((chunk) => {
      const aud = (chunk.match(/data-aud="(\w+)"/) || [])[1] || 'all'
      const id = (chunk.match(/<h[23] id="([^"]+)"/) || [])[1] || null
      const heading = stripTags((chunk.match(/<h2[^>]*>([\s\S]*?)<\/h2>/) || [, ''])[1]) || s.title
      const text = stripTags(chunk)
      return { key: s.key, sTitle: s.title, aud, id, heading, text, lower: text.toLowerCase() }
    })
    .filter((c) => c.text)
})

const ICONS = {
  lock: 'M6 10V7a6 6 0 1 1 12 0v3M4 10h16v11H4z',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  panel: 'M3 4h18v16H3zM3 9h18M9 9v11',
  pulse: 'M3 12h4l3 8 4-16 3 8h4',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  beaker: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3',
  wrench: 'M21 4a5 5 0 0 1-6.5 6.5L4 21l-1-1 10.5-10.5A5 5 0 0 1 20 3z',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1l-.4-2.5H9.6l-.4 2.5a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.4 2.5h4.8l.4-2.5a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6a7 7 0 0 0 .1-1z',
}

function Icon({ name, className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name] || ICONS.grid} />
    </svg>
  )
}

function Logo() {
  return (
    <div className="logo">
      <span className="logo-mark"><span className="logo-dot" /></span>
      <span className="logo-text">DenoWatts<span className="logo-sub">docs</span></span>
    </div>
  )
}

export default function DocsPortal() {
  const [active, setActive] = useState(() => location.hash.replace(/^#\/?/, '') || null)
  const [activePage, setActivePage] = useState(null)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState(() => {
    // Two modes only: 'audience' (Business) and 'dev' (Developer). Any legacy
    // value (e.g. the old 'blend') falls back to Business.
    try {
      const saved = localStorage.getItem('docMode')
      return saved === 'dev' || saved === 'audience' ? saved : 'audience'
    } catch { return 'audience' }
  })
  const [menuOpen, setMenuOpen] = useState(false)
  const onMode = useCallback((m) => {
    setMode(m)
    try { localStorage.setItem('docMode', m) } catch { /* ignore */ }
  }, [])
  const inputRef = useRef(null)
  const contentRef = useRef(null)

  const go = useCallback((key) => {
    setActive(key)
    setActivePage(null)
    setMenuOpen(false)
    history.replaceState(null, '', key ? `#/${key}` : '#')
    if (contentRef.current) contentRef.current.scrollTop = 0
  }, [])

  // Select a specific sub-page: jump to its section (if needed), highlight it
  // in the sidebar, and expand its card. Passing null clears the selection.
  const selectPage = useCallback((key, route) => {
    setActive(key)
    setActivePage(route)
    history.replaceState(null, '', `#/${key}`)
  }, [])

  useEffect(() => {
    const onHash = () => setActive(location.hash.replace(/^#\/?/, '') || null)
    window.addEventListener('hashchange', onHash)
    const onKey = (e) => {
      if (e.key === '/' && document.activeElement !== inputRef.current) {
        e.preventDefault(); inputRef.current?.focus()
      }
      if (e.key === 'Escape') { setQuery(''); inputRef.current?.blur(); setMenuOpen(false) }
    }
    document.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('hashchange', onHash); document.removeEventListener('keydown', onKey) }
  }, [])

  const term = query.trim().toLowerCase()
  const activeSection = SECTIONS.find((s) => s.key === active) || null

  const searchHits = useMemo(() => {
    if (!term) return null
    const hits = []
    for (const s of SECTIONS) {
      if ([s.title, s.summary].join(' ').toLowerCase().includes(term)) hits.push({ type: 'section', s })
      for (const p of s.pages) {
        const hay = [p.name, p.route, p.purpose, ...(p.aliases || []), ...(p.actions || [])].join(' ').toLowerCase()
        if (hay.includes(term)) hits.push({ type: 'page', s, p })
      }
    }
    // Full-text hits inside the docs themselves, capped to keep the list sane.
    let docHits = 0
    for (const c of DOC_INDEX) {
      if (docHits >= 25) break
      const i = c.lower.indexOf(term)
      if (i === -1) continue
      const start = Math.max(0, i - 60)
      const snippet = (start > 0 ? '…' : '') + c.text.slice(start, i + term.length + 100).trim() + '…'
      hits.push({ type: 'doc', s: SECTIONS.find((x) => x.key === c.key), c, snippet })
      docHits += 1
    }
    return hits
  }, [term])

  // Open a search hit: clear the search, jump to the section, flip to
  // Developer mode when the match lives in a {dev}-only chunk, then scroll
  // to the matched heading once the doc has rendered.
  const openHit = useCallback((key, c) => {
    setQuery('')
    if (c && c.aud === 'dev' && mode !== 'dev') onMode('dev')
    go(key)
    if (c?.id) setTimeout(() => document.getElementById(c.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 180)
  }, [mode, onMode, go])

  const documentedCount = SECTIONS.filter((s) => s.documented).length

  return (
    <div className="app">
      <div className={`sidebar-overlay${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(false)} />
      <aside className={`sidebar${menuOpen ? ' open' : ''}`}>
        <div className="sidebar-header">
          <Logo />
          <button className="sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="searchwrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search docs" autoComplete="off" />
          <span className="kbd">/</span>
        </div>

        <nav className="nav">
          <button className={'nav-home' + (active === null ? ' active' : '')} onClick={() => go(null)}>
            Overview
          </button>
          {[...new Set(SECTIONS.map((s) => s.group || 'Sections'))].map((group) => (
            <div key={group}>
              <div className="nav-label">{group}</div>
              {SECTIONS.filter((s) => (s.group || 'Sections') === group).map((s) => (
                <div key={s.key} className="nav-group">
                  <button className={'nav-item' + (active === s.key ? ' active' : '') + (s.documented ? '' : ' muted')}
                    onClick={() => go(s.key)}>
                    <Icon name={s.icon} className="nav-icon" />
                    <span>{s.title}</span>
                    {s.documented
                      ? <span className="pill-count">{s.pages.length}</span>
                      : <span className="pill-soon">soon</span>}
                  </button>
                  {active === s.key && s.pages.length > 0 && (
                    <div className="nav-children">
                      {s.pages.map((p) => (
                        <button key={p.route}
                          className={'nav-child' + (activePage === p.route ? ' active' : '')}
                          onClick={() => selectPage(s.key, p.route)}>
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <main className="main" ref={contentRef}>
        <div className="mobile-header">
          <button className="menu-toggle" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
          <Logo />
        </div>
        {searchHits
          ? <SearchResults hits={searchHits} term={term} onPick={openHit} />
          : activeSection
            ? <SectionView key={activeSection.key} section={activeSection} onHome={() => go(null)}
                activePage={activePage} onSelectPage={(route) => setActivePage(route)}
                mode={mode} onMode={onMode} />
            : <Overview sections={SECTIONS} documentedCount={documentedCount} onPick={go} />}
      </main>
    </div>
  )
}

function slug(route) {
  return route.replace(/^\/+/, '').replace(/[:/]+/g, '-').replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'home'
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// Format an ISO date (YYYY-MM-DD) without timezone drift.
function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  if (!m) return iso || ''
  return `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}`
}

function DocMeta({ meta }) {
  if (!meta || (!meta.updated_at && !meta.owner)) return null
  return (
    <div className="doc-meta">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
      </svg>
      <span>
        Last updated
        {meta.updated_at && <> on <strong>{formatDate(meta.updated_at)}</strong></>}
        {meta.owner && <> by <strong>{meta.owner}</strong></>}
      </span>
      {meta.version && <span className="doc-meta-tag">v{meta.version}</span>}
      {meta.status && <span className={'doc-meta-status status-' + meta.status}>{meta.status}</span>}
    </div>
  )
}

function Overview({ sections, documentedCount, onPick }) {
  return (
    <div className="page fade">
      <header className="hero">
        <div className="eyebrow">DenoWatts · Documentation</div>
        <h1>The ground truth, <span className="accent">documented</span>.</h1>
        <p className="lede">
          Business logic traced across the portal and backend — one canonical doc per feature,
          every claim cited to a file. {documentedCount} of {sections.length} sections documented so far.
        </p>
      </header>
      <div className="tiles">
        {sections.map((s) => (
          <button key={s.key} className={'tile' + (s.documented ? '' : ' tile-soon')} onClick={() => onPick(s.key)}>
            <span className="tile-icon"><Icon name={s.icon} /></span>
            <span className="tile-title">{s.title}</span>
            <span className="tile-summary">{s.summary}</span>
            <span className="tile-foot">
              {s.documented ? `${s.pages.length} pages documented` : 'Not documented yet'}
              <span className="tile-arrow">→</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

const MODES = [
  { key: 'audience', label: 'Business', hint: 'Pure business logic — plain language, no code' },
  { key: 'dev', label: 'Developer', hint: 'Business logic + implementation detail + solar terms' },
]

function ModeBar({ mode, onMode }) {
  const current = MODES.find((m) => m.key === mode) || MODES[0]
  return (
    <div className="modebar">
      <div className="modebar-text">
        <span className="modebar-label">View</span>
        <span className="modebar-hint">{current.hint}</span>
      </div>
      <div className="seg" role="tablist" aria-label="Documentation view mode">
        {MODES.map((m) => (
          <button key={m.key} role="tab" aria-selected={mode === m.key}
            className={'seg-btn' + (mode === m.key ? ' active' : '')} onClick={() => onMode(m.key)}>
            {m.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function SectionView({ section, onHome, activePage, onSelectPage, mode, onMode }) {
  // The whole "Pages in this section" list is collapsed into one trunk by
  // default; selecting a page from the sidebar forces it open.
  const [pagesOpen, setPagesOpen] = useState(false)
  const pagesShown = pagesOpen || Boolean(activePage)

  // When a page is selected (from the sidebar or a card click), scroll its
  // expanded card into view.
  useEffect(() => {
    if (!activePage) return
    const el = document.getElementById('page-' + slug(activePage))
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [activePage])

  return (
    <div className="page fade">
      {section.documented && <ModeBar mode={mode} onMode={onMode} />}
      <div className="crumbs">
        <button onClick={onHome}>Overview</button>
        <span>/</span>
        <span className="crumb-current">{section.title}</span>
      </div>

      <header className="doc-head">
        <span className="doc-icon"><Icon name={section.icon} /></span>
        <div>
          <h1>{section.title}</h1>
          <p className="lede">{section.summary}</p>
          {section.doc && <DocMeta meta={section.doc.meta} />}
        </div>
      </header>

      {section.pages.length > 0 && (
        <section className="pagelist">
          <button className={'pagelist-head' + (pagesShown ? ' open' : '')}
            aria-expanded={pagesShown} onClick={() => setPagesOpen((o) => !o)}>
            <span className="block-label">Pages in this section</span>
            <span className="pagelist-hint">{section.pages.length} pages</span>
            <svg className="chevron pagelist-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {pagesShown && (
            <div className="pagelist-body fade-in">
              {section.pages.map((p) => {
                const open = activePage === p.route
                return (
                  <article key={p.route} id={'page-' + slug(p.route)} className={'page-row' + (open ? ' open' : '')}>
                    <button className="page-row-head" aria-expanded={open}
                      onClick={() => onSelectPage(open ? null : p.route)}>
                      <span className="page-row-title">
                        <h3>{p.name}</h3>
                        <code className="route">{p.route}</code>
                      </span>
                      <svg className="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                    {open && (
                      <div className="page-row-body fade-in">
                        <p>{p.purpose}</p>
                        {p.actions?.length > 0 && (
                          <ul className="actions">{p.actions.map((a, i) => <li key={i}>{a}</li>)}</ul>
                        )}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      )}

      {section.documented
        ? <FlowDoc doc={section.doc} mode={mode} />
        : (
          <div className="empty">
            <h2>Not documented yet</h2>
            <p>This section's routes exist in the portal, but its flow doc hasn't been written.
              Ask Claude to “document the {section.title.toLowerCase()} feature” to fill it in.</p>
          </div>
        )}
    </div>
  )
}

const tocVisible = (toc, mode) =>
  toc.filter((t) =>
    mode === 'audience' ? t.audience !== 'dev'
      : mode === 'dev' ? t.audience !== 'audience'
        : true,
  )

function FlowDoc({ doc, mode }) {
  const visibleToc = tocVisible(doc.toc, mode)
  const [activeId, setActiveId] = useState(visibleToc[0]?.id || null)
  useEffect(() => {
    const ids = tocVisible(doc.toc, mode).map((t) => t.id)
    if (!ids.length) return
    const scroller = document.querySelector('.main') || window
    const onScroll = () => {
      // The active heading is the last one whose top has crossed the ~130px line.
      let current = ids[0]
      for (const id of ids) {
        const el = document.getElementById(id)
        if (!el) continue
        if (el.getBoundingClientRect().top <= 130) current = id
        else break
      }
      setActiveId(current)
    }
    onScroll()
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => scroller.removeEventListener('scroll', onScroll)
  }, [doc, mode])

  return (
    <div className={'doc-layout mode-' + mode}>
      {/* keyed by mode so switching replays the top-to-bottom reveal */}
      <article key={mode} className="prose reveal" dangerouslySetInnerHTML={{ __html: doc.html }} />
      {visibleToc.length > 0 && (
        <aside className="toc">
          <div className="toc-label">On this page</div>
          {visibleToc.map((t) => (
            <a key={t.id} href={'#' + t.id}
              className={'toc-link toc-l' + t.level + (activeId === t.id ? ' active' : '')}
              onClick={(e) => { e.preventDefault(); document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth' }) }}>
              {t.text}
            </a>
          ))}
        </aside>
      )}
    </div>
  )
}

function SearchResults({ hits, term, onPick }) {
  return (
    <div className="page fade">
      <header className="hero compact">
        <h1>Search</h1>
        <p className="lede">{hits.length} result{hits.length === 1 ? '' : 's'} for “{term}”.</p>
      </header>
      {hits.length === 0
        ? <div className="empty"><h2>No matches</h2><p>Try a different word.</p></div>
        : (
          <div className="results">
            {hits.map((h, i) => (
              <button key={i} className="result" onClick={() => onPick(h.s.key, h.type === 'doc' ? h.c : null)}>
                <span className="result-kind">{h.type === 'section' ? 'Section' : h.type === 'page' ? 'Page' : 'In doc'}</span>
                <span className="result-title">
                  {h.type === 'section' ? h.s.title
                    : h.type === 'page' ? h.p.name
                      : `${h.s.title} › ${h.c.heading}`}
                </span>
                <span className="result-ctx">
                  {h.type === 'section' ? h.s.summary : h.type === 'page' ? h.p.purpose : h.snippet}
                </span>
                {h.type === 'page' && <code className="route">{h.p.route}</code>}
              </button>
            ))}
          </div>
        )}
    </div>
  )
}
