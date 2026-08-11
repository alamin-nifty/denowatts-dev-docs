---
title: Settings
owner: alamin-nifty
status: draft
version: 4
updated_at: 2026-08-11
---

# Settings

Settings is the platform's **central configuration hub** — a single gear-icon dropdown in the header that links out to roughly 18 individual configuration pages. The menu adapts to who you are: a regular user with a company sees a short list; a platform admin sees everything. Each page is really its own feature with its own data, so this doc is the **directory** — it explains the settings shell and points every page at its dedicated deep doc.

> **Reading this doc:** use the **Business / Developer** switch at the top. *Business* is the directory of settings pages and who can see them. *Developer* adds the menu-component internals, route registration, the exact guards, the pages that have no dedicated doc (documented inline), file references, and a terminology primer.

---

## Why this matters

Settings is where the platform gets configured — companies, users, alarm thresholds, hardware catalogs, notification rules, API keys. Because these controls are powerful, the menu is deliberately tiered: most people only ever see the handful of pages relevant to their company, while the sensitive, platform-wide controls are reserved for SUPER_ADMINs and locked down at the URL level too — so you can't reach an admin page just by guessing its address.

---

## What's in Settings

The pages fall into three tiers. Each links to its own deep doc where one exists.

### Tier 1 — for any user with a company

- **Company** — your organization's profile and settings → [[companies]]
- **Services** — site subscriptions and service-contract management *(documented in the Developer view of this doc)*
- **Quotation Management** — sales quotes (also openable without a company) → [[quote]]
- **Notification Management** — how and when your company is alerted → [[notification]]
- **Global Alarm Configuration** — the alarm types and their thresholds → [[alarm-config]]

### Tier 2 — shared reference data

- **Metrics** — the catalog of measured quantities the platform tracks → [[metrics]]
- **Device Types** — the catalog of supported hardware types → [[device-types]]

### Tier 3 — platform administration (SUPER_ADMIN only)

- **Company Management** — create and manage all companies → [[companies]]
- **Users Management** — create and manage all users → [[users]]
- **Template Management** — the shared Modbus register-map template library → [[channels]] *(page detail in Developer view)*
- **Module Management** — the PV-module spec catalog *(Developer view)*
- **Inverter Management** — the inverter spec catalog *(Developer view)*
- **Asset Management** — hardware asset inventory → [[assets]]
- **Remote Management** — remote device configuration → [[assets]]
- **Metrics Management** — edit the metric catalog → [[metrics]]
- **Cell Modem Plan Management** — cellular SIM/modem usage analytics *(Developer view)*
- **System Notification** — platform-wide broadcast notifications → [[notification]]
- **Site Launch** — fleet-wide go-live / commissioning tracker *(Developer view)*
- **Audit Trail** — who changed what, in business language (Admin + SuperAdmin) → [[audit-trail]]
- **System Logs** — the exhaustive developer log, formerly *Activity Logs* (SuperAdmin only) → [[system-logs]]

---

## Who sees what

The menu has effectively two audiences:

- **SUPER_ADMINs** see every page — Tier 1, Tier 2, and the full Tier 3 admin set.
- **Everyone else** sees only Tier 1 and Tier 2. (An *Admin* and a regular *User* see the same menu here — the only distinction the menu makes is "SUPER_ADMIN or not".)
- **Users with no company yet** see just three pages: Quotation Management, Metrics, and Device Types — enough to get started before they're fully set up.

Tier 3 pages aren't just hidden from the menu for non-admins — they're blocked at the URL too, so typing the address directly still bounces a non-admin away.

---

## The rules that matter

- **The menu is gated on SUPER_ADMIN vs not** — there's no separate Admin menu tier.
- **No-company users get only Quotation, Metrics, and Device Types.**
- **The settings area requires a company**, with two deliberate exceptions: SUPER_ADMINs, and the Quotation Management page (open without one).
- **Admin pages are locked at the route, not just the menu** — direct-URL access by a non-admin is redirected away.
- **Guards check the server, not the browser** — a stale or tampered local role can't unlock pages; the real user is re-fetched on every guarded navigation.

---

## Settings menu structure (with role gating) {dev}

The menu is one memoized array, `settingsMenuItems`, built in `denowatts-portal/src/common/components/Header.tsx:424-693`. It is `baseItems` (keys 1, 2, 3, 4, 5, 6, 12) plus — **only for SuperAdmins** — a divider and the admin items (keys 7–11, 13–19). The active-item highlight comes from `settingsSelectedKeys` (`Header.tsx:398-422`). Role values from the `UserType` enum (`Header.tsx:77`).

Menu role logic (`Header.tsx:518-528`): **SuperAdmin** → full list; **non-SuperAdmin with a company** → `baseItems` only; **non-SuperAdmin without a company** → only keys 3, 4, 5 (Quotation, Metrics, Device Types) (`:519-525`). `UserType.Admin` and `UserType.User` are treated identically — the only branch is `type === SuperAdmin`.

### Tier 1 — base items (any user with a company) {dev}

| Page | Key | Route | Visible to | Deep doc | Menu item |
|------|---|---|---|---|---|
| Company | 1 | `/settings/company` | any user (not no-company) | [[companies]] | `Header.tsx:426-438` |
| Services | 2 | `/settings/service-management` | any with company | inline | `Header.tsx:439-451` |
| Quotation Management | 3 | `/settings/quote-management` | any (incl. no-company) | [[quote]] | `Header.tsx:452-464` |
| Notification Management | 6 | `/settings/notification-management` | any with company | [[notification]] | `Header.tsx:491-503` |
| Global Alarm Configuration | 12 | `/settings/global-alarm-configuration` | any with company | [[alarm-config]] | `Header.tsx:504-516` |

### Tier 2 — metric/device reference (base items, top-level routes) {dev}

In the **base** menu array but registered at the **top level** of the router, *outside* `<App>` and any guard (see Route registration).

| Page | Key | Route | Visible to | Deep doc | Menu item |
|------|---|---|---|---|---|
| Metrics | 4 | `/metrics` | any (incl. no-company) | [[metrics]] | `Header.tsx:465-477` |
| Device Types | 5 | `/device-types` | any (incl. no-company) | [[device-types]] | `Header.tsx:478-490` |

### Tier 3 — admin settings (SuperAdmin only, after the divider) {dev}

Divider at `Header.tsx:531-534`; keys 7+ render only when `currentUser?.type === UserType.SuperAdmin` (`:529-692`). Every Tier-3 route is additionally wrapped in `<ProtectedRoute>`.

| Page | Key | Route | Deep doc | Menu item |
|------|---|---|---|---|
| Company Management | 7 | `/settings/company-management` | [[companies]] | `Header.tsx:535-547` |
| Users Management | 8 | `/settings/users-management` | [[users]] | `Header.tsx:548-560` |
| Template Management (Modbus) | 9 | `/settings/template-management` | inline | `Header.tsx:561-573` |
| Module Management | 10 | `/settings/module-management` | inline | `Header.tsx:574-586` |
| Inverter Management | 11 | `/settings/inverter-management` | inline | `Header.tsx:587-599` |
| Asset Management | 13 | `/settings/asset-management` | [[assets]] | `Header.tsx:601-613` |
| Remote Management | 14 | `/settings/remote-management` | [[assets]] | `Header.tsx:614-626` |
| Metrics Management | 15 | `/settings/metrics-management` | [[metrics]] | `Header.tsx:627-639` |
| Cell Modem Plan Management | 19 | `/settings/cell-modem-management` | inline | `Header.tsx:640-652` |
| System Notification | 16 | `/settings/system-notification` | [[notification]] | `Header.tsx:653-665` |
| Site Launch | 17 | `/settings/site-launch` | inline | `Header.tsx:666-678` |
| System Logs | 18 | `/settings/system-logs` | [[system-logs]] | `Header.tsx:679-691` |
| Audit Trail | — | `/settings/audit-trail` | [[audit-trail]] | `denowatts-portal/src/routes/_dashboard/settings/audit-trail.tsx` |

> Menu keys are identifiers, not display order: array order is 1,2,3,4,5,6,12 then 7,8,9,10,11,13,14,15,19,16,17,18.

---

## Settings shell implementation {dev}

### Menu component {dev}
`settingsMenuItems` memo — `Header.tsx:424-693`. Reads `currentUser` from Redux (`:200`); deps `[currentUser?.type, currentUser?.company]` (`:693`). Each item's `label` is a `<Link to="/settings/...">`. `settingsSelectedKeys` memo (`:398-422`) maps a route substring to a key; **ordering matters** — the broad `/settings/company` check (`:418`) is placed *after* `/settings/company-management` (`:399`) so the specific path wins. The `<Dropdown>` renders at `:1154-1167`. Mobile: the settings menu isn't duplicated in the drawer; only per-page header sub-components are mirrored in the `md:hidden` block (`:1190-1232`). UNCLEAR how SuperAdmins reach settings on mobile at runtime (the gear `<Dropdown>` is in the always-visible header row, so likely available).

### Route registration {dev}
All settings pages under `{ path: 'settings', element: <CompanyRequiredRoute />, children: [...] }` — `router.tsx:350-552`. **Metrics and Device Types are NOT under settings** — top-level routes at `:605-608` / `:609-615`, *after* the `<App>` children array closes (`:561`), so they render **outside** the shell and **outside** any guard (device-types' GraphQL is also `@Public()`). `api-management` (`:414-424`) is registered + `ProtectedRoute`-wrapped but has **no menu entry** and is linked nowhere — see Edge cases.

### Role-gating guards {dev}
- **`CompanyRequiredRoute`** (`views/ProtectedRoute/CompanyRequiredRoute.tsx`) wraps the whole settings subtree (`router.tsx:351`). Re-fetches via `GET_USER`; SuperAdmin → `<Outlet />` (`:37-39`); `/settings/quote-management*` → `<Outlet />` without a company (`:34,42-44`); else no company → `/not-found` (`:47-49`).
- **`ProtectedRoute`** wraps each Tier-3 page (`ProtectedRoute.tsx:21-34`): re-fetch user; no user → `/signin`; not SuperAdmin → `/not-found`. The hard gate against direct-URL access.
- **`NonUserRoute`** (blocks read-only `User`) is **not used** in settings; recorded for completeness.

---

## Sub-pages without a dedicated doc (documented inline) {dev}

### Services — `/settings/service-management` {dev}
`pages/dashboard/settings/service-management/ServiceManagementPage.tsx` (~847 lines). A site-subscription / service-contract table (lists sites incl. soft-deleted via `showDeleted: true`), each row expandable to its channels, editing site name/tags/managers and Deno-asset info. Ops: `GET_SITES` (with `packageExpiresAt`, `showDeleted: true`), `GET_USERS` (manager picker, skipped unless SuperAdmin+company), lazy `GET_CHANNELS`, `UPDATE_SITE`/`DELETE_SITE` (`:7-10, 53-126`).

### Template Management — `/settings/template-management` {dev}
`pages/dashboard/settings/modbus-template/ModbusTemplatePage.tsx` (~235 lines; route name ≠ dir name). Bulk editor for Modbus register-map templates reused across sites. Ops: `GET_MODBUS_TEMPLATES` (`network-only`), `BULK_UPDATE_MODBUS_TEMPLATES` (refetches templates + `GET_CHANNELS`) (`:7-41`). `useBlocker` warns on unsaved edits (`:58`). Channel side covered in [[channels]]; metric-prefix auto-naming in [[metrics]].

### Module / Inverter Management — `/settings/module-management`, `/settings/inverter-management` {dev}
Near-identical paginated CRUD catalogs of PV-module and inverter specs (`ModuleManagementPage.tsx` / `InverterManagementPage.tsx`, ~99 lines each). Filter by manufacturer/model via Redux `state.header.*ManagementSettings`. Ops: `PAGINATE_MODULES` / `PAGINATE_INVERTERS` with `{ page, limit, manufacturer, model }`, `cache-and-network`. Create/edit mutations live in the `*AddModal`/`*Table` components — UNCLEAR exact names (not re-read).

### Cell Modem Plan Management — `/settings/cell-modem-management` {dev}
`pages/dashboard/settings/cell-modem-management/CellModemManagementPage.tsx` (~357 lines). SuperAdmin usage-analytics dashboard for Lattigo cellular SIMs/modems; server-side paginated table; date-range filter changes which columns show. Ops: `GET_LATTIGO_USAGE_ANALYTICS` `{ page, pageSize, startDate, endDate }` (`:7,64-84`), SuperAdmin-only resolver. Per-modem card lives in [[channels]]/[[assets]].

### Site Launch — `/settings/site-launch` {dev}
`pages/dashboard/site-launch/SiteLaunchPage.tsx` (~600+ lines; sibling of `settings/`). Fleet-wide go-live tracker — a sites × setup-tasks matrix, each cell a status `<Select>` (Completed/Incomplete/N/A) editing a site's `setupStatus`; task names shared with the per-site Setup Tracker. Ops: `PAGINATE_SITES`, `UPDATE_SITE` (`:7-8`).

### API Management — `/settings/api-management` (orphaned, not in menu) {dev}
`pages/dashboard/settings/api-management/APIManagementPage.tsx` (~371 lines). Per-company API-key + IP-whitelist admin: Generate/Revoke a company's public API key, remove whitelisted IPs (`isValidIP`, `:22`). Ops: `GET_COMPANIES`, `UPDATE_API_KEY` (`Generate|Revoke`), `UPDATE_COMAPNY` (sic) to write `whitelistedIPs` (`:4-9,39-42,312-339`). Wrapped in `ProtectedRoute` but with **no menu entry and no link** — reachable only by typing the URL. Edits the same `Company.token`/`whitelistedIPs` covered by [[companies]] and used by [[data-out]]. Likely superseded — flag for review.

---

## Business rules (cited) {dev}

- **Menu gated on `SuperAdmin` only; Admin == User** — `Header.tsx:518`.
- **No-company non-SuperAdmin → keys 3, 4, 5 only** — `Header.tsx:519-525`.
- **Settings subtree requires a company** except SuperAdmins and `/settings/quote-management*` — `CompanyRequiredRoute.tsx:34,37-49`.
- **Tier-3 pages SuperAdmin-only at the route** via `ProtectedRoute` — `ProtectedRoute.tsx:27-32` (independent of the menu filter).
- **Guards re-fetch the user (`GET_USER`)** rather than trusting Redux — `CompanyRequiredRoute.tsx:15-19,32-33`, `ProtectedRoute.tsx:15-27`.
- **Selected-key highlight resolves most-specific path first** — `Header.tsx:398-422`.

---

## Edge cases & gotchas {dev}

- **API Management is an orphaned route** — registered + guarded but absent from the menu and unlinked (`router.tsx:414-424`). Likely superseded. Flag for review.
- **Metrics & Device Types render outside the app shell** — after the `<App>` children array (`:561`), so no `CompanyRequiredRoute`/`ProtectedRoute`; device-types GraphQL is `@Public()`.
- **Route ≠ component/dir names** — `template-management` → `modbus-template/`; menu label "Cell Modem **Plan** Management"; `site-launch` lives in `pages/dashboard/site-launch/`. Grep by route.
- **`settingsSelectedKeys` only highlights known sub-paths** — an unmapped route (e.g. `/settings/api-management`) leaves no highlighted item (`Header.tsx:421`).
- **Settings dropdown is the same on mobile and desktop**, but per-page header sub-components are split between `hidden md:flex` (`:845-924`) and `block md:hidden` (`:1190-1232`); not every page is mirrored to mobile. UNCLEAR if intentional.
- **Menu keys are not display order** — admin items interleave (…15, 19, 16, 17, 18).
- **Quote management has its own breadcrumb special-casing** (`Header.tsx:752-801`).

---

## Solar & platform terminology {dev}

- **Metric** — a measured quantity the platform tracks (e.g. POA irradiance, AC power, energy). The Metrics pages edit the catalog. See [[metrics]].
- **Device type** — a category of supported hardware (gateway, sensor, modem, …) with its spec template. See [[device-types]].
- **Module / inverter** — the PV panel and DC→AC converter; their spec catalogs are managed here and referenced by each site's blocks. See [[site]].
- **Modbus template** — a reusable register-address map describing how to read a particular device over Modbus; Template Management is the shared library. See [[channels]].
- **Lattigo / cell modem** — the cellular-connectivity provider and the SIM/modem hardware that backhauls site data over cellular; Cell Modem Plan Management shows usage. See [[channels]].
- **API key / IP whitelist** — a company's credentials for the public data API; managed via Company Management (and the orphaned API Management page). See [[data-out]].
- **Setup status / launch** — the per-site commissioning checklist; Site Launch is the fleet-wide view of it. See [[site]].

For the full domain vocabulary, see [[solar-glossary]].

---

**Related flows:** [[authentication]] · [[companies]] · [[users]] · [[metrics]] · [[device-types]] · [[alarm-config]] · [[notification]] · [[assets]] · [[audit-trail]] · [[system-logs]] · [[quote]] · [[channels]] · [[data-out]] · [[solar-glossary]]
