# Documentation coverage — master tracker

One row per feature (mirrors the catalog sections). Each documented feature has a
`<feature>.coverage.md` listing its **specific source files** and an item checklist,
so re-verifying never means re-reading the whole repo.

| Feature | Main route(s) | Doc | Coverage tracker | Status |
|---|---|---|---|---|
| Authentication | `/signin`, `/signup`, `/reset-password` | [authentication.md](./authentication.md) | [tracker](./authentication.coverage.md) | 🟢 100% · v3 |
| Portfolio | `/portfolio` | [portfolio.md](./portfolio.md) | [tracker](./portfolio.coverage.md) | 🟢 100% · v1 |
| Site | `/site/:siteId` | [site.md](./site.md) | — | 🟢 100% · v1 |
| Status | `/status` | [status.md](./status.md) | — | 🟢 100% · v1 |
| Settings | `/settings` | [settings.md](./settings.md) | [tracker](./settings.coverage.md) | 🟢 100% · v1 |
| Analytics | `/analytics/:siteId` | [analytics.md](./analytics.md) | [tracker](./analytics.coverage.md) | 🟢 100% · v1 |
| Field Setup | `/field-setup` | [field-setup.md](./field-setup.md) | [tracker](./field-setup.coverage.md) | 🟢 100% · v1 |
| Tests | `/tests` | [tests.md](./tests.md) | [tracker](./tests.coverage.md) | 🟢 100% · v1 |

Legend: 🟢 complete · 🟡 partial · ⬜ not started

---

## Workflow (how to document / verify a feature without reading the whole repo)
1. Find the feature's **route group** in `denowatts-portal/src/router.tsx`.
2. Create `<feature>.coverage.md` — list ONLY that feature's files (frontend page → backend resolver → service → guards → schema).
3. Read those files, fill the checklist, then write `<feature>.md`.
4. Re-verify later by re-reading just the listed files and re-ticking boxes.
