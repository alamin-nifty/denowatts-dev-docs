---
title: Status
owner: alamin-nifty
status: draft
version: 3
updated_at: 2026-06-10
---

# Status

The Status dashboard is the platform's **live health board** — the screen an operator watches to answer "is this site's gateway connected, is this channel reporting data, and what's failing right now?" It has three live views that drill from the whole fleet, to one site, to one channel, each refreshing automatically.

> **Reading this doc:** use the **Business / Developer** switch at the top. *Business* explains the three views, what the colors and numbers mean, and who sees what. *Developer* adds each view's queries and components, the connection-state model (and the key finding that connection status is produced outside this codebase), the backend computation, file references, and a terminology primer.

---

## Why this matters

Solar sites fail quietly — a gateway loses cellular signal, a sensor stops reporting, an inverter trips — and nobody notices until production numbers look wrong days later. The Status dashboard makes those failures visible *now*. It's the operations team's first stop each morning and their triage screen when something's off: green means reporting, red means investigate, and every red row links straight to where you'd act on it.

---

## The three views

A toolbar toggles between three levels:

- **Portfolio Status** — every site in your fleet on one table: connection state, service status, recent performance (7-day EPI), critical alarms, open tasks, and setup progress. The "is my whole fleet healthy?" view.
- **Site Status** — one site, broken down: each channel's connection state and latest key reading, plus a gateway remote-management health table. The "what's wrong *at this site*?" view.
- **Channel Status** — one channel's latest raw metric values, to the individual reading. The "what is this exact sensor/inverter saying right now?" view.

There's also a **System Status** view (platform infrastructure health) reserved for platform admins — covered separately in [[status-logs]].

All three views refresh themselves about once a minute, and a Refresh button forces an immediate update. Status is *polled*, not pushed live.

---

## Connection status, in plain terms

The colored dot is the heart of the dashboard — it tells you whether the hardware is currently reporting:

- **Green — Connected.** Reporting normally.
- **Yellow — Partially connected** (sites only). Some of the site's channels are reporting and some aren't.
- **Red — Disconnected.** Not reporting.

A site can be any of the three; an individual channel is just green or red. This indicator reflects what the data-ingestion system has most recently seen from the hardware — the dashboard reads and displays it. Anything brand-new that's never reported yet shows red until its first data arrives.

---

## What the numbers mean

Alongside the connection dot, each view surfaces a few operational numbers:

- **7-day EPI** (Portfolio) — a performance score: green ≥ 95%, orange 90–95%, red below. A quick "is this site producing what it should?"
- **Critical Alarms** — count of unresolved critical alarm events; click to jump into the filtered events feed.
- **Tasks** — count of flagged follow-up items.
- **Open / 30-day alarms** (Site, per channel) — current open alarms and the last month's total.
- **Key metric** (Site, per channel) — the channel's most recent headline reading.
- **Setup status** (Portfolio) — whether the customer-side and Denowatts-side commissioning steps are complete.

These counts are recomputed on every refresh, so they're always current.

---

## Who sees what

The three dashboard views are scoped to your company — you only see your own sites and channels (SUPER_ADMINs see all). The separate **System Status** (platform infrastructure) is SUPER_ADMIN-only.

---

## The rules that matter

- **Status is polled (about every 60 seconds), not pushed** — there's no live stream; the Refresh button forces an immediate update.
- **The connection dot reflects what the ingestion system last saw** — the dashboard displays it, it doesn't decide it.
- **Sites have three connection states, channels have two** (no "partial" for a single channel).
- **The site view lists only active channels**, and the gateway health table only appears when the site has a gateway.
- **Never-reported hardware shows red** until its first data arrives.
- **Everything is company-scoped on the server**, not just hidden in the UI.

---

## Entry points & routes {dev}

Header "Status" nav → routes under `/status/*`, all wrapped in `CompanyRequiredRoute` (`router.tsx:227-244`). A header toolbar (`StatusSettings.tsx`) provides the Portfolio/Site/Channel toggle, site/channel pickers, search, and a manual Refresh (dispatches `refreshTrigger: Date.now()`). System Status is at `/status/system` → [[status-logs]].

---

## Status views (detailed) {dev}

### Portfolio Status — `/status/portfolio` {dev}
`PortfolioStatusPage` → `PortfolioStatusView`. A `Table` of the company's sites (columns `:281-543`): Site name (→ `/status/site/:id`), Service Status (filterable), Connection Status (colored dot), Last Update Time (`lastReportedAt`), 7d EPI (`kpi.week.epi × 100`), Critical Alarms, Tasks, Customer/Denowatts Setup Status, Notes. Query `GET_SITES` with `{ filter: { ...sitesFilter, showNotes: true } }`, **`pollInterval: 60_000`** (`:83-92`), plus `refetch()` on mount and `refreshTrigger`. Resolver `sites` (no `@Roles`) → `SitesService.find` (`sites.service.ts:142-308`). Dot color from `connectionStatusMap` (`:31-47`); EPI color ≥95 green / 90–95 orange / else red (`:399-407`); setup-complete logic client-side (`:232-279`). Drill-downs: name→site status, EPI→analytics, alarm/task counts→events feed, setup dots→setup tracker, notes→note drawer ([[events]]).

### Site Status — `/status/site/:siteId?` {dev}
`SiteStatusPage` → `SiteStatusView`. No `currentSite` → "Please select a site" (`:343-350`). Two tables: (1) **Gateway remote-management** (only if Gateway-source channels exist) — Denowatts Gateway, Remote Management Status badge (`getRemoteStatusBadge` `:173-187`), Last Connected (`lastConnectedAt`); (2) **Channel table** — channels filtered to `status === ACTIVE` + search (`:436-442`): Channel Name (→ `/status/channel`), Key Metric (`keyMetric`+`unit`, 2dp), Last Update Time (`lastReportedAt`), Data Service Status (dot), Open Alarms, Total alarms 30d, Tasks (hardcoded `'-'`, `:299`), Notes. Query `GET_CHANNELS` `{ sites: [currentSite] }`, `skip: !currentSite`, **`pollInterval: 60_000`** (`:52-60`); plus `GET_EVENTS` (NOTES, limit 500) for the Notes column. Resolver `channels` → `ChannelsService.findAll`. Channel dot binary: Connected→green else red (`:250-271`).

### Channel Status — `/status/channel` {dev}
`ChannelStatusPage` → `ChannelStatusView`. Reads `selectedChannel`/`currentSite` from Redux; three guard states (no site / no channel / not found, `:28-50`). Picker + URL sync (`?site=&channel=`) in `ChannelSettings.tsx` (lazy `GET_CHANNEL` to resolve site from bare `?channel=`; only ACTIVE Gateway/Deno/Modbus/OPC channels selectable). Renders `ChannelMetricsTable` — info cards + metrics `Table` (Name/Value/Unit, precision selector). Query `GET_CHANNEL_METRICS` `{ filter: { site, channelId } }`, **`pollInterval: 60_000`** (`:54-66`). Resolver `getChannelMetrics` → `MetricsService.getChannelMetrics` (`metrics.service.ts:264-342`) reads the **`channelraws`** time-series (not the Channel doc): newest raw by `metadata.channel`/`metadata.site`, then a short window back (5 min, or `reportInterval × 2.5` for Modbus) for the latest value per metric. See [[data-out]].

### System Status — SuperAdmin (backend health layer) {dev}
Not a `/status/*` dashboard route — the `systemStatus` query (SuperAdmin-only) rolls `statuslogs` up to UP/DOWN/PARTIALLY_DEGRADED. **Fully documented in [[status-logs]].**

---

## Connection state model {dev}

### States {dev}
- **Channel** `ChannelConnectionStatus`: `CONNECTED`, `DISCONNECTED` (`channel.schema.ts:35-38`, stored on `Channel.connectionStatus`, default `DISCONNECTED`, `:234-240`). Also `ChannelRemoteManagementServiceStatus` for gateways (`:40-43,242-248`).
- **Site** `SiteConnectionStatus`: `CONNECTED`, `PARTIALLY_CONNECTED`, `DISCONNECTED` (`site.schema.ts:24-28`, stored on `Site.connectionStatus`, default `DISCONNECTED`, `:573-581`).

### How each is computed — KEY FINDING {dev}
**Connection status is NOT computed in this codebase at query time** — it's a persisted field read straight off the document. A repo-wide search for any *write* of `connectionStatus` finds only schema definitions, read-side aggregations, and a test fixture — **no producer** in `denowatts-backend/src`:
- `Channel.connectionStatus` write: none (only `channels.service.spec.ts:285` fixture).
- `Site.connectionStatus` write: none; only *read* in the portfolio rollup (`sites.service.ts:962-983`).
- `lastReportedAt`/`lastConnectedAt` writes: none in `src/` (response-field `lastReportedAt` in metrics is from raw `timestamp`, not the stored field).

**Therefore** the freshness logic that flips CONNECTED ↔ DISCONNECTED (last-seen comparison, staleness thresholds, and the channel→site PARTIALLY_CONNECTED rollup) lives in an **external/background ingestion service not in this repo**. **UNCLEAR: the exact last-seen threshold and the PARTIALLY_CONNECTED rollup rule cannot be cited from this codebase — flag for review.** What this repo *does* derive are the counts layered on top (alarms/notes/flags — see Backend computation).

### Color mapping (frontend) {dev}
Site (3-state): `Connected → green-600`, `PartiallyConnected → yellow-500`, `Disconnected → red-500` (`PortfolioStatusView.tsx:31-47`; sort order Connected<Partially<Disconnected). Channel (2-state): green check / red close (`SiteStatusView.tsx:250-271`). Gateway remote management (2-state): green/red badge (`:173-187`).

---

## GraphQL API surface {dev}

| Operation | Input | Output (key fields) | Resolver → service | Poll |
|---|---|---|---|---|
| `sites` | `{ ...sitesFilter, showNotes: true }` | `connectionStatus`, `lastReportedAt`, `serviceStatus`, `kpi.week.epi`, `criticalAlarmEventCount`, `flaggedEventCount`, `hasNotesEvent`, `setupStatus[]` | `sites.resolver.ts:41-44` → `sites.service.ts:142-308` | 60s |
| `channels` | `{ sites: [siteId] }` | `status`, `connectionStatus`, `remoteManagementServiceStatus`, `lastReportedAt`, `lastConnectedAt`, `keyMetric`, `unit`, `openAlarms`, `totalAlarms`, `source` | `channels.resolver.ts:30-33` → `channels.service.ts:263-…` | 60s |
| `getChannelMetrics` | `{ site, channelId }` | `name`, `displayName`, `unit`, `channelLastRawRecord`, `lastReportedAt` | `metrics.resolver.ts:49-52` → `metrics.service.ts:264-342` | 60s |
| `channel` | `{ _id }` | single channel (resolve site from bare `?channel=`) | `channels.resolver.ts:35-38` | lazy |
| `events` | NOTES, limit 500 | notes per channel | events module ([[events]]) | none |

No mutations/subscriptions specific to status; notes go through the events module. `systemStatus` → [[status-logs]].

---

## Backend computation {dev}

### `sites` query — `sites.service.ts:142-308` {dev}
Company scoping: non-SuperAdmin without a company → `[]`; else `owner` OR `accesses.company` matches (`:162-178`); soft-deleted excluded unless `showDeleted`. `connectionStatus`/`lastReportedAt`/`serviceStatus`/`kpi` are **stored pass-through**. Computed via `$lookup`+`$facet` into `events`: `flaggedEventCount`, `criticalAlarmEventCount` (CRITICAL/unacked/open), `openTicketEventCount`, and (when `showNotes`) `hasNotesEvent`/`ongoingNotesEventCount` (`:185-266`) — recomputed every poll.

### `channels` query — `channels.service.ts:263-…` {dev}
Non-SuperAdmin without a company → `ForbiddenException` (`:264-266`). Stored pass-through: `status`, `connectionStatus`, `remoteManagementServiceStatus`, `lastReportedAt`, `lastConnectedAt`, `keyMetric`, `config`. Computed: `openAlarms` (open alarm events, `:380-397`), `totalAlarms` (last 30d, `:400-419`), `unit` (joined `devicetypes`→`metrics` by channelId prefix). Asset-joined and device-type-ordered/natural-sorted.

### `getChannelMetrics` — `metrics.service.ts:264-342` {dev}
Looks up the channel, then the **newest raw record** in `channelraws` (`:275-282`); returns `[]` if none. Builds a window (5 min back, or `reportInterval × 2.5` for Modbus) and returns the latest non-null value per metric (`channelLastRawRecord`) with its `lastReportedAt` (raw `timestamp`). Failure → `BadRequestException`.

### Auth {dev}
`JwtAuthGuard` + `RolesGuard` global (`app.module.ts:179-184`). Dashboard queries carry **no `@Roles`** → any authenticated user, company-scoped at the service layer. Only `systemStatus`/`createSite`/`deleteSite` etc. are `@Roles(SUPER_ADMIN)`. Frontend wraps `/status/*` in `CompanyRequiredRoute`.

---

## Business rules (cited) {dev}

- **All three views poll every 60s** + `refetch()` on the Refresh button (`refreshTrigger`) — `StatusSettings.tsx:54-60`; consumers `PortfolioStatusView.tsx:91`, `SiteStatusView.tsx:59`, `ChannelMetricsTable.tsx:65`. No WebSocket/subscription.
- **Connection status is read-only and externally produced** — `channel.schema.ts:234-240`, `site.schema.ts:573-581`.
- **Site has 3 states, channel has 2** — `site.schema.ts:24-28` vs `channel.schema.ts:35-38`.
- **Site view lists only ACTIVE channels** (`SiteStatusView.tsx:436-442`); gateway table only with ≥1 Gateway channel (`:165-171`).
- **Channel picker offers only ACTIVE Gateway/Deno/Modbus/OPC** — `ChannelSettings.tsx:41-53`.
- **Alarm/note/flag counts recomputed every poll** — `sites.service.ts:185-266`, `channels.service.ts:380-419`.
- **Company scoping server-side** — `sites.service.ts:162-178`, `channels.service.ts:264-266`.
- **System Status is SuperAdmin-only** — see [[status-logs]].

## Data touched {dev}

- `sites.connectionStatus` / `.lastReportedAt` / `.serviceStatus` / `.kpi.week.epi` / `.setupStatus[]` — stored, shown as columns — `site.schema.ts:573-585`.
- `channels.connectionStatus` / `.remoteManagementServiceStatus` / `.lastReportedAt` / `.lastConnectedAt` / `.keyMetric` — stored — `channel.schema.ts:234-285`.
- `events` — `$lookup` source for `openAlarms`/`totalAlarms` and `flaggedEventCount`/`criticalAlarmEventCount`/notes. See [[events]], [[alarm-config]].
- `channelraws` (data-out) — the Channel view's per-metric latest values. See [[data-out]].
- Notes — `EventCategory.NOTES` events via the note modals.

## Edge cases & gotchas {dev}

- **Stale data looks fresh in the metrics table** — `getChannelMetrics` windows relative to the *newest raw record*, not "now"; a device that stopped yesterday still shows yesterday's values with an old `lastReportedAt` (`metrics.service.ts:290-299`).
- **Channel view "Last Reported" uses `lastConnectedAt`**, while the Site table uses `lastReportedAt` — different stored fields, can diverge (`ChannelMetricsTable.tsx:137-140`).
- **Never-connected hardware shows red** — both schemas default `connectionStatus` to `DISCONNECTED`; opposite of the system-status layer's missing-log-defaults-UP optimism ([[status-logs]]).
- **PARTIALLY_CONNECTED rollup is invisible here** — the rule mapping channel states up to a site's yellow isn't in this repo. **UNCLEAR — confirm in the external ingestion service.**
- **Last-seen timestamps render in the browser's timezone**, not the site's — the site `timezone` is fetched but not applied to these columns (`PortfolioStatusView.tsx:374-385`).
- **Tasks column on the Site view is hardcoded `'-'`** (`SiteStatusView.tsx:299`) — not yet wired to ticket counts.
- **Channel-status URL is shareable** — `ChannelSettings` keeps `?site=&channel=` in sync (`:55-98`).

---

## Solar & platform terminology {dev}

- **Connection status** — whether the hardware is currently reporting to the platform (Connected / Partially / Disconnected).
- **Gateway (Denobox)** — the on-site data box; "remote management status" tracks whether the platform can reach it. See [[channels]].
- **Channel** — one configured data stream (a gateway, Deno sensor, or meter/inverter register). See [[channels]].
- **Key metric** — a channel's designated headline value, shown in the Site status table.
- **EPI** — Energy Performance Index (actual ÷ expected energy); the 7-day EPI column is a quick health read. See [[site]].
- **Raw data** — the unaggregated per-reading records the Channel view reads for latest values. See [[data-out]].
- **Service status** — the site's lifecycle stage (commissioning, active, etc.); distinct from connection status. See [[site]].
- **Alarm / task** — an auto-raised condition vs a flagged follow-up item; the status views show live counts of each. See [[alarm-config]], [[events]].

For the full domain vocabulary, see [[solar-glossary]].

---

**Related flows:** [[status-logs]] · [[channels]] · [[data-out]] · [[site]] · [[portfolio]] · [[alarm-config]] · [[events]] · [[solar-glossary]]
