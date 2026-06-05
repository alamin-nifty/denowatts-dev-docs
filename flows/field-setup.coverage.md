# Field Setup — Coverage Tracker

Coverage status for the Field Setup feature documentation (`/field-setup/*` routes).

## Frontend routes & files

All under `denowatts-portal/src/pages/dashboard/field-setup/`:

| Route | Component | Purpose | Entry file | Status |
|-------|-----------|---------|-----------|--------|
| `/field-setup` | FieldSetupIntroPage | Welcome page with 3-step wizard overview | intro/FieldSetupIntroPage.tsx | [x] |
| `/field-setup/gateway-setup` | FieldSetupPage | Gateway selection and serial number validation (Step 1) | overview/FieldSetupPage.tsx | [x] |
| `/field-setup/gateway-setup/list-setup` | ListSetupPage | Deno device list management (Step 1b) | list-setup/ListSetupPage.tsx | [x] |
| `/field-setup/gateway-setup/networking-info` | NetworkSettingsPage | Gateway network configuration | network-settings/NetworkSettingsPage.tsx | [x] |
| `/field-setup/gateway-setup/deno-list` | DenoListPage | Deno device inventory and status | deno-list/DenoListPage.tsx | [x] |
| `/field-setup/gateway-setup/gateway-live-data` | LiveDataPage | Real-time gateway data viewer | live-data/LiveDataPage.tsx | [x] |
| `/field-setup/gateway-setup/setup` | SetupPage | Channel configuration and mapping (Step 2) | setup/SetupPage.tsx | [x] |
| `/field-setup/gateway-setup/verify-installation` | VerifyInstallationPage | Final verification and site go-live (Step 3) | verify-installation/VerifyInstallationPage.tsx | [x] |

## Frontend sub-components

`denowatts-portal/src/pages/dashboard/field-setup/`:

- `intro/components/FieldSetupIntroForm.tsx` — Intro wizard with 3-step overview | [x]
- `overview/components/FieldSetupDashboard.tsx` — Site/gateway selector | [x]
- `list-setup/components/GatewayListSetup.tsx` — Deno list management | [x]
- `network-settings/components/NetworkSettingsForm.tsx` — Network config form | [x]
- `deno-list/components/DenoListTable.tsx` — Deno inventory table | [x]
- `live-data/components/LiveDataView.tsx` — Real-time data display | [x]
- `setup/components/SetupForm.tsx` — Channel config form | [x]
- `verify-installation/components/VerifyInstallationForm.tsx` — Final verification | [x]
- `components/FieldSettings.tsx` — Settings panel | [x]
- `components/VerifyInstallationModal.tsx` — Verification modal | [x]
- `components/ImageUpload.tsx` — Image upload utility | [x]
- `components/LiveDataModal.tsx` — Live data modal | [x]

## Backend APIs

`denowatts-backend/src/`:

- **channels/resolvers/channels.resolver.ts** — Query/mutation handlers
  - `GET_CHANNELS` — Fetch channels for site
  - `GET_CHANNEL` — Fetch single channel by ID
  - `GET_CHANNEL_RAW` — Fetch raw channel data
  - `CREATE_CHANNEL` / `UPDATE_CHANNEL` — Create/edit channels
  - Source filter: `ChannelSource.Gateway`, `ChannelSource.Deno`

- **channels/services/channels.service.ts** — Business logic
  - Channel CRUD, validation
  - Gateway/Deno channel creation
  - Network configuration

- **channels/schemas/** — Data models
  - `channel.schema.ts` — Channel document
  - `gateway-channel-config.schema.ts` — Gateway config

- **sites/resolvers/sites.resolver.ts** — Site queries

## State management

- Redux: site selection persisted in `state.header.siteSettings`
- SessionStorage: selected assets (site, gateway, serial number) — `assets` key

## Data structures

- **Gateway channel** — Special channel with `source: ChannelSource.Gateway`, serial number, configuration
- **Deno channels** — Child channels under gateway, `source: ChannelSource.Deno`
- **Network config** — IP, DNS, gateway settings stored on gateway channel

## Coverage checklist

- [x] 8 main routes (intro, gateway-setup, list-setup, networking-info, deno-list, live-data, setup, verify-installation)
- [x] 3-step wizard flow and navigation
- [x] Site and gateway selection
- [x] Channel CRUD operations
- [x] Network configuration
- [x] Live data fetching
- [x] Final verification
- [x] Backend API integration
- [x] State persistence (Redux + sessionStorage)
- [x] Error handling and validation

## Notes

- **No dedicated field-setup module in backend** — Uses channels and sites modules
- **3-step wizard** — Intro → Gateway Setup (with sub-steps) → Setup → Verify
- **SessionStorage caching** — Selected assets cached to survive navigation
- **Source filtering** — Channels filtered by ChannelSource (Gateway vs Deno)
- **Sub-steps within Step 1** — List-setup, Networking-info, Deno-list, Live-data are all part of gateway setup
