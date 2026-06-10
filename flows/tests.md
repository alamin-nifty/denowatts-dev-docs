---
title: Tests
owner: alamin-nifty
status: draft
version: 3
updated_at: 2026-06-10
---

# Tests

Tests is the platform's **performance / capacity-testing** surface — proving, with a formal measurement, that a solar site produces the power it was designed to. (These are *solar* capacity tests, not software tests.) The feature has two distinct surfaces: a dashboard for **viewing** test reports and charts, and a per-site wizard for actually **running** a test.

> **Reading this doc:** use the **Business / Developer** switch at the top. *Business* explains what a capacity test is, the two surfaces, how a test is run, and what you configure. *Developer* adds the embedded Dash viewer, the two external Python services and their separate secrets, the `runCapacityTest`/`channelFaults` APIs, timezone handling, file references, and a terminology primer.

---

## What a capacity test is

A **capacity test** is a formal, standards-based measurement that proves a solar site produces the power it was designed to produce. The site is run at full power for a measurement window (typically a few days); for every interval the platform records irradiance, cell temperature, and actual AC power. That data is regressed against a model at **Target Reference Conditions (TRC)** to yield a *measured* capacity, which is compared to the design or guaranteed capacity. The output is a draft test report (a downloadable file) and, downstream, the learned energy model and performance baseline.

This is the contractual backbone of solar projects: it's the evidence used to settle performance-guarantee and ROI disputes between owners, builders, and financiers.

Two standard methods are offered:
- **ASTM E2848-13 (2018)** using the customer's model.
- **IEC 61724-2 (2016)** using a proxy model.

---

## Two surfaces, two jobs

It's easy to confuse these, so be precise:

- **The `/tests` dashboard** — a *viewer*. It has two modes: **View Archive** (look at previously generated reports) and **Create New** (render a live chart). It draws everything through an embedded charting app; it does **not** run a test.
- **The per-site capacity-test wizard** (`/site/:siteId/capacity-test`) — where a test is actually **run** against the analysis engine and a draft report is produced. This is the real "create a test."

So: pick the dashboard to *look at* results; use the site wizard to *produce* them.

---

## Running a test (the wizard)

The per-site wizard is three steps:

1. **Check Data** — pick the site and a date window (up to 7 days, not in the future) and eyeball a power-analysis chart with an approximate regression trend, to confirm the window looks clean enough to test.
2. **Set Conditions & Run** — fill in the test parameters (below) and run it. The engine processes the window and produces a draft report, which downloads automatically.
3. **Review Draft Report** — the draft lands in the site's file store within a few minutes; it's finalized via a link inside the report.

---

## What you can configure

When running a test you control:

- **Test method** — ASTM (customer model) or IEC (proxy model).
- **Target Reference Conditions** — leave default, or set the exact irradiance and cell temperature the result is normalized to.
- **Data filters** — leave default, or set manual bounds (irradiance, cell temperature, power, rate-of-change, and a time-of-day window). Marked outages and shade are always filtered out.
- **Soiling factor** and **shade max allowance** — required adjustments for dirt and shading.
- **Test boundary** — whole site-and-conditions, or PV-system-only.
- **Cell temperature source** — back-of-module sensor (primary) or the Deno's internal sensor (backup).
- **Power source** — production meter AC power or net energy.
- **Notes** — free text recorded with the test.

---

## Who can see and run tests

Like the rest of the platform, tests are scoped to your company — you can only test and view sites you're entitled to (SUPER_ADMINs see all). A shared link pointing at a site you can't access is quietly ignored rather than shown.

---

## The rules that matter

- **The dashboard and the wizard are different things** — the `/tests` "Create New" tab renders a chart; it does not run a test. The wizard at `/site/:siteId/capacity-test` runs it.
- **A test window is capped at 7 days and can't be in the future.**
- **Manual reference conditions and filters are optional** — leave them default unless you have specific values; manual fields only become required when you switch that section to manual.
- **A run takes a few minutes** — the UI shows "test running" until the report is produced and downloaded; the draft also lands in the site's file store.
- **Dates are interpreted in the site's local timezone.**

---

## Entry points & routes {dev}

- **`/tests` dashboard** — `denowatts-portal/src/pages/dashboard/tests/`; two modes via `TestSettings` toggle stored in Redux `testSettings.viewMode`.
- **Capacity-test wizard** — `/site/:siteId/capacity-test` (`router.tsx:184`) → `denowatts-portal/src/pages/dashboard/site/capacity-test/`.
- The diagnostic **channel-faults** flow is part of this problem domain but is consumed from Analytics (see below).

---

## The /tests dashboard modes (detailed) {dev}

Mutually exclusive, stored in `testSettings.viewMode` (`TestSettings.tsx:488`). Both modes render the same `PlotlyDashReport` (embedded `DashApp`) with different params.

### View Archive {dev}
Pre-generated reports. Report-type dropdown maps to three archive types and `chart` is forced to `'reportArchive'` (`TestSettings.tsx:226,103`): `reportCapacityTest` ("Capacity Test"), `reportEnergyTest` ("Energy Test"), `reportProductionAndLoss` ("Production and Loss") (`:34`). **No GraphQL query** loads archives — the Dash app fetches the data; the portal passes `params = { site, timezone, reportType }` (+ dates if set), `meta = { theme, chart: 'reportArchive' }` (`PlotlyDashReport.tsx:61,81`). No date controls in this mode. Zoom (0.5×–2×) only when the URL path contains `'snapshot'` (`:106,160`).

### Create New {dev}
Inputs: site (required), chart type (required, same three options but stored in `chart` not `reportType`), date range. Renders only when both `site` and `chart` are truthy, else "Please select site and chart type to view the chart" (`Tests.tsx:13`). Builds `params = { site, timezone, reportType: null }` (+ dates), `meta = { theme, chart }`; Dash requests the live chart. The label says "Report Type" vs "Chart Type" but `getReportTypeOptions()` returns the same three options (`TestSettings.tsx:34`).

### The capacity-test wizard {dev}
`CapacityTestPage.tsx` holds `currentStep` (1→2→3). **Step 1** (`CapacityTestStep1.tsx`) fetches a `sitePowerAnalysis` chart via RTK `useGetChartQuery` (REST `POST VITE_CHART_URL`, `interval: '5m'`), renders the analytics `Dashboard` with `isCapacity={true}`; range from Redux `capacityTestSettings` (default last 7 days). **Step 2** (`CapacityTestStep2.tsx`) collects parameters and fires `RUN_CAPACITY_TEST` with a 3-minute client timeout (`:30,103`); on success `fetch()`es the `fileLink` and downloads `fileName`, then advances (`:116`). **Step 3** static info panel (auto-download + finalize link). Date picker `CapacityTestSettings.tsx` writes `capacityTestSettings.startDate/endDate`, **restricts ranges to ≤ 7 days** and disables future dates (`:119,140`).

Step 2 fields (enums from generated types): `trcOption` (Default|Manual → reveals `trcOptionIrr`/`trcOptionCellTemp`), `filterOption` (Default|Manual → min/max for irradiance/cell-temp/power/irradiance-rate + `HH:mm` time window), `soiling` (req), `shadeAllowance` (req), `notes`, `primaryTest` (ASTM|IEC), `testBoundary` (FLAT_SPECTRUM|DENO), `tcellFrom` (back-of-module|Deno internal), `pwrProduced` (AC power|net energy).

---

## External services (Plotly / Matrix Python) {dev}

**Three distinct external services** — do not conflate them.

### A. Plotly Dash app — the `/tests` viewer {dev}
`VITE_PLOTLY_URL` (`PlotlyDashReport.tsx:176`), embedded via `DashApp` from `dash-embedded-component` (`:10,173`) with `config = { url_base_pathname, auth_token: accessToken, request_refresh_jwt }` and `value = { params, meta }`. Params: `site`, `timezone` (fallback `America/New_York`), `reportType` (archive only, else `null`), `startDate`/`endDate` (added only if present, `dayjs.tz(...).toISOString()`); `meta.theme`, `meta.chart` (`'reportArchive'` or the chart value). Auth refreshes via `request_refresh_jwt` → `REFRESH_TOKEN` → `refreshTokens`/`logout` (`:23`). The `key` includes all params, so any change fully re-mounts and re-fetches (`:174`).

### B. Matrix Python — `runCapacityTest` (wizard "Run Test") {dev}
`CAPACITY_TEST_API_URL = https://matrix.denowatts.com/capacity_test` (`common/constants/apis.ts:2`). Secret **`PYTHON_SERVER_SECRET`** (required, `env.validation.ts:19`), sent as `python_secret` (`sites.service.ts:706,709`). Call: `axiosRef.post(..., { httpsAgent: new Agent({ rejectUnauthorized: false }) })` — **TLS verification disabled** (`:740`). Returns `{ filename }`; service builds a signed `denobox/${siteId}/${filename}` URL → `{ fileName, fileLink }` (`:746`).

### C. Matrix Python — `channelFaults` (diagnostic) {dev}
Identifies inverter fault codes over a window; fully documented in [[channels]]. `ChannelsService.getChannelFaults` (`channels.service.ts:1106`) reads **`CAPACITY_TEST_PYTHON_SECRET`** (separate from B's secret; missing → `BadRequestException`), derives the inverter from `site.blocks[0].inverter`, `POST https://matrix.denowatts.com/data/faults` with `{ site_id, channel, start, end, python_secret }` (`:1131`); each fault code → `openAIService.generateChannelStatusDescription` (gpt-4.1). Resolver `channelFaults` has **no `@Roles`** (`channels.resolver.ts:64`). Consumed by the **Analytics** `FaultDescriptions` component, **not** the Tests dashboard. See [[analytics]].

---

## GraphQL / data API surface {dev}

| Operation | Type | Input | Output | Where |
|---|---|---|---|---|
| `runCapacityTest` | Mutation | `RunCapacityTestInput` | `CapacityTestResponse { fileName, fileLink }` | `sites.resolver.ts:68`; `sites.service.ts:704`; `siteMutations.ts:19` |
| `channelFaults` | Query | `{ site, channels[], start, end }` | `[ChannelFaultResponse]` | `channels.resolver.ts:64`; `channels.service.ts:1106` |
| `getChart` (Step 1) | RTK REST | `{ site, type:'sitePowerAnalysis', startDate, endDate, interval:'5m' }` → `POST VITE_CHART_URL` | chart JSON | `chartApi.ts:26`; `CapacityTestStep1.tsx:26` |
| `GET_SITES` / `GET_SITE` | Query | — / `{ id }` | sites incl. `timezone` | `TestSettings.tsx:59-60` |
| `REFRESH_TOKEN` | Mutation | `{ token }` | new `accessToken` | Dash refresh — `PlotlyDashReport.tsx:27` |

**`RunCapacityTestInput`** (`site.input.ts:322`): required `siteId`, `startDate`, `endDate`, `soiling`, `shadeAllowance`, `primaryTest` (`astm`|`iec`); optional `tcellFrom`, `trcOption`, `filterOption`, `notes`, `testBoundary`, `pwrProduced`; conditional (`@ValidateIf` MANUAL) `trcOptionIrr`/`trcOptionCellTemp` and the `filterOption*` min/max + `HH:mm` time fields (`:366-469`). The service maps camelCase → snake_case Python keys, spreading manual blocks only when MANUAL (`sites.service.ts:708-738`).

---

## Timezone handling {dev}

All `/tests` date logic lives in `TestSettings.tsx`, site-tz-aware via dayjs `utc`+`timezone`. Effective tz = `siteData?.site?.timezone || testSettings.timezone || 'America/New_York'` (`:65`). On site change (`:255`): ≤12h ranges convert exact times to the new tz, else reset to calendar bounds; a second effect re-converts when the tz resolves (`:159`). On date pick (`:321`): interpreted in site tz; ≤12h preserves times, single-day → `00:00`–`23:59`. prev/next navigation (`:381`) detects range type (year / 7-day / month / other) and steps accordingly, clamping to today. Before sending to Dash, dates → `dayjs.tz(date, timezone).toISOString()`. The wizard is simpler: Step 1 sends `dayjs.utc(...).startOf/endOf('day')`; Step 2 formats fixed-Z `YYYY-MM-DDT00:00:00.000Z`/`...T23:59:59.999Z`.

---

## Business rules (cited) {dev}

- **Dashboard renders only with both `site` and `chart`** — `Tests.tsx:13`.
- **Two exclusive modes; report-type vs chart-type write different Redux fields**; switching resets dates and sets `chart` to `'reportArchive'` or `null` (`TestSettings.tsx:199`).
- **Run requires `siteId`/`startDate`/`endDate`/`soiling`/`shadeAllowance`/`primaryTest`**; manual TRC/filter fields required only when MANUAL (`site.input.ts:322`).
- **Wizard range ≤ 7 days, no future dates** — `CapacityTestSettings.tsx:137,140`.
- **Run-test client timeout is 3 minutes** — `CapacityTestStep2.tsx:30,170`.
- **Channel-faults requires `CAPACITY_TEST_PYTHON_SECRET`** (separate from `PYTHON_SERVER_SECRET`) — `channels.service.ts:1108`.
- **JWT auto-refresh inside Dash; failure logs out** — `PlotlyDashReport.tsx:23`.

## Data touched {dev}

- `Site` (read) — `runCapacityTest` loads the site; `getChannelFaults` reads `site.blocks[0].inverter` for the OpenAI prompt.
- `Channel.config.serialNumber` (read, via Analytics) — channels passed as `filter.channels`.
- **S3** — `runCapacityTest` reads/writes `denobox/${siteId}/${filename}` and returns a signed URL; the draft lands in the site's Denobox.
- **No new MongoDB collection** is written by the `/tests` dashboard — reports/charts are produced and stored by the external Python services. UNCLEAR where archived snapshots persist (not in this repo).
- Redux `testSettings` / `capacityTestSettings` (`headerSlice.ts:142,240`).

## Edge cases & gotchas {dev}

- **Two different "capacity test" UIs** — `/tests` "Create New" renders a chart; the run lives at `/site/:siteId/capacity-test`.
- **Two Python secrets / two Matrix endpoints** — `runCapacityTest` → `/capacity_test` with `PYTHON_SERVER_SECRET`; `channelFaults` → `/data/faults` with `CAPACITY_TEST_PYTHON_SECRET` (misleadingly named — it gates *faults*, not run-test).
- **TLS verification disabled** on the run-test POST (`rejectUnauthorized: false`) — `sites.service.ts:741`.
- **`channelFaults` has no role guard** — any authenticated user triggers OpenAI generation (one call per fault code) — `channels.resolver.ts:64`.
- **Dash re-mounts on every param change** (`key` includes all params) — each tweak re-fetches the whole dashboard.
- **Silent site clearing** — a shared URL with an inaccessible site → `validatedSite = null`, no error (`TestSettings.tsx:84`).
- **Manual-block visibility bug-smell** — Step 2 sets enum values but the conditional render compares the string `'MANUAL'`; if the enum runtime value is lowercase the manual inputs may never show. UNCLEAR — `CapacityTestStep2.tsx:229,288`.
- **Wizard download depends on a reachable `fileLink`** — a 404 marks the run failed even if the report was produced (`CapacityTestStep2.tsx:118`).

---

## Solar & platform terminology {dev}

- **Capacity test** — a standards-based measurement proving a site's actual capacity vs its design/guaranteed capacity.
- **TRC (Target Reference Conditions)** — the standard irradiance and temperature the measured result is normalized to, so tests are comparable.
- **ASTM E2848 / IEC 61724** — the two industry standards for capacity/performance testing; ASTM uses the customer's model, IEC a proxy model.
- **Irradiance / cell temperature / AC power** — the three measured inputs regressed to compute capacity.
- **Regression** — fitting the measured power against irradiance and temperature to extract capacity at the reference conditions.
- **Soiling factor** — the production loss from dirt/dust on the panels, corrected for in the test.
- **Shade allowance** — the maximum shading tolerated before data is excluded.
- **Pyranometer (flat-spectrum vs fast-response)** — the irradiance sensor; the "test boundary" choice selects which one defines the measurement.
- **8760 / energy model** — the hourly (8760 = hours/year) expected-production curve the test feeds into. See [[site]].
- **BEPI / baseline** — the performance baseline the test helps establish.
- **Fault code** — an inverter-reported error; the diagnostic `channelFaults` flow explains these in plain language. See [[channels]].

For the full domain vocabulary, see [[solar-glossary]].

---

**Related flows:** [[channels]] · [[data-out]] · [[site]] · [[analytics]] · [[solar-glossary]]
