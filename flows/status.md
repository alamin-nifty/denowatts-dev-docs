---
title: Status
owner: alamin-nifty
status: draft
version: 1
updated_at: 2026-06-05
---

# Status

The status feature gives real-time visibility into the health of individual channels, sites, and the entire system. There are three levels: **system status** (platform health), **portfolio status** (fleet overview), and **site/channel status** (granular device data). Users check here when they want to know if a site is connected, if a channel is reporting data, or why the system is slow.

In plain terms: status is read-only monitoring data pulled from three sources. System status is computed from backend health logs. Site and channel status come from embedded fields in the Site and Channel schemas. The frontend polls every 60 seconds for fresh data.

---

## The rules that matter

**Status is read-only; no mutations.** Users can view status but cannot change it directly. Status is derived from device connection, data ingestion, and system health — it updates automatically as devices report in. — `denowatts-portal/src/pages/dashboard/status/*/components/*StatusView.tsx`

**Channel status has two dimensions.** A channel's `status` field (ACTIVE/INACTIVE) is configured by an admin. Its `connectionStatus` field (CONNECTED/DISCONNECTED) is live, reflecting whether the device is currently connected and reporting data. Both are queryable. — `denowatts-backend/src/channels/schemas/channel.schema.ts`

**Site connection status is rolled up from channels.** A site is CONNECTED if all its channels are connected; PARTIALLY_CONNECTED if some are; DISCONNECTED if none are. The computation happens client-side or at query time, not pre-computed. — `denowatts-portal/src/pages/dashboard/status/portfolio-status/components/PortfolioStatusView.tsx`

**System status is hierarchical.** The backend tracks status for services (DATA_INGEST, CHARTS, ALARMING, etc.) and sub-services (e.g., ALSOENERGY, NYSERDA under REMOTE_MANAGEMENT). A service can be UP, DOWN, or PARTIALLY_DEGRADED. — `denowatts-backend/src/status-logs/schemas/status-logs.schema.ts`

**System status is SuperAdmin-only.** The `systemStatus` query throws a 403 if the user is not a SUPER_ADMIN. Portfolio and site status are visible to all authenticated users (with company scoping). — `denowatts-backend/src/status-logs/resolvers/status-logs.resolver.ts`

**Status data is polled, not pushed.** The frontend polls every 60 seconds (or on-demand refresh) to update status. There is no real-time WebSocket or subscription. — `denowatts-portal/src/pages/dashboard/status/*/components/*StatusView.tsx` (poll intervals)

**Notes are attached to status views.** Users can add notes to a site or channel (via the notes modals in SiteStatusView and ChannelStatusView). Notes are stored as `EventCategory.NOTES` events and displayed in drawers. — `denowatts-portal/src/pages/dashboard/status/site-status/components/ChannelNoteModal.tsx`, `portfolio-status/components/SiteNoteModal.tsx`

---

## Where it lives

The status feature spans three routes, all under `/status`:

- **Site Status** — `/status/site/:siteId?` (shows all channels for one site; empty state if no site selected)
- **Portfolio Status** — `/status/portfolio` (shows all sites with connection status; mirrors `/status/site` in the sidebar navigation)
- **Channel Status** — `/status/channel` (shows detailed metrics for a selected channel)
- **System Status** — SuperAdmin only, available from admin settings (not a main route, but queryable via `systemStatus` GraphQL query)

---

## Who can open what

**Frontend route guards:**
- `CompanyRequiredRoute` wraps the entire `/status/*` path tree — you must have a company. — `denowatts-portal/src/router.tsx`

**Backend role control:**
- `getSystemStatus` query is `@Roles(SUPER_ADMIN)` — all other users get a 403. — `denowatts-backend/src/status-logs/resolvers/status-logs.resolver.ts`
- `sites` and `channels` queries (which embed status fields) have no role decorator but are company-scoped at the service layer. — `denowatts-backend/src/sites/services/sites.service.ts`, `denowatts-backend/src/channels/services/channels.service.ts`

---

## How it works {dev}

### Site Status view (`/status/site/:siteId`)

1. User navigates to `/status/site/:siteId` (or `/status/site` with no param). The URL param flows through Redux like the Site feature. — `denowatts-portal/src/pages/dashboard/status/site-status/SiteStatusPage.tsx`
2. `SiteStatusView` reads `currentSite` from Redux and fires `GET_CHANNELS` with `filter: { site: currentSite }` and `pollInterval: 60000`. — `denowatts-portal/src/pages/dashboard/status/site-status/components/SiteStatusView.tsx`
3. The query returns all channels for the site with their status fields: `status` (ACTIVE/INACTIVE), `connectionStatus` (CONNECTED/DISCONNECTED), `remoteManagementServiceStatus`, `lastReportedAt`, `lastConnectedAt`, `openAlarms`, `totalAlarms`. — `denowatts-backend/src/channels/schemas/channel.schema.ts`
4. A table renders each channel as a row with columns: Name, Status, Connection, Last Reported, Key Metric, Alarms. Rows are color-coded by connection status. — `denowatts-portal/src/pages/dashboard/status/site-status/components/SiteStatusView.tsx`
5. Clicking a row expands it to show more details or opens a notes modal. Users can add/edit notes via `ChannelNoteModal` (creates/updates `EventCategory.NOTES` events). — `denowatts-portal/src/pages/dashboard/status/site-status/components/ChannelNoteModal.tsx`
6. A drawer (`ChannelNotesDrawer`) shows all past notes for that channel. — `denowatts-portal/src/pages/dashboard/status/site-status/components/ChannelNotesDrawer.tsx`

### Portfolio Status view (`/status/portfolio`)

1. User navigates to `/status/portfolio`. `PortfolioStatusPage` renders `PortfolioStatusView`. — `denowatts-portal/src/pages/dashboard/status/portfolio-status/PortfolioStatusPage.tsx`
2. `PortfolioStatusView` fires `GET_SITES` with optional filters (company, managers, tags) and `pollInterval: 60000`. — `denowatts-portal/src/pages/dashboard/status/portfolio-status/components/PortfolioStatusView.tsx`
3. The query returns all sites with: `connectionStatus`, `lastReportedAt`, `serviceStatus`, `flaggedEventCount`, `criticalAlarmEventCount`, `setupStatus`. — `denowatts-backend/src/sites/services/sites.service.ts`
4. A table renders each site as a row with columns: Name, Service Status, Connection, Last Update, 7d EPI, Alarms, Tasks, Setup Progress. Rows are color-coded by connection and service status. — `denowatts-portal/src/pages/dashboard/status/portfolio-status/components/PortfolioStatusView.tsx`
5. Clicking a site row opens a notes modal (`SiteNoteModal`) or navigates to `/site/:siteId`. Users can add site-level notes (stored as events). — `denowatts-portal/src/pages/dashboard/status/portfolio-status/components/SiteNoteModal.tsx`
6. A drawer (`SiteNotesDrawer`) shows all past site notes. — `denowatts-portal/src/pages/dashboard/status/portfolio-status/components/SiteNotesDrawer.tsx`

### Channel Status view (`/status/channel`)

1. User navigates to `/status/channel` (or selects a channel from the site status view). `ChannelStatusView` reads the selected channel ID from state. — `denowatts-portal/src/pages/dashboard/status/channel-status/components/ChannelStatusView.tsx`
2. `ChannelStatusView` fires `GET_CHANNELS` filtered to the selected channel and `pollInterval: 60000`. — `denowatts-portal/src/pages/dashboard/status/channel-status/components/ChannelStatusView.tsx`
3. The view renders channel details: name, status, connection, last reported, remote management status (for gateways), and a metrics table. — `denowatts-portal/src/pages/dashboard/status/channel-status/components/ChannelMetricsTable.tsx`
4. If the channel is a Gateway, it also shows gateway-specific settings (IP, device config) via `ChannelSettings`. — `denowatts-portal/src/pages/dashboard/status/channel-status/components/ChannelSettings.tsx`

### System Status (SuperAdmin only, backend query)

1. A SuperAdmin calls the `systemStatus` GraphQL query. — `denowatts-backend/src/status-logs/resolvers/status-logs.resolver.ts`
2. The backend's `StatusLogsService.getSystemStatus()` queries the `status-logs` collection for the latest status of each service. — `denowatts-backend/src/status-logs/services/status-logs.service.ts`
3. It returns a hierarchical structure: overall system status, then a list of services (DATA_INGEST, CHARTS, ALARMING, etc.), each with sub-services and their statuses. — `denowatts-backend/src/status-logs/dto/system-status.output.ts`
4. Each service has a `status` (UP/DOWN/PARTIALLY_DEGRADED) and `lastUpdated` timestamp. — `denowatts-backend/src/status-logs/schemas/status-logs.schema.ts`

---

## Data it touched {dev}

### Channel schema status fields
- **`status`** — enum (ACTIVE, INACTIVE); set by admin, not live
- **`connectionStatus`** — enum (CONNECTED, DISCONNECTED); live, updated as device reports
- **`remoteManagementServiceStatus`** — string, set by gateway remote management (if applicable)
- **`lastReportedAt`** — timestamp, updated when data arrives
- **`lastConnectedAt`** — timestamp, updated when remote management service connects
- **`keyMetric`** — current value with unit (if channel publishes one)
- **`openAlarms`** — count of unacknowledged alarms (computed at query time)
- **`totalAlarms`** — count of 30-day alarms (computed at query time)

— `denowatts-backend/src/channels/schemas/channel.schema.ts`

### Site schema status fields
- **`connectionStatus`** — enum (CONNECTED, PARTIALLY_CONNECTED, DISCONNECTED); computed or set by ingestion
- **`lastReportedAt`** — timestamp, updated when any channel reports
- **`serviceStatus`** — enum (QUOTED, ORDERED, SHIPPED, COMMISSIONING, ACTIVE_AND_LEARNING, ACTIVE_NOT_LEARNING, DISCONTINUED); set by admin
- **`flaggedEventCount`** — count of flagged events (computed at query time via event lookup)
- **`criticalAlarmEventCount`** — count of critical unacknowledged alarms (computed via event lookup)

— `denowatts-backend/src/sites/schemas/site.schema.ts`

### Status-logs collection (system status)
- **`service`** — enum (DATA_INGEST, CHARTS, ALARMING, REMOTE_MANAGEMENT, etc.)
- **`subService`** — optional string (ALSOENERGY, NYSERDA, etc.)
- **`status`** — enum (UP, DOWN, PARTIALLY_DEGRADED)
- **`lastUpdated`** — timestamp
- **`runtime`** — duration in milliseconds (for services that track execution time)
- **`overrun`** — boolean or count (if service exceeded SLA)

— `denowatts-backend/src/status-logs/schemas/status-logs.schema.ts`

### Event-based notes
- Notes on channels and sites are stored as `EventCategory.NOTES` events with `site` or `channel` references. — `denowatts-backend/src/events/schemas/event.schema.ts`

---

## Edge cases & gotchas {dev}

- **Empty state with no siteId.** If the user navigates to `/status/site` (no param), the view shows an empty-state prompt and no channels table. The URL param is optional. — `denowatts-portal/src/pages/dashboard/status/site-status/SiteStatusPage.tsx`
- **Poll interval is 60 seconds.** Status is not real-time. If a device goes offline, it may take up to 60 seconds for the UI to reflect it. — `denowatts-portal/src/pages/dashboard/status/*/components/*StatusView.tsx`
- **Site connection status is derived, not stored.** CONNECTED/PARTIALLY_CONNECTED/DISCONNECTED is computed by comparing all channels' connection statuses client-side or at query time. It's not a pre-computed field in the Site schema. — `denowatts-portal/src/pages/dashboard/status/portfolio-status/components/PortfolioStatusView.tsx`
- **System status is hierarchical but flat-queried.** The backend returns a flat list of services with sub-service names. The frontend must group them hierarchically if needed. — `denowatts-backend/src/status-logs/services/status-logs.service.ts`
- **Notes are soft events, not permanently linked.** A note is an Event with `category: NOTES`, not a field on the site/channel itself. If the event is deleted or archived, the note disappears. — `denowatts-portal/src/pages/dashboard/status/site-status/components/ChannelNoteModal.tsx`
- **Gateway status includes remote management.** For Modbus gateways, the `remoteManagementServiceStatus` field indicates whether the gateway's remote management service is healthy, separate from its data connection. — `denowatts-backend/src/channels/schemas/channel.schema.ts`
- **Alarm counts are computed at query time.** `openAlarms` and `totalAlarms` are not pre-cached; they're computed by counting events every time the query runs. — `denowatts-backend/src/channels/services/channels.service.ts` (assumed, based on pattern)

---

**Related flows:** [[site]] (site-level status), [[portfolio]] (portfolio-level status aggregation), [[authentication]] (company scoping and role control)
