---
title: Site
owner: alamin-nifty
status: draft
version: 1
updated_at: 2026-06-05
---

# Site

The site page is the detail view for one solar installation. Accessed from the portfolio map, the status list, or by direct URL (`/site/:siteId`), it displays everything about that site: real-time KPIs, physical configuration, energy model, channels, and status. Every site-level action in the product — from editing capacity test files to configuring channels to tracking setup progress — starts here.

In plain terms: pick a site, load its data, and see 15 different tabbed or full-page sub-views, each revealing a different aspect of the installation. The page is the hub that connects all downstream features.

---

## The rules that matter

**Company scoping is enforced server-side, not hidden in the UI.** You can only view a site your company owns or has access to. Non-SuperAdmin users receive a `ForbiddenException` if they try to access a site they don't have permission for; SuperAdmins can view any site. — `denowatts-backend/src/sites/services/sites.service.ts:337-344`

**Role-split updates: admins and non-admins can change different fields.** All authenticated users can update `managers`, `tags`, `blocks`, and `predictedEnergyModel`. Only SUPER_ADMINs can update location, timezone, name, `serviceStatus`, energy model config, subscription details, and other core fields. — `denowatts-backend/src/sites/services/sites.service.ts:348-401`

**Timezone is auto-set when coordinates change.** If a SUPER_ADMIN edits a site's coordinates, the backend immediately calls Google Maps to fetch the IANA timezone and saves it. No manual entry needed. — `denowatts-backend/src/sites/services/sites.service.ts:363-378`

**Soft-delete only, events get archived.** When a site is deleted, the `deletedAt` timestamp is set; the MongoDB record is never removed. All related events are archived simultaneously so they stop appearing in active event lists. — `denowatts-backend/src/sites/services/sites.service.ts:433-465`

**A new site auto-gets a Weather channel.** When `create` is called, a default `Weather (Remote)` API channel is auto-provisioned with `status=ACTIVE`. — `denowatts-backend/src/sites/services/sites.service.ts:115-136`

**HubSpot sync happens on SUPER_ADMIN updates in production.** Field changes (name, serviceStatus, location, blocks, etc.) trigger a sync to the HubSpot custom object `p_sites` only when `NODE_ENV=production` and the user is SUPER_ADMIN. — `denowatts-backend/src/sites/services/sites.service.ts:408-419`

**The URL param flows through Redux, not directly to pages.** The `SiteSettings` component reads the URL param, validates it against the user's site list, and dispatches it to Redux (`state.header.siteSettings.site`). Every sub-page reads the site ID from Redux, never from `useParams()`. Invalid siteIds silently redirect to `/site` (no param). — `denowatts-portal/src/pages/dashboard/site/components/SiteSettings.tsx`

---

## Where it lives

The site feature spans 15 routes, split into two groups:

### Tabbed routes (shared tab bar)
All of these render inside `<SiteTabsLayout>`, which displays a navigation bar linking between them:

- **Site Overview** — `/site/:siteId` (index)
- **Live View** — `/site/:siteId/live-view`
- **Site Setup Tracker** — `/site/:siteId/site-setup-tracker`
- **General Info** — `/site/:siteId/general-info`
- **Hardware / Services** — `/site/:siteId/hardware-services`
- **Energy Model** — `/site/:siteId/energy-model`
- **Virtual Site Builder** — `/site/:siteId/site-builder` (Admin/SuperAdmin only)
- **Channels** — `/site/:siteId/channels`
- **Denobox** — `/site/:siteId/denobox`

### Full-page routes (no shared tab bar)
These routes render outside `<SiteTabsLayout>` and take up the full screen:

- **Capacity Test** — `/site/:siteId/capacity-test`
- **Channel Map** — `/site/:siteId/channel-map`
- **Learned Shade Profile** — `/site/:siteId/learned-shade-profile`
- **Benchmark Alignment** — `/site/:siteId/benchmark-alignment`
- **Energy Accounting** — `/site/:siteId/energy-accounting`
- **Notifications** — `/site/:siteId/notifications`

---

## Who can open what

**Frontend route guards:**
- `CompanyRequiredRoute` wraps the entire `/site/:siteId?` path tree — you must have a company assigned (SuperAdmins exempt). — `denowatts-portal/src/router.tsx:126-225`
- `NonUserRoute` guards `/site-builder` — read-only users are blocked; Admin and SuperAdmin only. — `denowatts-portal/src/router.tsx:126-225`

**Backend role control:**
- `createSite` and `deleteSite` are `@Roles(SUPER_ADMIN)` — blocked for all other roles. — `denowatts-backend/src/sites/resolvers/sites.resolver.ts:35-36, 92-95`
- `updateSite` is `@AllRoles()` but service narrows the field set for non-admins. — `denowatts-backend/src/sites/resolvers/sites.resolver.ts:54-59`, `sites.service.ts:348-401`
- Queries (`sites`, `site`) have no role decorator, but non-SuperAdmins are filtered by company in the service layer. — `denowatts-backend/src/sites/services/sites.service.ts:162-178`

---

## How it works {dev}

### Loading a site

1. The user navigates to `/site/:siteId` (or `/site` with no param). `SiteSettings.tsx` reads the URL param via `useParams()`. — `denowatts-portal/src/pages/dashboard/site/components/SiteSettings.tsx`
2. `SiteSettings` validates the param against the user's site list (fetched via `GET_SITES`). If invalid, it silently redirects to `/site` and clears Redux. If valid, it dispatches `updateSiteSettings({ site: siteId })` to store the siteId in `state.header.siteSettings.site`. — `denowatts-portal/src/pages/dashboard/site/components/SiteSettings.tsx`
3. The site sub-page (e.g., `SitePage`) reads `currentSite` from Redux: `useSelector((state: RootState) => state.header.siteSettings.site)`. — `denowatts-portal/src/pages/dashboard/site/overview/SitePage.tsx:83-85`
4. The sub-page fires `GET_SITE` with `variables: { id: currentSite }` and `pollInterval: 60000` (1 minute). — `denowatts-portal/src/pages/dashboard/site/overview/SitePage.tsx:87-95`
5. The backend's `findOne` resolver populates the site's owner (company name), project manager (person + company), and managers (names + emails). Non-SuperAdmins are filtered by company; a company-mismatch throws `ForbiddenException`. — `denowatts-backend/src/sites/services/sites.service.ts:307-346`

### The Overview tab (`/site/:siteId`)

1. On mount, `SitePage` loads four queries in parallel: `GET_SITE` (1 minute poll), `GET_EVENTS` with `openAlarms: true`, `GET_EVENTS` with `isFlagged: true`, `GET_EVENTS` for open tickets, and `GET_DENOBOX_FILES` (site plan image from `Plans/` folder). — `denowatts-portal/src/pages/dashboard/site/overview/SitePage.tsx:87-120`
2. The page renders five pill badges: Connection Status (links to `/status/site/:id`), Alarms, Flagged Tasks, Open Tickets, and Tasks. Each badge shows a count and navigates to `/events-feed` with pre-set filters when clicked. — `denowatts-portal/src/pages/dashboard/site/overview/SitePage.tsx:120-180`
3. A KPI table shows three rows: 7d, 30d, 365d. Columns: EPI, In-Service EPI, BEPI, Energy Availability, Equipment Availability. Each value is a link to `/analytics` with a pre-configured chart. — `denowatts-portal/src/pages/dashboard/site/overview/SitePage.tsx:140-160`
4. A two-column info card displays: site name, DC/AC capacity (from `blocks`), address, owner company, EPC company, O&M company, commercial operation date, last commissioned, service status badge, and access tags. On the right: an embedded Google Maps satellite view (draggable marker, centered on `location.coordinates`) and a site plan image fetched from Denobox `Plans/` folder (placeholder if no image or file is PDF/XLSX). — `denowatts-portal/src/pages/dashboard/site/overview/SitePage.tsx:160-271`

### Editing a site (General Info tab)

1. The user navigates to `/site/:siteId/general-info` and sees `GeneralInfoPage`. — `denowatts-portal/src/pages/dashboard/site/general-info/GeneralInfoPage.tsx`
2. The page fires `GET_SITE` and renders `SiteInfoForm`, a form with editable fields. Non-SuperAdmins see a limited field set: managers, tags, blocks. SuperAdmins see all fields: location, name, timezone, subscription, energy model config, etc. — `denowatts-portal/src/pages/dashboard/site/general-info/components/SiteInfoForm.tsx`
3. On form submission, the component fires `UPDATE_SITE` mutation with the edited fields. The backend receives the mutation in `updateSite` (decorated `@AllRoles()`). — `denowatts-backend/src/sites/resolvers/sites.resolver.ts:54-59`
4. The service checks the user's role. If SUPER_ADMIN, all fields are merged into the update payload. If not, only `managers`, `tags`, `blocks`, and `predictedEnergyModel` are kept. — `denowatts-backend/src/sites/services/sites.service.ts:362-401`
5. If the SUPER_ADMIN changed `location.coordinates`, the service auto-fetches the new timezone and adds it to the update. — `denowatts-backend/src/sites/services/sites.service.ts:363-378`
6. After update, if in production and fields like name/status/location/blocks changed, the service calls `updateHubSpotSite` to sync to HubSpot. — `denowatts-backend/src/sites/services/sites.service.ts:408-419`
7. If `capacityTestFile` changed, `uploadCapacityTest` is called to process the XLSX and store hourly irradiance/temperature/power predictions. — `denowatts-backend/src/sites/services/sites.service.ts:422-424`

---

## Data it touched {dev}

### Site document schema (`denowatts-backend/src/sites/schemas/site.schema.ts`)

**Core fields:**
- **`name`** — site name (required, text-indexed)
- **`location`** — object with `address`, `city`, `state`, `zip`, `coordinates` ([lon, lat]), `altitude`, `type`; 2dsphere-indexed for geo queries
- **`serviceStatus`** — enum (QUOTED, ORDERED, SHIPPED, COMMISSIONING, ACTIVE_AND_LEARNING, ACTIVE_NOT_LEARNING, DISCONTINUED)
- **`connectionStatus`** — enum (CONNECTED, PARTIALLY_CONNECTED, DISCONNECTED)
- **`timezone`** — IANA string (auto-set from coordinates)

**Ownership & access:**
- **`owner`** — ObjectId ref to Company (owning company)
- **`accesses[]`** — array of SiteAccess objects, each with `company: ObjectId` + `companyName: String` (cross-company access grants)

**Configuration:**
- **`blocks[]`** — array of SiteBlock objects, each with physical config: capacity, inverter info, module info, tilt, azimuth, tracker parameters, shading factors
- **`kpi`** — nested object with `week`, `month`, `year` sub-objects; each with `epi`, `epiInService`, `bepi`, `energyAvailability`, `equipmentAvailability` (pre-computed server-side)
- **`subscriptions`** — object with `plan` (type + startDate + endDate), `portfolioAnalytics` (startDate + endDate window), `capacityTest` (window)
- **`setupStatus[]`** — array of SetupStatus objects tracking commissioning steps; each has `id`, `name`, `task`, `status` (INCOMPLETE/COMPLETED), `responsibility`, `notes`

**People & metadata:**
- **`managers[]`** — array of User ObjectIds (site managers)
- **`projectManager`** — ObjectId ref to User (primary contact)
- **`commercialOperationDate`** — COD date
- **`lastCommissionedAt`** — date
- **`tags[]`** — array of strings (user-assigned labels)
- **`customId`** — customer-facing site ID string

**Energy model:**
- **`predictedEnergyModel`** — object with `capacityTestFile`, `capacityTestFilePath`, `energyModelReport[]`, `monthlyEnergyModel[]` (month + nrgNetPmtr + irradiance)

**Soft delete:**
- **`deletedAt`** — timestamp if deleted, null if active

### Event lookups (three $lookup stages in `find`)

The `find` method joins the `events` collection via a `$facet` to count:
- **Flagged events** — where `flaggedBy !== null`
- **Open tickets** — where `category === TICKET` and `ticketStatus !== CLOSED`
- **Critical unacknowledged alarms** — where `isAlarm !== null`, `severity === CRITICAL`, `acknowledgedBy === null`, `endDate === null`

Results are projected back as `flaggedEventCount`, `criticalAlarmEventCount`, `openTicketEventCount`. — `denowatts-backend/src/sites/services/sites.service.ts:268-304`

### Channels collection

When a site is created, `ChannelsService.create` is called to auto-provision a `Weather (Remote)` API channel with `source: ChannelSource.API`, `status: ChannelStatus.ACTIVE`. — `denowatts-backend/src/sites/services/sites.service.ts:120-128`

---

## Edge cases & gotchas {dev}

- **Invalid siteId redirects silently.** If the URL param doesn't match a site in the user's list, `SiteSettings` silently redirects to `/site` (no param) without showing a 404. The page then shows an empty-state prompt to select a site from the dropdown. — `denowatts-portal/src/pages/dashboard/site/components/SiteSettings.tsx`
- **GET_SITE polls every 60 seconds.** Data is refreshed automatically every minute on the Overview tab. Other tabs may have their own query intervals; check each page's component. — `denowatts-portal/src/pages/dashboard/site/overview/SitePage.tsx:94`
- **KPIs are pre-computed, not on-demand.** The values in the `kpi` table come from `site.kpi` (computed asynchronously elsewhere in the system, not in the site query). They are not recalculated on every page load. — `denowatts-backend/src/sites/schemas/site.schema.ts`
- **Site plan image is fetched from Denobox.** The image path is expected in the Denobox `Plans/` folder. If the file is not an image (PDF, XLSX), or if no file exists, a placeholder is shown. — `denowatts-portal/src/pages/dashboard/site/overview/SitePage.tsx:98-120`
- **The blocks array is the unit of physical config.** Block-level edits (capacity, tilt, azimuth, module, inverter) cascade to affect capacity test calculations and energy model results. Non-admins can edit blocks; SuperAdmins can edit them too. — `denowatts-backend/src/sites/services/sites.service.ts:398`
- **Coordinate changes are slow.** A SUPER_ADMIN editing coordinates triggers a Google Maps API call to fetch the timezone. This blocks the update response. — `denowatts-backend/src/sites/services/sites.service.ts:371-378`
- **HubSpot sync is production-only.** The `updateHubSpotSite` call only runs when `NODE_ENV=production`. In dev/staging, HubSpot is not touched. — `denowatts-backend/src/sites/services/sites.service.ts:411`
- **Soft-deleted sites still appear in queries if `showDeleted: true`.** By default, `find` filters out sites where `deletedAt !== null`. Only if the filter explicitly passes `showDeleted: true` are soft-deleted sites included. — `denowatts-backend/src/sites/services/sites.service.ts:145-148`

---

**Related flows:** [[authentication]] (company scoping and role control), [[portfolio]] (portfolio maps link to individual sites)
