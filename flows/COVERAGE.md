# Documentation coverage — master tracker

One row per documented section (mirrors the catalog's sidebar). Every doc is written
in the **two-mode format**: untagged business sections (shown in both modes) +
`{dev}`-tagged technical sections (Developer mode only) + a solar-terminology block.

**Coverage record:** each doc cites every source file it was derived from
(`path/to/file.ts:line` on every claim), so the doc itself is the coverage record —
re-verifying a feature means re-reading only the files it cites. The original eight
features additionally have a standalone `<feature>.coverage.md` checklist from the
first documentation pass.

Cross-cutting items flagged during all passes live in [REVIEW-FINDINGS.md](./REVIEW-FINDINGS.md).

## Features

| Section | Main route(s) | Doc | Tracker | Status |
|---|---|---|---|---|
| Authentication | `/signin`, `/signup`, `/reset-password` | [authentication.md](./authentication.md) | [tracker](./authentication.coverage.md) | 🟢 two-mode · v5 |
| Portfolio | `/portfolio` | [portfolio.md](./portfolio.md) | [tracker](./portfolio.coverage.md) | 🟢 two-mode · v3 |
| Site | `/site/:siteId` | [site.md](./site.md) | — | 🟢 two-mode · v3 |
| Status | `/status/*` | [status.md](./status.md) | — | 🟢 two-mode · v3 |
| Analytics | `/analytics/:siteId` | [analytics.md](./analytics.md) | [tracker](./analytics.coverage.md) | 🟢 two-mode · v3 |
| Tests | `/tests`, `/site/:siteId/capacity-test` | [tests.md](./tests.md) | [tracker](./tests.coverage.md) | 🟢 two-mode · v3 |
| Field Setup | `/field-setup` | [field-setup.md](./field-setup.md) | [tracker](./field-setup.coverage.md) | 🟢 two-mode · v3 |
| Settings | `/settings/*` | [settings.md](./settings.md) | [tracker](./settings.coverage.md) | 🟢 two-mode · v4 |
| DenoAI | `/deno-ai` (+ global panel) | [deno-ai.md](./deno-ai.md) | — | 🟢 two-mode · v1 |

## Modules

| Section | Backend module | Doc | Status |
|---|---|---|---|
| Channels | `src/channels` | [channels.md](./channels.md) | 🟢 two-mode · v2 |
| Events | `src/events` | [events.md](./events.md) | 🟢 two-mode · v2 |
| Alarm Config | `src/alarm-config` | [alarm-config.md](./alarm-config.md) | 🟢 two-mode · v2 |
| Notifications | `src/notification` + `src/user-notification` | [notification.md](./notification.md) | 🟢 two-mode · v4 |
| Webhooks | `src/webhooks` | [webhooks.md](./webhooks.md) | 🟢 two-mode · v2 |
| Reports | `src/report` | [report.md](./report.md) | 🟢 two-mode · v2 |
| Data Out (API) | `src/data-out` | [data-out.md](./data-out.md) | 🟢 two-mode · v2 |
| Metrics | `src/metrics` | [metrics.md](./metrics.md) | 🟢 two-mode · v2 |
| Device Types | `src/device-types` | [device-types.md](./device-types.md) | 🟢 two-mode · v2 |
| Assets | `src/assets` | [assets.md](./assets.md) | 🟢 two-mode · v2 |
| Site Builder | `src/site-builder` | [site-builder.md](./site-builder.md) | 🟢 two-mode · v2 |
| Storage (Denobox) | `src/storage` | [storage.md](./storage.md) | 🟢 two-mode · v2 |
| Quotes | `src/quote` | [quote.md](./quote.md) | 🟢 two-mode · v2 |
| Companies | `src/companies` | [companies.md](./companies.md) | 🟢 two-mode · v2 |
| Users | `src/users` | [users.md](./users.md) | 🟢 two-mode · v2 |
| Audit Trail | `src/audit-trail` | [audit-trail.md](./audit-trail.md) | 🟢 two-mode · v1 |
| System Logs | `src/system-logs` | [system-logs.md](./system-logs.md) | 🟢 two-mode · v1 |
| ~~Activity Logs~~ | *(module removed)* | [activity-logs.md](./activity-logs.md) | ⬛ superseded → audit-trail + system-logs |
| Status Logs | `src/status-logs` | [status-logs.md](./status-logs.md) | 🟢 two-mode · v2 |
| Agenda (Jobs) | `src/agenda` | [agenda.md](./agenda.md) | 🟢 two-mode · v2 |
| Prompts (AI) | `src/prompts` | [prompts.md](./prompts.md) | 🟢 two-mode · v2 |

## Reference

| Section | Doc | Status |
|---|---|---|
| Solar Glossary | [solar-glossary.md](./solar-glossary.md) | 🟢 v1 (shown in both modes by design) |
| Review Findings | [REVIEW-FINDINGS.md](./REVIEW-FINDINGS.md) | 🟢 compiled · ~45 items, prioritized P1–P6 |

Legend: 🟢 complete · 🟡 partial · ⬜ not started

---

## ⚠️ Portal restructure — affects entry-point citations in every doc

The portal migrated from **react-router 7 to TanStack Router** and from `src/pages/dashboard/*`
to a feature-based `src/features/*` tree. Two consequences for these docs:

- **`denowatts-portal/src/router.tsx` no longer holds the routes.** Routes are file-based under
  `denowatts-portal/src/routes/` (directory style: `route.tsx` = layout, `index.tsx` = index,
  `$id.tsx` = param, `{-$siteId}` = optional param, `_name/` = pathless layout), and the tree is
  generated into `src/routeTree.gen.ts`.
- **Any citation of `denowatts-portal/src/pages/dashboard/...` is stale** — that tree is gone.
  The page component now lives at `denowatts-portal/src/features/<feature>/...`.
- **Auth/role guards moved into `beforeLoad`**, not render-time components:
  `requireAuth` / `requireCompany` / `requireSuperAdmin` / `requireAdminOrSuperAdmin` /
  `requireNonUser` in `denowatts-portal/src/common/utils/authGuards.ts`.

Docs written before this change still cite the old paths. `notification.md` and `settings.md`
have been corrected; the rest are **flagged for a sweep** — the *behaviour* they describe is
unaffected, only the frontend file paths.

---

## Workflow (how to document / verify a feature without reading the whole repo)
1. Find the feature's **route file** under `denowatts-portal/src/routes/` (or the
   backend module under `denowatts-backend/src/`); the route file names the page
   component and its guard.
2. Read only that feature's files (frontend page → resolver → service → guards → schema).
3. Write/update `<feature>.md` in the **two-mode format** (see any existing doc as the
   exemplar): untagged business H2s first, ` {dev}` on every technical H2, a
   `## Solar & platform terminology {dev}` section, `[[wikilink]]` related-flows footer,
   and a `file.ts:line` citation on every claim.
4. Re-verify later by re-reading just the files the doc cites and bumping `version`.
5. Update the catalog: `src/data/sections.json` (if a new section) and
   `src/data/pages.generated.json` (match by `route`; never touch `aliases.json`).
