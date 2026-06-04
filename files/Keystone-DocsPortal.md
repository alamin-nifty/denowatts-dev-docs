# Keystone — Docs Portal: conventions to follow

**Version:** 0.1 (draft)
**Companion to:** Keystone PRD v0.1, Architecture v0.1

You're building the documentation portal in-house. That's a real advantage: the portal isn't just where humans read docs — it's the **ground truth the brain reasons against**. Design it as *data first, pages second*, and the brain becomes far easier to build and far more trustworthy. These are the conventions that make that true.

---

## The one principle everything follows from

**The portal is a content API that happens to render web pages — not a website that happens to store text.**

If you build the data layer right, the brain ingests it cleanly, citations deep-link to the exact section, and drift detection comes almost for free. If you build pretty pages over messy HTML, you'll fight the brain forever. Get the data model right first; the front-end is the easy part.

---

## 1. Store docs as structured source, not rendered HTML

Author docs in **Markdown or MDX**, not free-form rich-text/HTML. Markdown is clean to chunk, diff, and embed. The rendered page is a *view* of that source; the source is what the brain ingests.

---

## 2. Every doc carries structured metadata (frontmatter)

Each doc starts with machine-readable frontmatter. This is what lets the brain filter, attribute, and reason about freshness:

```yaml
---
id: doc_login_flow            # stable, never reused
title: Login Flow Specification
owner: alice                  # who keeps it current
status: approved              # draft | in_review | approved | deprecated
visibility: client            # client | internal
related_tasks: [CU-47, CU-52] # ClickUp task IDs this doc governs
version: 4
updated_at: 2026-05-30
---
```

The brain uses `status` and `updated_at` to weight trust, `visibility` to respect client boundaries, and `related_tasks` to link live activity to the right doc.

---

## 3. Stable IDs for docs *and* sections

Give every document a stable `id` that never changes (slugs can change; IDs cannot), and give every heading an anchor ID. This is what turns a citation into a deep link — "this answer comes from `doc_login_flow#error-handling`" — so you can verify any brain answer in one click. Without stable IDs, citations rot the moment someone renames a heading.

---

## 4. One canonical doc per topic

The brain gets confused — and so do humans — when two docs say different things about the same thing. Enforce a single source of truth per topic. If something is documented in two places, one must link to the other, not duplicate it. Contradictions in the ground truth produce confident-but-wrong answers.

---

## 5. Keep version history

Back the portal with version history (Git-backed content, or row-versioned in the DB). This does double duty: humans see what changed, and the brain gets diffs for free — which is exactly the raw material for **drift detection** ("the spec changed, does the client know?"). Treat history as a feature, not a nice-to-have.

---

## 6. Expose a content API

The ingestor needs to read docs programmatically. Provide, at minimum:

```
GET  /api/docs                  # list: ids, titles, metadata, updated_at
GET  /api/docs/:id              # full doc: source + sections + metadata
GET  /api/docs/:id/versions     # version history for drift checks
```

Return the structured source and section IDs — not the rendered HTML page.

---

## 7. Emit a change feed (webhook)

When a doc is created, edited, or deprecated, the portal fires an event:

```json
{ "event": "doc.updated", "id": "doc_login_flow", "version": 4, "at": "2026-05-30T10:00:00Z" }
```

The brain subscribes and re-indexes only what changed (no polling), and uses the same event to trigger a drift check against recent client/QA activity. This single webhook is what keeps the knowledge base live instead of stale.

---

## 8. Respect the client / internal boundary

The `visibility` field is load-bearing. The portal renders client-visible docs to the client and hides internal ones; the brain honors the same flag so it never leaks internal notes into a client-facing answer. Decide this at the data layer, not in the UI.

---

## 9. Framework: pick for the front-end, but the data layer decides

Any of these get you a doc portal quickly, and all of them are MDX/markdown-friendly:

- **Nextra** (Next.js + MDX) — flexible, good if you want a custom app around it.
- **Docusaurus** — batteries-included docs site, strong versioning.
- **Starlight** (Astro) — fast, lightweight.
- **Mintlify** — polished, hosted, fast to stand up.

The framework barely matters for the brain. What matters is §1–§8: structured source, stable IDs, metadata, version history, a content API, and a change feed. Whatever you pick, make sure it doesn't fight those.

---

## Follow-this checklist

- [ ] Docs authored in Markdown/MDX, not rich-text HTML
- [ ] Frontmatter on every doc (id, owner, status, visibility, related_tasks, version, updated_at)
- [ ] Stable doc IDs and section anchors (citations deep-link)
- [ ] One canonical doc per topic; no contradictory duplicates
- [ ] Version history retained (powers drift detection)
- [ ] Content API returns source + sections + metadata (not HTML)
- [ ] Change-feed webhook fires on every edit
- [ ] `visibility` enforced in both the portal and the brain
