# Analytics — Coverage Tracker

Coverage status for the Analytics feature documentation (`/analytics/*` routes).

## Frontend routes & files

All under `denowatts-portal/src/pages/dashboard/analytics/`:

| Route | Component | Purpose | Entry file | Status |
|-------|-----------|---------|-----------|--------|
| `/analytics/:siteId?` | AnalyticsPage | Main analytics dashboard with chart rendering and controls | AnalyticsPage.tsx | [x] |
| `/analytics/embedded` | EmbeddedAnalyticsPage | Embedded analytics iframe for third-party embedding | EmbeddedAnalyticsPage.tsx | [x] |
| `/site/:siteId/energy-accounting` | AnalyticsPage | Same analytics component used in site energy accounting tab | (reuses AnalyticsPage) | [x] |

## Frontend sub-components

`denowatts-portal/src/pages/dashboard/analytics/components/`:

- `AnalyticsSettings.tsx` — Control panel with site, chart type, date range, channels, metrics, intervals, timezone selectors | [x]
- `Dashboard/Dashboard.tsx` — Legacy dashboard rendering (may be deprecated) | [x]
- `PlotlyDash/PlotlyDash.tsx` — Main chart rendering using Plotly | [x]
- `PlotlyEmbeddedDash/PlotlyEmbeddedDash.tsx` — Embedded variant | [x]
- `MultiSelectDropdown/` — Multi-select UI for channels/metrics | [x]
- `FaultDescriptions/` — Modal for fault code descriptions | [x]
- `hooks/useZone.ts` — Zone pattern handling hook | [x]

## Data & utilities

`denowatts-portal/src/pages/dashboard/analytics/`:

- `data/analytics-charts.ts` — Chart type definitions and options | [x]
- `data/kpis.ts` — KPI metric definitions | [x]
- `data/range-presets.ts` — Predefined date ranges (today, week, month, etc.) | [x]
- `data/templates/` — Plotly dashboard templates per chart type | [x]
- `utils/` — Helper functions for chart rendering, search params, site navigation | [x]
- `types/index.ts` — TypeScript types for chart queries | [x]

## Backend/External APIs

- **Chart Service** (`VITE_CHART_URL`) — External REST service for time-series data
  - `POST /` — Fetch chart data (request body: type, site, start, end, channels, metrics, interval, print)
  - `POST /metrics` — Get available metrics for a site/channel
  - (No dedicated backend module; uses external service)

- **GraphQL queries** (from `denowatts-backend`):
  - `GET_SITES` — Fetch company sites for dropdown
  - `GET_CHANNELS` — Fetch channels for a site (channel-level charts)
  - `GET_METRICS` — Fetch custom metric definitions

## State management

Redux store paths:
- `state.header.analyticsSettings` — Current analytics state (site, chart, dates, channels, metrics, interval, etc.)
- Store slices: `headerSlice.ts` — `updateAnalyticsSettings`, `updateRefreshValue`

URL params (read/write):
- Parse and format search params for navigation/bookmarking

## Coverage checklist

- [x] Route structure (main, embedded, energy-accounting variant)
- [x] Entry point component (AnalyticsPage)
- [x] Control panel components (AnalyticsSettings)
- [x] Chart rendering (PlotlyDash)
- [x] Data APIs (external chart service + GraphQL)
- [x] State management (Redux analyticsSettings)
- [x] Chart templates (multiple per type)
- [x] Date range logic and presets
- [x] URL param handling
- [x] Role/access guards

## Notes

- **Backend is minimal** — No dedicated analytics module in `denowatts-backend/src/`. All time-series data comes from an external chart service (`VITE_CHART_URL`). Backend only provides site/channel/metric metadata.
- **Chart types** — 15+ predefined charts (site, channel, portfolio energy, triage, etc.), each with its own Plotly template.
- **Complex state** — AnalyticsSettings manages many dropdowns, date ranges, intervals, metrics. Heavily Redux-dependent.
- **External service** — Chart service auth and availability not documented here; assumed available and stable.
