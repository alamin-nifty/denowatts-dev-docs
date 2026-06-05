# Portfolio — coverage tracker

**Doc:** [portfolio.md](./portfolio.md) *(not yet written)*
**Status:** not started
**How to use:** read ONLY the files listed below to write the doc — not the whole repo.

---

## Source files (the only files to read for this feature)

### Frontend — `denowatts-portal/src/`
- `pages/dashboard/portfolio/PortfolioPage.tsx` — main landing page + layout
- `pages/dashboard/portfolio/energy-kpis/EnergyKPIsPage.tsx` — energy KPI rollup page
- `pages/dashboard/portfolio/triage/TriagePage.tsx` — alarm triage across sites
- `pages/dashboard/portfolio/irradiation/IrradiationPage.tsx` — irradiation data rollup
- `pages/dashboard/portfolio/components/{PortfolioSummaryTable,PortfolioMapCard,OpenAlarmStatusSummaryTable}.tsx` — shared components
- `router.tsx` — route group definition + child routes

### Backend — `denowatts-backend/src/`
- `portfolio/portfolio.resolver.ts` — all Portfolio queries
- `portfolio/portfolio.service.ts` — business logic
- `portfolio/dto/` — response types
- `sites/sites.service.ts` — site aggregation (if called from portfolio)
- `assets/assets.service.ts` — asset/channel data aggregation (if called)

---

## Checklist (to fill as you write)

### Portfolio pages
- [ ] Portfolio main page (`/portfolio`) — what does it show?
- [ ] Energy KPIs (`/portfolio/energy-kpis`) — across-site energy metrics
- [ ] Triage (`/portfolio/triage`) — alarm summary + drill-down
- [ ] Irradiation (`/portfolio/irradiation`) — solar resource data by site

### Queries & logic
- [ ] Main queries (list from `portfolio.resolver.ts`)
- [ ] Data aggregation rules (how sites/assets are rolled up)
- [ ] Real-time vs cached data (if applicable)

### Data touched
- [ ] Which tables/schemas feed portfolio views

### Edge cases
- [ ] Empty portfolio (no sites)
- [ ] Permissions (who sees what?)
- [ ] Drill-down to individual site (cross-link)

---

Legend: `[x]` covered · `[ ]` gap
