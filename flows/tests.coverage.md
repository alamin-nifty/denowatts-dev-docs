# Tests — Coverage tracker

Document version: 1
Last verified: 2026-06-05

## Frontend files (source of truth for documented behavior)

- [x] `denowatts-portal/src/router.tsx` — Tests routes (`/tests`, `/tests/:params`), CompanyRequiredRoute guard
- [x] `denowatts-portal/src/pages/dashboard/tests/components/Tests.tsx` — Main page component, conditional render on site + chart
- [x] `denowatts-portal/src/pages/dashboard/tests/components/TestSettings.tsx` — All controls: view mode toggle, report/chart type select, site select, date range picker, date navigation
- [x] `denowatts-portal/src/pages/dashboard/tests/components/PlotlyDashReport/PlotlyDashReport.tsx` — Dash embedding, token refresh, zoom controls

## Backend files

- [x] `denowatts-portal/src/graphql/queries/siteQueries.ts` — `GET_SITES`, `GET_SITE` (fetch for dropdown and timezone)
- [x] `denowatts-portal/src/graphql/mutations/auth.ts` — `REFRESH_TOKEN` (JWT refresh for Dash)
- [x] `denowatts-portal/src/store/slices/headerSlice.ts` — TestSettings interface and updateTestSettings action

## Configuration & utilities

- [x] `denowatts-portal/src/pages/dashboard/analytics/data/range-presets.ts` — Predefined date ranges (shared with Analytics)
- [x] `denowatts-portal/.env` — `VITE_PLOTLY_URL` environment variable

## Documentation completeness

- [x] What it does (business): two-mode reporting interface (View Archive / Create New)
- [x] Entry point(s): `/tests` and `/tests/:params` routes
- [x] Flow: page load → site/chart selection → date range (if Create New) → Dash renders
- [x] Business rules: view modes, timezone conversion, date navigation logic, zoom controls
- [x] Data touched: GET_SITES, GET_SITE, REFRESH_TOKEN, testSettings Redux slice
- [x] Edge cases: date conversion on site switch, zoom only for snapshots, preset range shared with Analytics, no error on stale site ID, Dash re-mounts on params change

## Related documentation

- [[analytics]] — shares date range presets, similar control pattern
- [[site]] — site selection and timezone context
