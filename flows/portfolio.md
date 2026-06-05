---
title: Portfolio
owner: alamin-nifty
status: draft
version: 1
updated_at: 2026-06-05
---

# Portfolio

The portfolio feature is the bird's-eye view of a company's entire fleet of solar sites. A single dashboard shows all sites on a map, summarizes their health and alarms, and drills down into fine-grained analytics. It's where a manager goes when they want to understand the state of everything at once.

In plain terms: the portal fetches all a company's sites in a single batched GraphQL query, displays them on an interactive Google Map color-coded by connection and service status, shows summary tables with alarm and event counts, and provides sub-pages for fleet-wide analytics on energy, irradiation, and fault diagnosis.

---

## The rules that matter

**Portfolio access requires a company assignment.** Only users with a company can view the portfolio — SuperAdmins are exempt and can view any company's portfolio. The backend enforces this boundary, not the UI. — `denowatts-backend/src/sites/resolvers/sites.resolver.ts:82-89`, `denowatts-portal/src/router.tsx:93-94`

**The portfolio status summary uses a fixed display order.** When the backend groups sites by their `serviceStatus`, it always returns statuses in the same order (`ACTIVE_AND_LEARNING`, `ACTIVE_NOT_LEARNING`, `COMMISSIONING`, `SHIPPED`, `ORDERED`, `TOTAL`, `DISCONTINUED`, `QUOTED`), regardless of which statuses have sites. Missing statuses are zero-filled. — `denowatts-backend/src/sites/services/sites.service.ts:1018-1042`

**Events are counted at the site level.** The portfolio query looks for flagged events, open tickets, and unacknowledged critical alarms *per site*, and counts how many sites in each status category have them. — `denowatts-backend/src/sites/services/sites.service.ts:883-948`

**The batched page query avoids N+1 requests.** Instead of three separate GraphQL calls (sites, summary, alarms), `PortfolioPageData` fetches all three in one network round trip with `fetchPolicy: 'no-cache'` — fresh data every time, and only one server hit. — `denowatts-portal/src/pages/dashboard/portfolio/PortfolioPage.tsx:42-49`, `denowatts-portal/src/graphql/queries/portfolioQueries.ts:49-90`

**Map markers are color-coded by connection status and service status.** A site's marker color depends on its `connectionStatus` (green=connected, yellow=partially connected, red=disconnected) and is overlaid with a second indicator from `serviceStatus`. — `denowatts-portal/src/pages/dashboard/portfolio/components/PortfolioMapCard.tsx:150-220`

**Portfolio analytics subscription is tracked but not enforced in the API.** The `portfolioAnalytics` field on `SiteSubscriptions` records the subscription window (`startDate`, `endDate`), but portfolio queries do not yet gate data based on it. — `denowatts-backend/src/sites/schemas/site.schema.ts:414`

---

## Where it lives

The screens a person actually touches:

- **Portfolio Map** — `/portfolio` (main landing page with map, status table, and alarm summary)
- **Portfolio Status** — `/status/portfolio` (detailed table view of all sites with filtering and notes)
- **Energy KPIs** — `/portfolio/energy-kpis` (analytics sub-page for fleet energy charts)
- **Triage** — `/portfolio/triage` (analytics sub-page for fault/alert monitoring)
- **Irradiation** — `/portfolio/irradiation` (analytics sub-page for irradiation data)

---

## Who can open what

The portfolio is access-controlled at two levels:

- **Frontend route guard** — `CompanyRequiredRoute` wraps the entire portfolio path tree. You must have a company assigned; SuperAdmins bypass this check. A user without a company is redirected to *not-found*. — `denowatts-portal/src/router.tsx:93-94`
- **Backend query gate** — `portfolioStatusSummary` has no `@Roles()` decorator, so it is open to all authenticated users. However, non-SuperAdmin users are scoped to their own company automatically; they never see another company's data. — `denowatts-backend/src/sites/resolvers/sites.resolver.ts:82-89`, `denowatts-backend/src/sites/services/sites.service.ts:867-875`

---

## How it works {dev}

### Loading the Portfolio Map page

1. The user navigates to `/portfolio`. The frontend checks that they have a `CompanyRequiredRoute` — if not, 404. — `denowatts-portal/src/router.tsx:93-94`
2. `PortfolioPage` memoizes the current `sitesFilter` from Redux (company, managers, tags). — `denowatts-portal/src/pages/dashboard/portfolio/PortfolioPage.tsx:29-40`
3. The component fires the batched `PORTFOLIO_PAGE_DATA` query with `fetchPolicy: 'no-cache'` (always fresh). Variables are: `sitesFilter` (passed to the `sites` query), `statusInput` (passed to `portfolioStatusSummary`), and `alarmInput` (passed to `alarmStatusSummary`). — `denowatts-portal/src/pages/dashboard/portfolio/PortfolioPage.tsx:33-49`
4. The backend's `portfolioStatusSummary` resolver runs a MongoDB aggregation: it filters the `sites` collection by company (and managers/tags if provided), then looks up the `events` collection three times — once each for flagged events, open tickets, and critical alarms. It groups the results by `serviceStatus` and returns counts. — `denowatts-backend/src/sites/services/sites.service.ts:852-1015`
5. The response is a fixed-order array of status rows, with zero-fills for missing statuses. — `denowatts-backend/src/sites/services/sites.service.ts:1031-1042`
6. The frontend renders three sub-components: `PortfolioSummaryTable` (status-by-counts), `OpenAlarmStatusSummaryTable` (alarms-by-severity), and `PortfolioMapCard` (interactive map). — `denowatts-portal/src/pages/dashboard/portfolio/PortfolioPage.tsx:100-271`

### Filtering the map by status or alarm

1. The user clicks a cell in `PortfolioSummaryTable` or `OpenAlarmStatusSummaryTable`. Each cell with a non-zero value is clickable. — `denowatts-portal/src/pages/dashboard/portfolio/components/PortfolioSummaryTable.tsx:200-300`, `denowatts-portal/src/pages/dashboard/portfolio/components/OpenAlarmStatusSummaryTable.tsx:150-250`
2. Clicking dispatches a filter to `activeMapFilter` (or `activeOpenAlarmFilter`) state. — `denowatts-portal/src/pages/dashboard/portfolio/PortfolioPage.tsx:76-79`
3. The `PortfolioMapCard` filters its sites based on the active filter and re-renders only matching markers. — `denowatts-portal/src/pages/dashboard/portfolio/components/PortfolioMapCard.tsx:80-120`
4. A "Reset Filter" button appears on the map; clicking it clears the filter state and redraws all markers. — `denowatts-portal/src/pages/dashboard/portfolio/components/PortfolioMapCard.tsx:200-210`
5. Clicking a map marker navigates to `/site/:siteId` (the site detail page). — `denowatts-portal/src/pages/dashboard/portfolio/components/PortfolioMapCard.tsx:230-240`

### Navigating to Portfolio Status list

1. The user clicks "View Details" in `PortfolioSummaryTable` or the "Incidents" link in `OpenAlarmStatusSummaryTable`. — `denowatts-portal/src/pages/dashboard/portfolio/components/PortfolioSummaryTable.tsx:250-280`
2. The frontend navigates to `/status/portfolio` and passes location state (e.g., `{ serviceStatus: 'ACTIVE_AND_LEARNING' }` or `{ configId: '...' }`). — `denowatts-portal/src/pages/dashboard/status/portfolio-status/components/PortfolioStatusView.tsx`
3. `PortfolioStatusView` reads the location state and pre-applies filters to the table. It uses the `GET_SITES` query with `showNotes: true`, allowing site notes to be fetched and edited. — `denowatts-portal/src/pages/dashboard/status/portfolio-status/components/PortfolioStatusView.tsx:87-92`
4. The query has a `pollInterval: 1 * 60 * 1000` — the table auto-refreshes every minute. — `denowatts-portal/src/pages/dashboard/status/portfolio-status/components/PortfolioStatusView.tsx:91`
5. The table displays: Site Name, Service Status, Connection Status, Last Update Time, 7d EPI, Critical Alarms, Tasks, Customer Setup Status, Denowatts Setup Status, Notes. Users can search by name, filter by status, and add/edit notes. — `denowatts-portal/src/pages/dashboard/status/portfolio-status/components/PortfolioStatusView.tsx:281-310`

### Using the Portfolio Status sub-pages (Energy KPIs, Triage, Irradiation)

1. The user clicks a sub-page link from the portfolio main nav or settings menu. Each sub-page is a dedicated analytics dashboard. — `denowatts-portal/src/pages/dashboard/portfolio/energy-kpis/EnergyKPIsPage.tsx`, `denowatts-portal/src/pages/dashboard/portfolio/triage/TriagePage.tsx`, `denowatts-portal/src/pages/dashboard/portfolio/irradiation/IrradiationPage.tsx`
2. Each sub-page loads analytics charts and data from `@react-google-maps/api` or external charting libraries, specific to that analytics type. — `denowatts-portal/src/router.tsx:101-120`
3. Charts typically accept the same `sitesFilter` (company, managers, tags) from Redux to scope the displayed data. — `denowatts-portal/src/store/slices/globalSlice.ts`

*(Note: Chart-level detail belongs in a future `analytics.md` flow doc; these sub-pages are stubbed here.)*

---

## Data it touched {dev}

- **`sites.serviceStatus`** — an enum field on each site (ACTIVE_AND_LEARNING, ACTIVE_NOT_LEARNING, COMMISSIONING, SHIPPED, ORDERED, DISCONTINUED, QUOTED). Used to group sites in the portfolio summary. — `denowatts-backend/src/sites/schemas/site.schema.ts`
- **`sites.connectionStatus`** — an enum field (CONNECTED, PARTIALLY_CONNECTED, DISCONNECTED). Determines marker color on the map and table display. — `denowatts-backend/src/sites/schemas/site.schema.ts`
- **`sites.location.coordinates`** — [latitude, longitude] array. Required for the map; null coordinates are skipped. — `denowatts-backend/src/sites/schemas/site.schema.ts`
- **`sites.subscriptions.portfolioAnalytics`** — a sub-document with `startDate` and `endDate` fields, recording the subscription window for portfolio analytics data. Currently tracked but not enforced in queries. — `denowatts-backend/src/sites/schemas/site.schema.ts:375-419`
- **`sites.manager`** — array of manager ObjectIds. The `portfolioStatusSummary` query accepts an optional `managers` filter to show only sites managed by certain people. — `denowatts-backend/src/sites/dto/site.input.ts:592-598`
- **`sites.tags`** — array of strings. The `portfolioStatusSummary` query accepts an optional `tags` filter. — `denowatts-backend/src/sites/dto/site.input.ts:600-607`
- **`sites.owner`** and **`sites.accesses.company`** — the company scoping fields. Non-SuperAdmin users only see sites owned by their company or where their company has access. — `denowatts-backend/src/sites/services/sites.service.ts:867-880`
- **`events` collection (three lookups)** — flagged events (where `flaggedBy !== null`), open tickets (where `category === TICKET` and `ticketStatus !== CLOSED`), and unacknowledged critical alarms (where `isAlarm !== null`, `severity === CRITICAL`, and `acknowledgedBy === null`). Each lookup counts at most one event per site (using `$limit: 1`). — `denowatts-backend/src/sites/services/sites.service.ts:883-948`

---

## Edge cases & gotchas {dev}

- **Timestamps are not part of the portfolio summary query.** The API doesn't return when the summary was last computed. If you need to show "last refreshed at", you'll need to timestamp the query client-side. — `denowatts-portal/src/pages/dashboard/portfolio/PortfolioPage.tsx:42-49`
- **The map auto-fits bounds even with zero sites.** If a filtered view has no sites, the map still renders but shows the default Google Maps home view. — `denowatts-portal/src/pages/dashboard/portfolio/components/PortfolioMapCard.tsx:150-170`
- **Filter state is ephemeral — not persisted to URL or localStorage.** Closing the portfolio and returning loses any active map filters. Persisting filter state would require URL params or Redux. — `denowatts-portal/src/pages/dashboard/portfolio/PortfolioPage.tsx:76-79`
- **Event counts use a pessimistic "one per site" check.** The aggregation pipeline counts a site as "has flagged event" if *any* flagged event exists for it, regardless of whether multiple exist. This is intentional (summary counts, not exact tallies) but could be confusing if a site has 5 flagged events but the table shows "1 site with flagged event". — `denowatts-backend/src/sites/services/sites.service.ts:950-957`
- **Company scoping is enforced at query time.** A non-SuperAdmin requesting portfolioStatusSummary with a different `company` filter is ignored — the backend overwrites it with their own company. No error is thrown. — `denowatts-backend/src/sites/services/sites.service.ts:867-880`
- **The `portfolioAnalytics` subscription field is currently unused.** It's stored in the DB but not checked in any query or mutation. A future feature (e.g., "only show analytics if subscribed") would need to add a gate. — `denowatts-backend/src/sites/schemas/site.schema.ts:414`
- **The "TOTAL" row includes DISCONTINUED sites.** In the `buildPortfolioSummaryResponse` method, the aggregate total sums all statuses except DISCONTINUED (which is shown separately), but the TOTAL row calculation does not exclude it further. This is intentional (show full fleet size) but worth noting. — `denowatts-backend/src/sites/services/sites.service.ts:1044-1080`

---

**Related flows:** [[authentication]] (company scoping and role checks enforced in the auth flow)
