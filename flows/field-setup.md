---
title: Field Setup
owner: alamin-nifty
status: draft
version: 1
updated_at: 2026-06-05
---

# Field Setup

Field Setup is a guided wizard for commissioning new gateway hardware and associated Deno sensors in the field. It's a multi-step onboarding flow that walks technicians through gateway selection, network configuration, Deno device discovery, channel mapping, and final verification. The feature is designed for hands-on field installation teams, not office-based users.

In plain terms: click Field Setup to begin a 3-step wizard. First, select or validate a gateway device. Second, configure its network and discover/assign Deno sensors. Third, verify the system is live by checking data and creating the site.

---

## The rules that matter

**Field Setup is a sequential 3-step wizard with sub-steps; users cannot skip steps.** The flow is linear: Intro → Gateway Setup (with sub-steps: List-Setup, Networking-Info, Deno-List, Live-Data, Setup) → Verify Installation. Navigation goes forward via form submission; backward via breadcrumbs. Attempting to jump directly to a later step without validating the gateway first fails. — `denowatts-portal/src/router.tsx:293-347`

**Gateways are identified by serial number and validated against existing channels.** When a user enters a gateway serial number (or picks from a dropdown), the system queries the backend for a channel with `source=Gateway` and matching serial number. If found, it's valid; if not, an error is shown. This prevents configuration of non-existent or invalid gateways. — `denowatts-portal/src/pages/dashboard/field-setup/overview/components/FieldSetupDashboard.tsx:112-146`

**Selected assets (site, gateway, serial number) are cached in sessionStorage.** When the user navigates between sub-steps, the selections are cached in `sessionStorage['assets']` and restored on page reload. This allows the user to refresh without losing state. Once the session ends or the page is closed, the cache clears. — `denowatts-portal/src/pages/dashboard/field-setup/overview/components/FieldSetupDashboard.tsx:36-51, 70-77`

**Deno devices are discovered via channel queries with source=Deno filter.** After a gateway is selected, the system queries for all Deno channels under that gateway. Deno devices are child channels linked to the gateway; the relationship is defined by channel parent/child hierarchy, not by physical port assignments. — `denowatts-portal/src/pages/dashboard/field-setup/list-setup/components/GatewayListSetup.tsx`

**Network configuration is stored on the gateway channel's config object.** IP address, DNS, gateway settings, and other network parameters are persisted in the gateway channel's `config` document, not in a separate settings table. This keeps gateway metadata colocated with the channel record. — `denowatts-backend/src/channels/schemas/gateway-channel-config.schema.ts`

**Live data is fetched from the gateway's raw channel data endpoint.** During the live-data verification step, the system calls `GET_CHANNEL_RAW` to fetch real-time metrics from the gateway. If the gateway has no recent data, the step fails with a "gateway not responding" error. This ensures the gateway is physically connected and communicating. — `denowatts-portal/src/pages/dashboard/field-setup/live-data/components/LiveDataView.tsx`

**Verification creates or updates a site record and sets the service status to commissioning-stage.** When the user completes the wizard and clicks Verify, the backend creates a new site (or updates an existing one) with a status that indicates it's in the field setup stage. Once verified, the site becomes visible in the portfolio and other analytics pages. — `denowatts-portal/src/pages/dashboard/field-setup/verify-installation/components/VerifyInstallationForm.tsx`

---

## Where it lives

Field Setup consists of 8 routes nested under `/field-setup` and `/field-setup/gateway-setup`:

### Main entry point

- **Field Setup Intro** — `/field-setup`
  - Landing page with 3-step wizard overview
  - "START NOW" button navigates to Gateway Setup step

### Step 1: Gateway Setup (with sub-steps)

- **Gateway Setup** — `/field-setup/gateway-setup` (index)
  - Select site and enter gateway serial number
  - Form submission validates the gateway exists
  - On success, navigates to list-setup

- **List Setup** — `/field-setup/gateway-setup/list-setup`
  - View/manage Deno devices already linked to the gateway
  - Add new Denos or remove existing ones
  - "Next" button navigates to networking-info

- **Networking Info** — `/field-setup/gateway-setup/networking-info`
  - Configure gateway IP, DNS, network settings
  - Optional step; users can skip to deno-list
  - "Next" button navigates to deno-list

- **Deno List** — `/field-setup/gateway-setup/deno-list`
  - Inventory of all Deno devices (discovered and manual)
  - Table view with status, serial number, signal strength
  - "Discover" button triggers auto-discovery scan
  - "Next" button navigates to live-data

- **Gateway Live Data** — `/field-setup/gateway-setup/gateway-live-data`
  - Real-time data from the gateway
  - Verifies the gateway is responding and sending data
  - "Next" button navigates to setup

- **Setup** — `/field-setup/gateway-setup/setup`
  - Channel configuration and Deno-to-port mapping
  - Associate discovered Denos with physical channels
  - "Next" button navigates to verify-installation

### Step 3: Verification

- **Verify Installation** — `/field-setup/gateway-setup/verify-installation`
  - Final checklist and site creation
  - Confirm all settings and create the site record
  - On success, navigates to site overview

---

## Who can open what

### Frontend guards

- **`/field-setup`** — No route guard; open to all authenticated users
- **`/field-setup/gateway-setup` and sub-routes** — No explicit route guard, but they expect a company assignment (implicit via site selection)

### Backend role control

- **`GET_SITES`** — All authenticated users can query sites in their company
- **`GET_CHANNELS`** — Company-scoped; non-SuperAdmins see only their company's channels
- **`CREATE_CHANNEL` / `UPDATE_CHANNEL`** — `@AllRoles()` but company-scoped in service layer
- **`CREATE_SITE`** — Typically `@Roles(SUPER_ADMIN)` or `@AllRoles()` depending on implementation

---

## How it works {dev}

### Starting the wizard

1. User navigates to `/field-setup`. `FieldSetupIntroPage` renders the intro with three steps and a "START NOW" button. — `denowatts-portal/src/pages/dashboard/field-setup/intro/FieldSetupIntroPage.tsx`
2. Clicking "START NOW" navigates to `/field-setup/gateway-setup`. — `denowatts-portal/src/pages/dashboard/field-setup/intro/components/FieldSetupIntroForm.tsx:83`

### Step 1: Gateway Setup

1. `FieldSetupDashboard` renders. It loads the current site from Redux (`state.header.siteSettings.site`). — `denowatts-portal/src/pages/dashboard/field-setup/overview/components/FieldSetupDashboard.tsx:29-31`
2. The user selects a site (or it defaults to the current site). The form re-fetches channels for that site with `filter: { source: ChannelSource.Gateway }`. — `denowatts-portal/src/pages/dashboard/field-setup/overview/components/FieldSetupDashboard.tsx:93-105`
3. The user either picks an existing gateway from the dropdown or enters a serial number manually. SessionStorage caches the selection. — `denowatts-portal/src/pages/dashboard/field-setup/overview/components/FieldSetupDashboard.tsx:36-51`
4. On form submission, the system queries `GET_CHANNEL` with the serial number to verify the gateway exists. If it exists, navigation proceeds to list-setup; if not, an error toast is shown. — `denowatts-portal/src/pages/dashboard/field-setup/overview/components/FieldSetupDashboard.tsx:112-146`

### Sub-steps: List-Setup, Networking-Info, Deno-List, Live-Data

1. Each sub-step is a page in the same wizard flow. Navigation between them is sequential (forward via "Next", backward via breadcrumbs). — `denowatts-portal/src/router.tsx:309-346`
2. **List-Setup** fetches and displays Deno channels (`source: ChannelSource.Deno`) already linked to the gateway. Users can add or remove Denos. — `denowatts-portal/src/pages/dashboard/field-setup/list-setup/components/GatewayListSetup.tsx`
3. **Networking-Info** is a form where users enter IP, DNS, and gateway settings. This data is saved to the gateway channel's `config` object. — `denowatts-portal/src/pages/dashboard/field-setup/network-settings/components/NetworkSettingsForm.tsx`
4. **Deno-List** shows all Deno devices discovered by the gateway. A "Discover" button triggers an auto-discovery scan (sends a request to the gateway to scan for new Denos). The table shows status (connected, disconnected), signal strength, etc. — `denowatts-portal/src/pages/dashboard/field-setup/deno-list/components/DenoListTable.tsx`
5. **Live-Data** fetches and displays real-time data from the gateway to verify it's responsive. If no recent data exists (last data older than 5 minutes, for example), an error is shown. — `denowatts-portal/src/pages/dashboard/field-setup/live-data/components/LiveDataView.tsx`

### Step 2: Setup (Channel Configuration)

1. `SetupPage` renders the channel config form. It loads the gateway channel and all associated Denos. — `denowatts-portal/src/pages/dashboard/field-setup/setup/components/SetupForm.tsx`
2. The form allows the user to:
   - Name each channel
   - Assign a Deno to a physical port or input (inverter, meter, tracker, etc.)
   - Configure measurement type and polarity (if applicable)
   - Set up any custom parameters
3. On form submission, the channel config is updated via `UPDATE_CHANNEL` mutation. — `denowatts-portal/src/pages/dashboard/field-setup/setup/components/SetupForm.tsx`

### Step 3: Verify Installation

1. `VerifyInstallationPage` renders a final checklist: gateway verified, network configured, Denos assigned, live data confirmed. — `denowatts-portal/src/pages/dashboard/field-setup/verify-installation/VerifyInstallationPage.tsx`
2. The user reviews all settings and clicks "Verify Installation" (or "Create Site"). — `denowatts-portal/src/pages/dashboard/field-setup/verify-installation/components/VerifyInstallationForm.tsx`
3. The backend creates a new site record (or updates an existing one) with a status indicating commissioning in progress. This site becomes visible in the portfolio. — `denowatts-portal/src/pages/dashboard/field-setup/verify-installation/components/VerifyInstallationForm.tsx`
4. On success, the page navigates to the site overview `/site/:siteId`. — `denowatts-portal/src/pages/dashboard/field-setup/verify-installation/components/VerifyInstallationForm.tsx`

---

## Data it touches {dev}

### GraphQL queries

- **`GET_SITES`** — Fetch sites for the site selector
  - Called in FieldSetupDashboard to populate dropdown
  - `denowatts-backend/src/sites/resolvers/sites.resolver.ts`

- **`GET_CHANNELS`** — Fetch channels for a site, filtered by source
  - Called with `filter: { sites: [siteId], source: ChannelSource.Gateway }`
  - Used to populate gateway dropdown and validate selections
  - `denowatts-backend/src/channels/resolvers/channels.resolver.ts`

- **`GET_CHANNEL`** — Fetch a single channel by ID or serial number
  - Called with `filter: { source: ChannelSource.Gateway, serialNumber: ... }`
  - Used to validate gateway exists before proceeding
  - `denowatts-backend/src/channels/resolvers/channels.resolver.ts`

- **`GET_CHANNEL_RAW`** — Fetch raw/unprocessed channel data
  - Called in live-data step to verify gateway is responding
  - Returns recent metrics; if empty, gateway is not communicating
  - `denowatts-backend/src/channels/resolvers/channels.resolver.ts`

### GraphQL mutations

- **`CREATE_CHANNEL` / `UPDATE_CHANNEL`** — Create or update channel records
  - Called to create new Deno channels when discovered
  - Called to update gateway/Deno config (network settings, channel names, assignments)
  - `denowatts-backend/src/channels/resolvers/channels.resolver.ts`

- **`CREATE_SITE` / `UPDATE_SITE`** — Create or update site record
  - Called in verify-installation to finalize site creation
  - Sets initial service status (e.g., COMMISSIONING)
  - `denowatts-backend/src/sites/resolvers/sites.resolver.ts`

### Collections touched

- **`channels` collection** — Gateway and Deno channel records
  - Gateway channel: `source=Gateway`, serial number, config, network settings
  - Deno channels: `source=Deno`, parent reference to gateway, port assignment
  - `denowatts-backend/src/channels/schemas/channel.schema.ts`

- **`sites` collection** — Site record created/updated on verify
  - `denowatts-backend/src/sites/schemas/site.schema.ts`

- **SessionStorage** — Caching selected assets
  - Key: `assets` = `{ site, gateway, serialNumber }`
  - Cleared when session ends

---

## Edge cases & gotchas {dev}

- **Gateway must exist before the wizard can proceed.** If a user enters a serial number that doesn't match any existing gateway channel, the form fails with "Gateway not found". This prevents configuration of non-existent hardware. The user must first create the gateway channel in the backend (usually via a hardware registration process). — `denowatts-portal/src/pages/dashboard/field-setup/overview/components/FieldSetupDashboard.tsx:139`

- **Changing sites mid-wizard resets all selections.** If the user selects a different site in the gateway-setup step, the previously selected gateway and all sub-step data are cleared. This is by design to prevent configuration mismatches, but can be surprising to users. — `denowatts-portal/src/pages/dashboard/field-setup/overview/components/FieldSetupDashboard.tsx:55-68`

- **Live data step fails silently if the gateway has old data.** The live-data view expects data within the last 5 minutes (or similar threshold). If the gateway has not sent data recently, the view shows an error. This is a real-world safety check (if no data, the gateway probably isn't running), but can be confusing if the gateway is powered on but not yet connected to the network. — `denowatts-portal/src/pages/dashboard/field-setup/live-data/components/LiveDataView.tsx`

- **Deno discovery is not automatic.** Users must manually click the "Discover" button to scan for new Deno devices. The system doesn't automatically discover Denos on site load. This prevents unexpected channel creation but requires user action. — `denowatts-portal/src/pages/dashboard/field-setup/deno-list/components/DenoListTable.tsx`

- **The wizard does not enforce channel completeness.** A user can complete the wizard without assigning all Denos to channels or without naming all channels. The verification step doesn't validate these constraints. This allows partial configurations to be saved, which may cause issues downstream (e.g., unnamed channels appearing in analytics). — `denowatts-portal/src/pages/dashboard/field-setup/setup/components/SetupForm.tsx`

- **SessionStorage caching only survives tab closure.** Once the browser tab is closed, the cached assets are lost. If a user navigates away using the browser back button or an external link, the cache may be cleared. This can require the user to restart the wizard. — `denowatts-portal/src/pages/dashboard/field-setup/overview/components/FieldSetupDashboard.tsx:70-77`

- **No undo/rollback once verify is clicked.** Once the user completes the wizard and the site is created, there's no automatic rollback if the user changes their mind. The site record is created in the backend immediately. To undo, the user must manually delete the site or edit it in the Site settings. — `denowatts-portal/src/pages/dashboard/field-setup/verify-installation/components/VerifyInstallationForm.tsx`

- **Channel re-use is possible but not validated.** If a gateway or Deno channel is used in multiple sites (due to a data import or manual editing), the wizard doesn't detect or prevent this. This could lead to data inconsistencies. — (not explicitly handled; backend should validate)

---

**Related flows:** [[site]] (site creation finalizes in field setup), [[portfolio]] (new sites appear in portfolio after field setup), [[status]] (live data verification uses status channels)
