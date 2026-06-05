---
title: Analytics
owner: alamin-nifty
status: draft
version: 1
updated_at: 2026-06-05
---

# Analytics

Analytics is a flexible time-series charting system for visualizing solar site data at multiple levels: individual channels, entire sites, and fleet-wide portfolios. Users can select from 15+ predefined chart types, customize the date range, filter by channels and metrics, adjust sampling intervals, and export data for reports. All time-series data comes from an external chart service; the backend provides metadata (site/channel/metric definitions).

In plain terms: click the Analytics menu item, pick a site or portfolio, choose a chart type (e.g., "Channel Power", "Site Power Analysis"), adjust the date range and metrics, and a Plotly-based dashboard renders the interactive chart. You can export charts as images or PDFs for reports.

---

## The rules that matter

**Analytics data comes from an external chart service, not the backend database.** The `VITE_CHART_URL` environment variable points to a dedicated time-series API that handles all data fetching, aggregation, and interval sampling. The NestJS backend only provides metadata (site/channel/metric names and relationships). — `denowatts-portal/src/store/api/chartApi.ts:5-15`

**Chart types are hierarchically organized with channel pattern matching.** Each chart type (e.g., "Channel Power") specifies which channel patterns it supports via regex (e.g., `['3.1.*', '5.2.*']` for power channels). The UI pre-filters available charts based on the selected site's channels. — `denowatts-portal/src/pages/dashboard/analytics/data/analytics-charts.ts:13-150`

**Date ranges are immutable via presets or custom selection.** Users pick from predefined ranges (Today, This Week, This Month, etc.) or select a custom range. Once set, the range is stored in Redux and URL params, allowing bookmarking and navigation. — `denowatts-portal/src/pages/dashboard/analytics/data/range-presets.ts`, `denowatts-portal/src/pages/dashboard/analytics/components/AnalyticsSettings.tsx:30-31`

**Metrics are dynamically fetched from the backend based on chart type and site.** When a chart is selected, the UI calls `GET_METRICS` (GraphQL) to list available metrics, then fetches available metrics from the chart service. Users can select a subset of metrics to display. — `denowatts-portal/src/pages/dashboard/analytics/components/AnalyticsSettings.tsx:126-150`

**Timezone affects date range interpretation and display.** Each site has a timezone (auto-set from coordinates). When a date range is selected, it's interpreted in that site's timezone, not UTC. This ensures "Today" means calendar-day-today in the site's location, not UTC-today. — `denowatts-portal/src/pages/dashboard/analytics/components/AnalyticsSettings.tsx:77-104`

**The control panel state is persisted in Redux and URL params.** Redux stores the current analytics state (`analyticsSettings` slice). When users navigate or refresh, the URL params are read to restore the state. This allows bookmarking a specific chart view. — `denowatts-portal/src/pages/dashboard/analytics/components/AnalyticsSettings.tsx:68`, `denowatts-portal/src/store/slices/headerSlice.ts`

**Charts are rendered via embedded Plotly dashboards (Dash).** The `PlotlyDash` component embeds a Dash application that renders interactive charts. Dash handles interactivity (zooming, hovering, legend toggling) and exports (PNG, SVG, PDF). — `denowatts-portal/src/pages/dashboard/analytics/components/PlotlyDash/PlotlyDash.tsx:46`

---

## Where it lives

### Main routes

- **Analytics Dashboard** — `/analytics/:siteId?` (main page)
  - Entry point for fleet or single-site analytics
  - URL param `:siteId?` is optional; if omitted, shows portfolio-level analytics
  - `AnalyticsPage` renders the control panel + Plotly dashboard

- **Embedded Analytics** — `/analytics/embedded` (third-party embedding)
  - Stripped-down variant for embedding in external tools
  - `EmbeddedAnalyticsPage` (similar control panel, simpler layout)

### Usage in other pages

- **Energy Accounting** — `/site/:siteId/energy-accounting`
  - Uses the same `AnalyticsPage` component
  - Pre-selected to show energy-related charts for that site

### Frontend components

`denowatts-portal/src/pages/dashboard/analytics/components/`:

- **AnalyticsSettings.tsx** (79KB) — Control panel
  - Site selector (single or multiple)
  - Chart type tree (hierarchical dropdown)
  - Date range picker (presets + custom)
  - Channel multi-select (if chart is channel-level)
  - Metric multi-select
  - Interval selector (5m, 1h, 1d, etc.)
  - Timezone display (read-only, from site)
  - Auto-refresh toggle with interval options
  - Print/export buttons

- **PlotlyDash.tsx** — Chart renderer
  - Embeds a Dash application
  - Handles token refresh for authenticated requests
  - Manages event modal (for creating notes/tickets from charts)
  - Exports screenshots and PDF reports

- **Dashboard.tsx** — Legacy dashboard (may be deprecated)

- **MultiSelectDropdown/** — Custom multi-select UI for channels/metrics

- **FaultDescriptions/** — Modal with fault code reference

---

## Who can open what

### Frontend guards

- **`CompanyRequiredRoute`** wraps `/analytics/:siteId?` — you must have a company assigned. SuperAdmins bypass this check. — `denowatts-portal/src/router.tsx:260-261`
- **`/analytics/embedded`** is open to all authenticated users (no company required).

### Backend role control

- **`GET_SITES`** — All authenticated users can query sites within their company. SuperAdmins can query any company's sites. — `denowatts-backend/src/sites/resolvers/sites.resolver.ts`
- **`GET_CHANNELS`** — Company-scoped. Non-SuperAdmins see only channels in their company's sites. — `denowatts-backend/src/channels/resolvers/channels.resolver.ts`
- **`GET_METRICS`** — Open to all authenticated users. Metrics are company-agnostic (global definitions). — `denowatts-backend/src/metrics/resolvers/metrics.resolver.ts`
- **Chart service** (`VITE_CHART_URL`) — No role checking (assumed already authenticated via JWT passed in request headers).

---

## How it works {dev}

### Loading Analytics

1. User navigates to `/analytics` or `/analytics/{siteId}`. The route is protected by `CompanyRequiredRoute` — user must have a company assigned. — `denowatts-portal/src/router.tsx:260-261`
2. `AnalyticsPage` loads. It reads `analyticsSettings` from Redux. If this is the first load (or state was cleared), defaults are applied. — `denowatts-portal/src/pages/dashboard/analytics/AnalyticsPage.tsx:26-40`
3. The control panel (`AnalyticsSettings`) renders. It fires three parallel GraphQL queries:
   - `GET_SITES` — all sites in the company
   - `GET_CHANNELS` — channels for the selected site (if chart is channel-level)
   - `GET_METRICS` — available metric definitions
   — `denowatts-portal/src/pages/dashboard/analytics/components/AnalyticsSettings.tsx:112-130`
4. The user picks a site (or keeps the default), chart type, date range, channels, and metrics. — `denowatts-portal/src/pages/dashboard/analytics/components/AnalyticsSettings.tsx:150-350`
5. When the form changes, `updateAnalyticsSettings` is dispatched to Redux and the URL params are updated. — `denowatts-portal/src/pages/dashboard/analytics/components/AnalyticsSettings.tsx:400-450`

### Fetching and rendering a chart

1. Once the user has selected a valid chart (and all required fields are filled), `AnalyticsPage` fires a request to the chart service. — `denowatts-portal/src/pages/dashboard/analytics/AnalyticsPage.tsx:51-76`
2. The request payload includes:
   - `type` — chart type (e.g., 'site', 'channel', 'channelPower')
   - `site` — site ID or comma-separated IDs (for multi-site charts)
   - `start` — start date (ISO 8601, in site timezone)
   - `end` — end date (ISO 8601, in site timezone)
   - `channels` — comma-separated channel IDs (for channel-level charts)
   - `metrics` — array of metric names
   - `interval` — sampling interval (e.g., '5m', '1h', '1d')
   — `denowatts-portal/src/store/api/chartApi.ts:26-51`
3. The chart service processes the request and returns a Plotly dashboard specification (JSON). — (chart service implementation not documented here; assumed external)
4. `PlotlyDash` receives the dashboard spec and renders it using the Dash embedded component. — `denowatts-portal/src/pages/dashboard/analytics/components/PlotlyDash/PlotlyDash.tsx:46-100`
5. The Plotly dashboard is interactive: users can zoom, pan, toggle series, and hover for details. — (Plotly/Dash interactivity is handled by the embedded component)

### Using chart presets and templates

1. Each chart type has a predefined Plotly template (e.g., `channelPowerTemplate`, `sitePowerAnalysisTemplate`). — `denowatts-portal/src/pages/dashboard/analytics/data/templates/`
2. The chart service uses the appropriate template based on the `type` parameter. — `denowatts-portal/src/pages/dashboard/analytics/AnalyticsPage.tsx:92-130`
3. The template defines:
   - Chart layout (title, axes, legend position, etc.)
   - Trace configuration (line width, color, type)
   - Default interactions (hover, zoom behavior)
   — (template details not fully documented here; see template files)

### Exporting data

1. Plotly/Dash provides built-in export buttons: "Download plot as PNG", "Download plot as SVG", "Download plot as PDF". — `denowatts-portal/src/pages/dashboard/analytics/components/PlotlyDash/PlotlyDash.tsx`
2. Clicking one of these buttons downloads the chart as an image or PDF file. — (Dash handles this natively)
3. For report generation, users can also create an event (note or ticket) from a chart, which captures a screenshot. — `denowatts-portal/src/pages/dashboard/analytics/components/PlotlyDash/PlotlyDash.tsx:52-58`

### Multi-site charting

1. Some charts (e.g., `portfolioTreechart`, `portfolioEnergy`) support multiple sites. The site selector in `AnalyticsSettings` switches to multi-select mode for these chart types. — `denowatts-portal/src/pages/dashboard/analytics/components/AnalyticsSettings.tsx:76-81`
2. When multiple sites are selected, the chart service receives a comma-separated list of site IDs. — `denowatts-portal/src/pages/dashboard/analytics/AnalyticsPage.tsx:58`
3. The chart aggregates data across sites (specifics depend on the chart type and service implementation).

---

## Data it touches {dev}

### GraphQL queries (metadata only)

- **`GET_SITES`** — `denowatts-backend/src/sites/resolvers/sites.resolver.ts`
  - Returns all sites in the user's company
  - Supplies site IDs for the site selector

- **`GET_CHANNELS`** — `denowatts-backend/src/channels/resolvers/channels.resolver.ts`
  - Returns channels for a specified site
  - Supplies channel IDs and names for channel-level charts

- **`GET_METRICS`** — `denowatts-backend/src/metrics/resolvers/metrics.resolver.ts`
  - Returns all custom metric definitions
  - Supplies metric names and descriptions for the metric selector

### External chart service (time-series data)

- **`POST VITE_CHART_URL`** — Time-series data fetching
  - Request: `{ type, site, start, end, channels, metrics, interval, print }`
  - Response: Plotly dashboard spec (JSON)
  - Auth: JWT in Authorization header

- **`POST VITE_CHART_URL/metrics`** — Available metrics for a chart type/site
  - Request: `{ type, site, start, end, channels, interval }`
  - Response: `{ metrics: ['metric1', 'metric2', ...] }`

### Redux state

- **`state.header.analyticsSettings`** — Current analytics control panel state
  - Fields: `site`, `chart`, `startDate`, `endDate`, `channels`, `metrics`, `interval`, `timezone`, `autoRefresh`, `enableBetaCharts`, `kpis`, etc.
  - Updated via `updateAnalyticsSettings(payload)` and `updateRefreshValue(value)` actions

### URL parameters (localStorage/searchParams)

- Chart state is persisted as URL search params: `?site=...&chart=...&start=...&end=...&channels=...&metrics=...&interval=...`
- This allows bookmarking and sharing specific chart views

---

## Edge cases & gotchas {dev}

- **Channel pattern matching is done client-side, not server-side.** When a site is selected, the available chart types are filtered by comparing the site's channels against each chart's `channelPatterns` regex. If no channels match, certain chart types are grayed out. This filtering is optimistic (assumes channel patterns are accurate). — `denowatts-portal/src/pages/dashboard/analytics/components/AnalyticsSettings.tsx:200-250`

- **The chart service may return different data for the same request at different times.** Time-series data is finalized over time. A request for "today" may return different results at 9am vs. 11am as the system continues to aggregate data. This is expected behavior. — (not explicitly handled; users should be aware)

- **Date range is interpreted in site timezone, but stored in UTC in Redux.** The UI displays dates in the site's timezone, but internally stores them as UTC ISO strings. This can cause confusion if the user's browser timezone differs from the site's. — `denowatts-portal/src/pages/dashboard/analytics/components/AnalyticsSettings.tsx:77-80`

- **Metrics are not validated against the chart type.** If a user selects a metric that doesn't apply to the chosen chart (e.g., selecting "inverter efficiency" for a "channel power" chart), the chart service may return an error or an empty chart. The UI doesn't pre-validate. — `denowatts-portal/src/pages/dashboard/analytics/components/AnalyticsSettings.tsx:132-150`

- **The external chart service is a single point of failure.** If `VITE_CHART_URL` is unavailable or slow, all analytics pages hang or error. There's no fallback or caching. — `denowatts-portal/src/store/api/chartApi.ts:7`

- **Auto-refresh only works for recent dates.** Auto-refresh is only enabled if the `endDate` equals today. This prevents the page from polling old data repeatedly. — `denowatts-portal/src/pages/dashboard/analytics/AnalyticsPage.tsx:71-74`

- **Multi-site charts do not show per-site metrics separately.** When viewing a portfolio chart with multiple sites, individual site metric values are not displayed (only aggregated fleet values). To see a metric for one site, you must select that single site. — `denowatts-portal/src/pages/dashboard/analytics/AnalyticsPage.tsx:58`

- **The Dash embedded component requires authentication.** PlotlyDash passes the JWT access token to Dash in headers. If the token expires, Dash refreshes it server-side. If refresh fails, the user is logged out. — `denowatts-portal/src/pages/dashboard/analytics/components/PlotlyDash/PlotlyDash.tsx:29-44`

- **Print/export buttons in Plotly use the browser's print dialog, not a custom exporter.** Exported PDFs are rendered from the Plotly canvas and may have layout issues or missing interactivity. — (Plotly/Dash native behavior)

---

**Related flows:** [[site]] (analytics embedded in site energy-accounting tab), [[portfolio]] (portfolio analytics sub-pages), [[settings]] (admin customization of metrics)
