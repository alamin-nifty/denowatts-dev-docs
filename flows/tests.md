---
title: Tests
owner: alamin-nifty
status: draft
version: 1
updated_at: 2026-06-05
---

# Tests

Tests is a performance and diagnostic reporting interface for analyzing site capacity, energy, and production metrics. Users can view archived reports or create live test runs with configurable date ranges and timezone awareness. The system integrates a Plotly-based dashboard for interactive data visualization and supports snapshot zoom/pan controls.

In plain terms: click Tests to choose a site and report type, pick a date range, then view a live or archived performance dashboard. Capacity Test measures system capacity under load; Energy Test tracks efficiency; Production and Loss quantifies output and losses.

---

## The rules that matter

**Tests page requires site and chart selection before rendering.** The page shows a placeholder message ("Please select site and chart type") until both a site and a report/chart type are chosen. — `denowatts-portal/src/pages/dashboard/tests/components/Tests.tsx:13-26`

**Two mutually exclusive view modes: View Archive and Create New.** View Archive displays pre-generated archived reports (Capacity Test, Energy Test, Production and Loss). Create New generates live test charts on demand. Switching modes resets date range and chart selections. — `denowatts-portal/src/pages/dashboard/tests/components/TestSettings.tsx:199-222`

**Report types are fixed across all modes (Capacity Test, Energy Test, Production and Loss).** In View Archive mode, these map to report archives; in Create New mode, they map to live chart types. The label changes based on mode ("Report Type" vs. "Chart Type"). — `denowatts-portal/src/pages/dashboard/tests/components/TestSettings.tsx:34-47`

**Timezone conversion is automatic and site-based.** When a user selects a different site, all existing date ranges are converted to the new site's timezone for short periods (≤12 hours) or reset to midnight/23:59 for longer periods. The site's timezone is fetched from the backend. — `denowatts-portal/src/pages/dashboard/tests/components/TestSettings.tsx:159-187, 280-319`

**Date navigation (prev/next buttons) respects range duration and calendar boundaries.** For year ranges (Jan 1 to Dec 31), navigation moves by year. For 7-day ranges, by week. For month ranges, by month. Other ranges maintain their duration. — `denowatts-portal/src/pages/dashboard/tests/components/TestSettings.tsx:381-477`

**Zoom controls appear only for snapshots in View Archive mode.** Scale ranges from 0.5× to 2×. Users can zoom in/out and reset to 1×. The controls adjust transform-origin to center the zoom. — `denowatts-portal/src/pages/dashboard/tests/components/PlotlyDashReport/PlotlyDashReport.tsx:106-158`

**All state is persisted to URL query params.** viewMode, site, chart/reportType, startDate, endDate are all reflected in the URL. Refreshing preserves the current configuration. — `denowatts-portal/src/pages/dashboard/tests/components/TestSettings.tsx:68-138, 141-156`

**JWT token refresh is handled automatically within the Dash component.** The embedded DashApp receives a refresh callback (`request_refresh_jwt`) that mutates `REFRESH_TOKEN` via Apollo to get a new access token if the current one expires. — `denowatts-portal/src/pages/dashboard/tests/components/PlotlyDashReport/PlotlyDashReport.tsx:23-38, 175-178`

---

## Where it lives

Tests consists of 3 routes under `/tests`:

### Main entry point

- **Tests** — `/tests` or `/tests/:params`
  - CompanyRequiredRoute guard (user must have selected a company/site context)
  - Renders Tests component with controls and dashboard

---

## Who can open what

### Frontend guards

- **`/tests`** — CompanyRequiredRoute (must have a company context; no additional role check)

### Backend

- **No dedicated Tests backend resolver** — The feature uses Plotly Dash (external service at `VITE_PLOTLY_URL`) to fetch and render data. Data access is controlled by the backend's underlying GraphQL queries (site, channel, and measurement permissions are enforced per-company).

---

## How it works {dev}

### Page load and initialization

1. User navigates to `/tests`. `Tests` component mounts and checks Redux state for `site` and `chart`. — `denowatts-portal/src/pages/dashboard/tests/components/Tests.tsx:7-32`
2. `TestSettings` component mounts, reads URL query params, and initializes Redux state (`updateTestSettings`). Default viewMode is 'viewArchive'. — `denowatts-portal/src/pages/dashboard/tests/components/TestSettings.tsx:49-138`
3. If site and chart are both set, `PlotlyDashReport` renders the Dash app. Otherwise, a placeholder message is shown.

### User selects site

1. User clicks the Site dropdown in TestSettings. Sites list is fetched via `GET_SITES` GraphQL query. — `denowatts-portal/src/pages/dashboard/tests/components/TestSettings.tsx:59`
2. On selection, Redux state is updated with new site ID. Site's timezone is fetched via `GET_SITE`. — `denowatts-portal/src/pages/dashboard/tests/components/TestSettings.tsx:255-319`
3. If dates exist, they are converted to the new site's timezone (short periods) or reset to calendar boundaries (longer periods).
4. URL query params are updated to reflect the new site.

### User selects view mode

1. User clicks "View Archive" or "Create New" toggle.
2. Chart type is set: "reportArchive" for View Archive, null for Create New (pending chart selection).
3. Date range is cleared. URL is updated. — `denowatts-portal/src/pages/dashboard/tests/components/TestSettings.tsx:199-222`

### User selects report/chart type

1. User opens Report Type (View Archive) or Chart Type (Create New) dropdown.
2. Same three options in both modes: Capacity Test, Energy Test, Production and Loss.
3. On selection, Redux state updates with new type. URL is updated. — `denowatts-portal/src/pages/dashboard/tests/components/TestSettings.tsx:224-253`

### User selects date range

1. (Create New mode only) User clicks DateRangePicker or preset.
2. Dates are formatted as 'YYYY-MM-DD HH:mm' in the site's timezone. Time is preserved for short periods (≤12 hours), or rounded to 00:00/23:59 for single days and longer periods. — `denowatts-portal/src/pages/dashboard/tests/components/TestSettings.tsx:321-379`
3. Redux state updates. URL is updated.

### Dash component renders and fetches data

1. `PlotlyDashReport` builds a params object: `{ site, timezone, startDate, endDate, reportType, chart, viewMode }`. — `denowatts-portal/src/pages/dashboard/tests/components/PlotlyDashReport/PlotlyDashReport.tsx:61-79`
2. `DashApp` (embedded Plotly Dash component) receives config with auth token and refresh callback. — `denowatts-portal/src/pages/dashboard/tests/components/PlotlyDashReport/PlotlyDashReport.tsx:173-179`
3. Dash fetches data from backend (via `VITE_PLOTLY_URL`), renders charts, and handles user interactions (zoom, pan, etc.).

### User zooms in snapshot (View Archive + snapshot URL only)

1. Zoom controls appear if the URL contains 'snapshot' and viewMode is 'viewArchive'. — `denowatts-portal/src/pages/dashboard/tests/components/PlotlyDashReport/PlotlyDashReport.tsx:106-127`
2. User clicks zoom in/out/reset buttons. Scale state updates (0.5× to 2×, in 0.1× increments). — `denowatts-portal/src/pages/dashboard/tests/components/PlotlyDashReport/PlotlyDashReport.tsx:94-104`
3. CSS transform applies the scale with smooth transition. — `denowatts-portal/src/pages/dashboard/tests/components/PlotlyDashReport/PlotlyDashReport.tsx:162-171`

### Token refresh

1. If auth token expires mid-session, `DashApp`'s `request_refresh_jwt` callback fires.
2. `refreshJwt()` fetches a new token via Apollo mutation `REFRESH_TOKEN`, dispatches it to Redux, and returns the new accessToken.
3. If refresh fails, user is logged out. — `denowatts-portal/src/pages/dashboard/tests/components/PlotlyDashReport/PlotlyDashReport.tsx:23-38`

---

## Data it touches {dev}

### GraphQL queries

- **`GET_SITES`** — Fetch all sites in the user's company
  - Called on TestSettings mount to populate site dropdown
  - `denowatts-portal/src/graphql/queries/siteQueries.ts`

- **`GET_SITE`** — Fetch a single site by ID
  - Called when site is selected to get timezone and other details
  - `denowatts-portal/src/graphql/queries/siteQueries.ts`

- **`REFRESH_TOKEN`** — Refresh JWT access token
  - Called by DashApp if token expires
  - `denowatts-portal/src/graphql/mutations/auth.ts`

### External service

- **Plotly Dash** (`VITE_PLOTLY_URL`)
  - External service that renders interactive dashboards
  - Receives site ID, date range, timezone, chart/report type as params
  - Returns HTML/JS for embedded dashboard component
  - Handles data fetching, visualization, and user interactions (zoom, pan, etc.)

### Redux state (header slice)

- **`testSettings`** — Test view configuration
  - `viewMode`: 'viewArchive' | 'create'
  - `chart`: string (e.g., 'reportArchive', chart type ID) | null
  - `reportType`: string (report archive type) | null (when in create mode)
  - `startDate`: ISO string (site timezone) | null
  - `endDate`: ISO string (site timezone) | null
  - `timezone`: site timezone string
  - `isDateRangeChanged`, `isPresetButtonClicked`: flags for internal logic
  - `denowatts-portal/src/store/slices/headerSlice.ts`

---

## Edge cases & gotchas {dev}

- **Date range changes when switching sites.** Short periods (≤12 hours) are converted to the new timezone; longer periods are reset to calendar boundaries (00:00 to 23:59). This prevents user confusion but may not always match user expectations. — `denowatts-portal/src/pages/dashboard/tests/components/TestSettings.tsx:283-318`

- **Zoom controls only show for snapshots in View Archive mode.** If a user navigates to `/tests` (not a snapshot URL), zoom buttons won't appear even if they switch to View Archive. This is by design to keep the interface clean for live dashboards. — `denowatts-portal/src/pages/dashboard/tests/components/PlotlyDashReport/PlotlyDashReport.tsx:110`

- **Date navigation respects range duration, which may fail for mixed/custom ranges.** If a user manually selects an odd date range (e.g., 5.5 days), prev/next buttons treat it as "other" and may produce unexpected results. — `denowatts-portal/src/pages/dashboard/tests/components/TestSettings.tsx:415-461`

- **Switching view modes clears date range and chart selection.** Toggling between View Archive and Create New resets dates to null and chart to null (except 'reportArchive' for View Archive). — `denowatts-portal/src/pages/dashboard/tests/components/TestSettings.tsx:199-222`

- **No validation of site ownership.** If a URL is shared with a site ID the current user doesn't have access to, the site selection is silently cleared. No error message is shown. — `denowatts-portal/src/pages/dashboard/tests/components/TestSettings.tsx:81-88`

- **Dash component re-mounts on every params change.** The `key` prop includes site, reportType, chart, startDate, endDate. Changing any of these forces a full re-mount and re-fetch of the dashboard, which may be slow. — `denowatts-portal/src/pages/dashboard/tests/components/PlotlyDashReport/PlotlyDashReport.tsx:174`

- **JWT refresh is triggered only by Dash's internal request.** If auth expires before Dash is interacted with, the page may continue to show stale data without warning. — `denowatts-portal/src/pages/dashboard/tests/components/PlotlyDashReport/PlotlyDashReport.tsx:178`

- **Preset date ranges are shared with Analytics.** Both Tests and Analytics use the same `getPredefinedDateRanges` utility from `analytics/data/range-presets`. Changes to one affect the other. — `denowatts-portal/src/pages/dashboard/tests/components/TestSettings.tsx:18`

---

**Related flows:** [[analytics]] (similar date/chart control pattern, shares preset ranges), [[site]] (site selection and timezone context)
