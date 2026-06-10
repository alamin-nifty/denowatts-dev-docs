---
title: Channels
owner: alamin-nifty
status: draft
version: 2
updated_at: 2026-06-10
---

# Channels

A **channel** is a single data stream coming from a piece of hardware at a solar site — one irradiance sensor, one gateway, one inverter or meter read over Modbus, one cellular modem. Every measurement the platform stores, charts, alarms on, or reports flows in through a channel. They're the wiring between the physical plant and everything else in the product.

> **Reading this doc:** use the **Business / Developer** switch at the top. *Business* explains what channels are, the kinds, and how they're used. *Developer* adds the full GraphQL surface, the services and aggregation pipelines, every schema and config shape, the Lattigo/Modbus internals, file references, and a solar-terminology primer.

---

## Why this matters

If a channel is misconfigured or offline, everything downstream is wrong — the chart is blank, the alarm never fires, the report under-counts. Channels are where data quality is won or lost, so the module carries a lot of responsibility: it tracks whether each stream is connected, counts its alarms, places it on the site map, holds its installation photos, and can even diagnose inverter faults in plain language. Getting channels right is the difference between a site you can trust and one you can't.

---

## The kinds of channel

Hardware comes in several flavors, and each is a channel "source":

- **Deno sensor** — a wireless Denowatts reference sensor measuring irradiance and temperature.
- **Gateway** — the on-site data box (Denobox) that collects readings and sends them up.
- **Modbus device** — an inverter, meter, or other device read over the Modbus protocol (serial or TCP), using a reusable register-map template.
- **OPC source** — a device read over OPC-UA, by tag name.
- **Cellular modem** — the SIM/modem that backhauls a gateway's data over cellular (managed through the Lattigo provider).
- **Weather API** — an external weather-data feed (auto-created with every new site).
- *(Legacy Modbus — an older variant kept only for backward compatibility.)*

Each channel carries a structured **id** (a dotted code like `1.1.1.47`) whose prefix tells the platform what kind of device it is and which "key metric" headlines it.

---

## What channels do across the platform

Beyond just carrying data, a channel record drives several features:

- **Status** — whether it's active and currently connected (the green/red dots on the Status dashboard). See [[status]].
- **Alarms** — how many alarm events are open against it, and how many fired in the last 30 days. See [[alarm-config]].
- **Site map** — its physical position/zone in the visual site layout, set by the Site Builder. See [[site-builder]].
- **Photos & notes** — installation photos and notes captured during Field Setup. See [[field-setup]].
- **Fault diagnosis** — for inverters, an on-demand check that pulls fault codes and explains them in plain English (AI-generated). See [[tests]].

---

## Modbus templates — the device library

Inverters and meters from different manufacturers expose their data at different register addresses. Rather than re-enter that mapping for every site, the platform keeps a shared library of **Modbus templates** — one reusable register map per device model. When you add a Modbus channel you pick its template, and the channel inherits the right mapping. Templates are managed centrally (admin-only) and the library tracks how many sites use each one. See [[settings]].

---

## Cellular modems (Lattigo)

Sites without wired internet backhaul their data over cellular SIMs, managed through a provider called **Lattigo**. The platform can show each SIM's live state and data usage, and admins can **suspend or restore** SIMs (e.g. to manage a plan or stop a runaway). A fleet-wide usage dashboard rolls up data consumption per site. See [[settings]].

---

## Who can do what

- **Any signed-in user** can view channels for their own company's sites (scoped on the server).
- **Admins and SUPER_ADMINs** can deploy the site map and manage cellular SIMs.
- **SUPER_ADMINs only** manage the Modbus template library and the fleet-wide cellular usage view.

---

## The rules that matter

- **A channel's config must match its kind** — a Deno channel needs Deno config, a Modbus channel needs Modbus config; a mismatch is rejected.
- **A device serial can belong to only one channel** — the same physical asset can't be wired to two channels.
- **A Deno's orientation changes its identity** — pointing it at the horizontal vs the array changes its id prefix (and therefore how it's interpreted).
- **Deploying the site map is a full replace** — channels not placed in the current layout lose their map position.
- **Cellular state and usage are cached for a few minutes** — a SIM suspend/restore may take up to ~5 minutes to show in the usage view.
- **Installation photos are stored privately** and shown via short-lived secure links.

---

## Entry points {dev}
- Channel configuration tab: `denowatts-portal/src/pages/dashboard/site/channel-configuration/ChannelConfigurationPage.tsx` — route `/site/:siteId/channels`
- Channel map tab: `denowatts-portal/src/pages/dashboard/site/channel-map/ChannelMapPage.tsx` — route `/site/:siteId/channel-map`
- Channel status: `denowatts-portal/src/pages/dashboard/status/channel-status/ChannelStatusPage.tsx` — route `/status/channel`
- Modbus Template settings: `denowatts-portal/src/pages/dashboard/settings/modbus-template/ModbusTemplatePage.tsx`
- Cell Modem Management (SuperAdmin): `denowatts-portal/src/pages/dashboard/settings/cell-modem-management/CellModemManagementPage.tsx`

---

## Channel types (reference) {dev}

Six `ChannelSource` enum values are defined in `denowatts-backend/src/channels/schemas/channel.schema.ts`:

| Source | Config class | channelId prefix | Purpose |
|---|---|---|---|
| `DENO` | `DenoChannelConfig` | `1.1.1.N` (POA/SOILING) or `1.1.2.N` (GHI) | Wireless irradiance/temperature sensor (Denobox) |
| `GATEWAY` | `GatewayChannelConfig` | `7.3.1.N` | DenoWatts data acquisition gateway |
| `MODBUS` | `ModbusChannelConfig` | From template `prefix` field + `.N` | Modbus device (inverter, meter, etc.) — read via RS-485 or TCP |
| `OPC` | `OPCChannelConfig` | From template `prefix` field + `.N` | OPC-UA data source |
| `MODEM` | `ModemChannelConfig` | _(no channelId assigned)_ | Cellular modem (Lattigo-managed SIM card) |
| `API` | `APIChannelConfig` | `1.3.2.N` (when `isWeatherAPI=true` flag passed to `create`) | External weather API credential channel |
| `MODBUS_LEGACY` | `ModbusLegacyChannelConfig` | _(enum value only, no config)_ | Legacy Modbus, no active schema beyond enum |

The `channelId` is a dot-notation hierarchy string. The first 5 characters (e.g., `1.1.1`) are matched against the `devicetypes` collection to resolve the device type name and key metric. The full ID format is `{5-char-prefix}.{channel.number}` where `number` is a global auto-increment across all channels.

---

## GraphQL API surface {dev}

### Queries

#### `channels(filter: FilterChannelsInput!): [ChannelResponse!]`
Returns all channels matching the filter, with aggregated alarm counts, asset info, aux pyranometer info, radio MAC, metric unit, and sorted by device type priority then natural name order.
- **Input fields** (`FilterChannelsInput`): `site` (ID), `sites` ([ID]), `source` (ChannelSource), `status` (ChannelStatus), `gateway` (ID)
- **Returns** (`ChannelResponse` extends `Channel`): all `Channel` fields plus `openAlarms: Number`, `totalAlarms: Number`, `totalCopiedChannels: Number`, `assetInfo: Asset`, `auxPyranometerAssetInfo: Asset`, `unit: String`
- Resolver: `denowatts-backend/src/channels/resolvers/channels.resolver.ts:30`

#### `channel(filter: FilterChannelInput!): Channel`
Returns a single channel by any of its scalar fields (or `serialNumber` for a case-insensitive config lookup).
- **Input fields** (`FilterChannelInput`): all `Channel` scalar fields (partial), plus `serialNumber: String`
- **Returns**: `Channel` with pre-signed download URLs substituted into `images` fields
- Resolver: `denowatts-backend/src/channels/resolvers/channels.resolver.ts:35`

#### `channelFaults(filter: ChannelFaultsFilterInput!): [ChannelFaultResponse!]`
Fetches inverter fault/alarm codes from the external Python matrix service, then uses OpenAI to generate human-readable descriptions for each fault code.
- **Input fields** (`ChannelFaultsFilterInput`): `site: ID!`, `channels: [String!]!`, `start: String!` (ISO date), `end: String!` (ISO date)
- **Returns** (`ChannelFaultResponse`): `code: String`, `title: String`, `description: String`, `explanation: String`, `troubleshootingSteps: [String!]`
- Resolver: `denowatts-backend/src/channels/resolvers/channels.resolver.ts:64`

#### `opcTags(filter: FilterOpcTagsInput!): [OpcTag!]`
Returns OPC tags from the `opctags` collection, filtered by prefix (and optional suffix) pattern match and optional site.
- **Input fields** (`FilterOpcTagsInput`): `opcPrefix: String!`, `opcSuffix: String`, `site: ID`
- **Returns** (`OpcTag`): `_id`, `name`, `site`, `namespace`, `nodeId`, `dataType`, `createdAt`, `updatedAt`
- Resolver: `denowatts-backend/src/channels/resolvers/channels.resolver.ts:69`

#### `lattigoDevice(iccid: String!): LattigoDevice`
Gets current SIM/modem info from the Lattigo API for a single device by ICCID. Requires `ADMIN` or `SUPER_ADMIN` role.
- **Returns** (`LattigoDevice`): `deviceName`, `state`, `connected`, `lastConnectionDate`, `bytesUsed`, `smsUsed`, `contractEndDate`, `iccid`, `imei`, `ratePlan { name, uuid }`
- Resolver: `denowatts-backend/src/channels/resolvers/lattigo.resolver.ts:21`

#### `lattigoUsageAnalytics(input: LattigoUsageAnalyticsInput!): LattigoUsageAnalyticsResult`
Paginated cellular data usage per device, joined with DenoWatts site and modem names from the DB. Requires `SUPER_ADMIN` role.
- **Input fields** (`LattigoUsageAnalyticsInput`): `page: Int` (default 1), `pageSize: Int` (default 20, max 100), `startDate: DateTime`, `endDate: DateTime`, `sortBy: LattigoUsageAnalyticsSortBy`, `sortDirection: LattigoUsageAnalyticsSortDirection`, `searchText: String`
- **Returns** (`LattigoUsageAnalyticsResult`): `items: [LattigoUsageSite!]`, `total: Int`, `page: Int`, `pageSize: Int`
  - `LattigoUsageSite`: `siteName`, `siteId`, `iccid`, `modemName`, `totalBytes: Float`, `daysWithData: Int`, `state`
- Resolver: `denowatts-backend/src/channels/resolvers/lattigo.resolver.ts:26`

### Mutations

#### `createChannel(createChannelInput: CreateChannelInput!): Channel`
Creates a new channel record with auto-incremented `number` and computed `channelId`.
- **Input** (`CreateChannelInput`): all `Channel` scalar fields except `_id`, `channelId`, `number`, `config`; plus `site: ID!` (required), `source: ChannelSource!` (required), `config: CreateChannelConfigInput` (optional, contains one of `gatewayConfig`, `denoConfig`, `modbusConfig`, `modemConfig`, `opcConfig`)
- Resolver: `denowatts-backend/src/channels/resolvers/channels.resolver.ts:26`

#### `updateChannel(updateChannelInput: UpdateChannelInput!): Channel`
Updates a single channel by `_id`. Config is merged (not replaced). `channelId` may be recomputed based on source-specific rules.
- **Input** (`UpdateChannelInput`): all `Channel` fields (partial) plus `_id: ID!` (required), `config: UpdateChannelConfigInput` (optional), `unit: String`
- Resolver: `denowatts-backend/src/channels/resolvers/channels.resolver.ts:41`

#### `removeChannel(id: ID!): Channel`
Deletes a single channel by `_id`.
- Resolver: `denowatts-backend/src/channels/resolvers/channels.resolver.ts:48`

#### `bulkUpdateChannels(bulkUpdateChannelInput: BulkUpdateChannelInput!): String`
Bulk-updates multiple channels in a single MongoDB `bulkWrite`. All referenced channels, sites, and templates are pre-fetched in batch to avoid N+1 queries. Returns `"Bulk update successful"`.
- **Input** (`BulkUpdateChannelInput`): `channels: [UpdateChannelInput!]!` (non-empty array required)
- Resolver: `denowatts-backend/src/channels/resolvers/channels.resolver.ts:54`

#### `configChannelSiteMap(configChannelSiteMapInput: ConfigChannelSiteMapInput!): String`
Reads the site builder flow nodes for the given site, maps each channel to its `{ region, testPoint, device }` from the node graph, writes those as `siteMap` on each channel document, clears `siteMap` on channels not in the graph, and snapshots the deployed flow into the site-builder record. Restricted to `SUPER_ADMIN` and `ADMIN` roles. Returns `"Deploy workflow successfully!"`.
- **Input** (`ConfigChannelSiteMapInput`): `site: ID!`
- Resolver: `denowatts-backend/src/channels/resolvers/channels.resolver.ts:60`

#### `changeLattigoSimState(input: ChangeSimStateInput!): ChangeSimStateResult`
Suspends or restores one or more SIMs in Lattigo via a `PUT /v2/device_operations/change_simstate` call. Requires `ADMIN` or `SUPER_ADMIN` role.
- **Input** (`ChangeSimStateInput`): `iccids: [String!]!` (non-empty), `action: LattigoSimAction` (enum: `suspend` | `restore`)
- **Returns** (`ChangeSimStateResult`): `results: [ChangeSimStateItem!]` where each item has `iccid: String`, `success: Boolean`, `message: String`
- Resolver: `denowatts-backend/src/channels/resolvers/lattigo.resolver.ts:39`

#### `createModbusTemplate(createModbusTemplateInput: CreateModbusTemplateInput!): ModbusTemplate`
Creates a new Modbus/OPC device template. Restricted to `SUPER_ADMIN`.
- **Input** (`CreateModbusTemplateInput`): all `ModbusTemplate` fields except `_id` and `createdBy` — `name`, `manufacturer`, `model`, `prefix`, `endian`, `notes`, `metrics`, `isBulkZones`, `bulkZonesJump`
- Resolver: `denowatts-backend/src/channels/resolvers/modbus-template.resolver.ts:25`

#### `updateModbusTemplate(updateModbusTemplateInput: UpdateModbusTemplateInput!): ModbusTemplate`
Updates a template by `_id`. Restricted to `SUPER_ADMIN`.
- **Input** (`UpdateModbusTemplateInput`): `_id: String!` plus all `CreateModbusTemplateInput` fields (partial)
- Resolver: `denowatts-backend/src/channels/resolvers/modbus-template.resolver.ts:57`

#### `removeModbusTemplate(id: ID!): ModbusTemplate`
Deletes a template by `_id`. Restricted to `SUPER_ADMIN`.
- Resolver: `denowatts-backend/src/channels/resolvers/modbus-template.resolver.ts:68`

#### `bulkUpdateModbusTemplates(bulkUpdateModbusTemplateInput: BulkUpdateModbusTemplateInput!): String`
Bulk-updates multiple templates in a single `bulkWrite`. Validates that all provided `_id` values exist first. Restricted to `SUPER_ADMIN`. Returns `"Modbus Template bulk update successful"`.
- **Input** (`BulkUpdateModbusTemplateInput`): `modbusTemplates: [UpdateModbusTemplateInput!]!` (non-empty)
- Resolver: `denowatts-backend/src/channels/resolvers/modbus-template.resolver.ts:79`

### Modbus Template Queries

#### `modbusTemplates(filter?: FilterModbusTemplateInput): [ModbusTemplateWithPopulatedObject!]`
Returns all templates (or filtered subset). Available to all authenticated roles (`@AllRoles()`). Each result includes `totalUsageCount` (number of channels using this template across non-deleted sites) and `createdBy` populated with `{ _id, firstName, lastName }`.
- **Input** (`FilterModbusTemplateInput`): `_id`, `name`, `manufacturer`, `model`, `prefix` (all partial/optional)
- Resolver: `denowatts-backend/src/channels/resolvers/modbus-template.resolver.ts:34`

#### `modbusTemplate(filter: FilterModbusTemplateInput!): ModbusTemplate`
Returns a single template by any partial field match.
- Resolver: `denowatts-backend/src/channels/resolvers/modbus-template.resolver.ts:47`

#### `modbusManufacturers(): [ModbusManufacturerObject!]`
Returns a grouped list of all manufacturers with their associated model names. Restricted to `SUPER_ADMIN`.
- **Returns** (`ModbusManufacturerObject`): `name: String`, `models: [String!]`
- Resolver: `denowatts-backend/src/channels/resolvers/modbus-template.resolver.ts:73`

#### `templateSites(template: ID!): [TemplateSites!]`
Returns all non-deleted sites that use a given template, with usage counts. Restricted to `SUPER_ADMIN`.
- **Returns** (`TemplateSites`): `templateId`, `templateName`, `site`, `siteName`, `templateUsageCount: Number`
- Resolver: `denowatts-backend/src/channels/resolvers/modbus-template.resolver.ts:85`

---

## Services {dev}

### ChannelsService — `denowatts-backend/src/channels/services/channels.service.ts`

#### `create(createChannelInput, isWeatherAPI = false)`
1. Validates that `createChannelInput.site` exists via `SitesService.findOne()`. Throws `BadRequestException("Invalid site")` if not found.
2. Extracts `config` from the typed union (`createChannelInput.config.denoConfig|modbusConfig|modemConfig|opcConfig`), throwing `BadRequestException("Invalid config")` if the expected sub-config key is absent for the declared source. No gatewayConfig is handled in create (only in update/bulk).
3. If source is `DENO` and a `gateway` string is provided in `denoConfig`, converts it to `Types.ObjectId`.
4. Determines `channelId` prefix:
   - `GATEWAY` → `"7.3.1"`
   - `DENO` → `"1.1.1"` (orientation-specific re-assignment happens in `update`, not create)
   - `MODBUS` with a template `_id` → looks up `ModbusTemplate.prefix` via `ModbusTemplateService.findOne()`
   - `OPC` with a template `_id` → same lookup
   - `isWeatherAPI=true` overrides to `"1.3.2"` regardless of source
5. Finds the highest existing `channel.number` via `findOne().sort({ number: -1 })` and sets `nextNumber = lastChannel.number + 1` (or 1 if none exist). This is a global counter across all channels in the system, not per-site.
6. Final `channelId` = `{prefix}.{nextNumber}` (e.g., `"1.1.1.47"`).
7. Writes to `channels` collection via `channelModel.create()` with `config: { type: source, ...config }`.
- DB writes: `channels` (insert)
- DB reads: `sites`, `channels` (for max number), `modbustemplates` (if Modbus/OPC with template)

#### `findAll(filter: FilterChannelsInput, user?: User)`
1. If a non-SuperAdmin user has no `company`, throws `ForbiddenException("User is not associated with a company")`.
2. Builds a MongoDB `$match` query from filter. `gateway` filter is remapped to `config.gateway` as ObjectId. `sites` array is remapped to a `{ $in: [...] }` on the `site` field.
3. Runs a 10-stage aggregation pipeline on the `channels` collection:
   - `$match` — applies the filter
   - `$lookup` `assets` — joins by `config.serialNumber = asset.serialNumber AND source = asset.type` → `assetInfo`
   - `$unwind assetInfo` (preserveNullAndEmptyArrays)
   - `$lookup` `assets` for aux pyranometer — `config.auxPyranometer.serialNumber = asset.serialNumber AND asset.type = AUX_PYRANOMETER` → `auxPyranometerAssetInfo`
   - `$unwind auxPyranometerAssetInfo` (preserveNullAndEmptyArrays)
   - `$lookup` `assets` — `assetInfo.radio = asset._id` → `radioInfo`
   - `$unwind radioInfo` (preserveNullAndEmptyArrays)
   - `$addFields` — ensures `config` is at least `{ type: source }` if null
   - `$lookup` `events` (open alarms) — `channel = channelId AND isAlarm = true AND endDate not set` → `alarms`
   - `$lookup` `events` (30-day alarms) — `channel = channelId AND isAlarm = true AND startDate >= now-30days` → `totalAlarms`
   - `$lookup` `devicetypes` — matches first 5 chars of `channelId` against `deviceType.prefix` → `deviceType`
   - `$lookup` `metrics` — `deviceType.keyMetric = metric.name` → `metric`
   - `$addFields` — computes `openAlarms` (size of alarms array), `totalAlarms` (size), `unit` (from metric.unit)
   - `$addFields` — computes `deviceTypeOrder` (integer 1–13) from `channelId` prefix rules, and natural-sort helper fields `nickAlpha`, `nickNum`
   - `$sort` by `deviceTypeOrder ASC, nickAlpha ASC, nickNum ASC, nick ASC, number ASC`
   - `$project` — removes helper fields
4. Post-aggregation in JavaScript: performs a secondary multi-factor natural sort on the result array (device type order → base name prefix grouping → letter-before-number → letter chunk → dash-before-dot → numeric tokens → locale).
5. Post-processing per channel:
   - Copies `radioInfo.macAddress` onto `config.macAddress` (overlays the stored value)
   - Replaces all `images.*` values with pre-signed S3 download URLs via `StorageService.getDownloadUrl()` with path `denobox/{siteId}/Photos/{key}`
   - Replaces `assetInfo.calibrations[*].certificate` with pre-signed S3 URLs via `StorageService.getDownloadUrl()` with path `assets/{assetId}/{certificate}`
   - Same for `auxPyranometerAssetInfo.calibrations`
- DB reads: `channels`, `assets` (3x), `events` (2x), `devicetypes`, `metrics`
- External: `StorageService` (AWS S3 pre-signed URLs)

#### `findOne(filter: FilterChannelInput)`
1. Builds query from filter. If `filter.serialNumber` is present, remaps to `{ "config.serialNumber": new RegExp(serialNumber, "i") }` and removes the `serialNumber` key from the plain query.
2. Calls `channelModel.findOne(query)`.
3. If channel has non-empty `images`, iterates all image keys and replaces values with pre-signed S3 URLs at `denobox/{channel.site}/Photos/{key}`.
- DB reads: `channels`
- External: `StorageService`

#### `update(id, updateChannelInput)`
1. If `updateChannelInput.site` is given, validates it via `SitesService.findOne()`.
2. Loads the existing channel by `_id`. Throws `BadRequestException("Invalid channel")` if not found.
3. Extracts `config` from the union field (same switch on `channel.source` as in `create`, plus `GATEWAY` → `gatewayConfig`). Also converts `denoConfig.gateway` string to ObjectId if present.
4. Recomputes `channelId`:
   - `DENO`: if `orientation` is present in update, sets prefix to `"1.1.2"` (GHI) or `"1.1.1"` (POA/SOILING) + `.` + `channel.number`
   - `MODBUS`: if template `_id` changes, looks up the template and sets `{template.prefix}.{channel.number}`; also replaces `updateChannelInput.config.modbusConfig.template._id` with the ObjectId from the found template
   - `OPC`: same as MODBUS
5. Merges `images` (existing merged with update) and `config` (existing merged with new partial config).
6. Calls `channelModel.findByIdAndUpdate(id, payload, { new: true, runValidators: true, context: "query" })`.
7. On MongoDB error code `11000` (duplicate key): if the key path contains `"serialNumber"`, returns `"Serial number already assigned to another channel."`; otherwise returns `"{key} already exists."`.
- DB reads: `sites`, `channels`, `modbustemplates`
- DB writes: `channels`

#### `remove(id)`
Calls `channelModel.findByIdAndDelete(id)`. Throws `BadRequestException("Channel not found!")` if the document did not exist.
- DB writes: `channels`

#### `bulkUpdate(bulkUpdateChannelInput)`
Batch-optimized version of `update` for multiple channels:
1. Fetches all referenced channels in one query (`$in` on IDs).
2. Fetches all referenced sites in one query.
3. Fetches all referenced templates (Modbus + OPC) in one query.
4. Iterates each input, validates site/channel existence, extracts config (same switch logic), recomputes `channelId`, and pushes a `{ updateOne: { filter, update } }` entry into `bulkUpdatePayload`.
5. Calls `channelModel.bulkWrite(bulkUpdatePayload)`.
6. Returns `"Bulk update successful"`.
- DB reads: `channels` (1 query), `sites` (1 query), `modbustemplates` (1 query)
- DB writes: `channels` (single bulkWrite)

#### `configChannelSiteMap(input: ConfigChannelSiteMapInput)`
Deploys the site-builder node graph as `siteMap` data on channels:
1. Fetches the site-builder record via `SiteBuilderService.findBySiteId(input.site)`. Throws if no flow nodes found.
2. Iterates all nodes and their `channels` arrays to build a `Map<channelId, { region, testPoint, device }>`. Invalid ObjectIds are skipped.
3. If the map is empty (no channels in graph), sets `siteMap = null` on all channels for that site and returns early.
4. Runs a `bulkWrite` to set `siteMap` on all mapped channels.
5. Runs `updateMany` to set `siteMap = null` on all channels for that site NOT in the mapped set.
6. Serializes the current flow to a `SiteBuilderFlowDataInput` shape (resolving ObjectId references) and calls `SiteBuilderService.update()` to persist `lastDeployData` and `lastDeployAt = new Date()`.
- DB reads: `sitebuilders`
- DB writes: `channels` (bulkWrite + updateMany), `sitebuilders`

#### `getChannelFaults(filter: ChannelFaultsFilterInput)`
1. Reads `CAPACITY_TEST_PYTHON_SECRET` env var. Throws if not configured.
2. Fetches the site via `SitesService.findOne()` to retrieve the inverter manufacturer and model from `site.blocks[0].inverter`.
3. Makes `POST https://matrix.denowatts.com/data/faults` with `{ site_id, channel, start, end, python_secret }`.
4. Iterates the response `Record<string, string[]>` (fault metric → fault code array). For each fault code calls `openAIService.generateChannelStatusDescription(inverter, faultMetric, faultCode)`.
5. Returns the array of `ChannelFaultResponse` objects produced by OpenAI.
6. On Axios error, throws `BadRequestException` with the upstream message or `"Failed to fetch channel faults"`.
- DB reads: `sites`
- External: `matrix.denowatts.com/data/faults` (Python analytics service), OpenAI API

#### `getOpcTags(filter: FilterOpcTagsInput)`
Queries the `opctags` collection. If `filter.site` is present, adds a site filter. Builds a case-insensitive regex on `name`:
- With `opcSuffix`: `^{opcPrefix}_{opcSuffix}`
- Without: `^{opcPrefix}`
Returns the matching `OpcTag` documents.
- DB reads: `opctags`

#### Private helpers

**`resolveImageUrl(siteId, keyOrKeys)`** — Generates pre-signed S3 download URLs for image keys under `denobox/{siteId}/Photos/{key}`. Supports both single and batch (array) inputs. `denowatts-backend/src/channels/services/channels.service.ts:153`

**`serializeSiteBuilderFlowForDeploy(flow)`** — Converts populated channel references (ObjectId, plain object with `_id`, or string) to clean `{ channel: ObjectId, testPoint: boolean }` entries, filtering out any that fail `Types.ObjectId.isValid()`. Used before persisting `lastDeployData`. `denowatts-backend/src/channels/services/channels.service.ts:77`

---

### LattigoService — `denowatts-backend/src/channels/services/lattigo.service.ts`

#### Constructor
Reads `LATTIGO_KEY_NAME` and `LATTIGO_API_KEY` env vars (throws if absent) and constructs a single Base64-encoded Basic Auth header stored in `this.authHeader`. This header is reused for all requests to `https://api.lattigo.com`.

#### `getDevice(iccid: string): Promise<LattigoDevice>`
1. Calls `GET /v2/devices/{encodeURIComponent(iccid)}` on Lattigo API.
2. Handles both bare `LattigoApiDevice` and `{ device: LattigoApiDevice }` response shapes.
3. Maps to `LattigoDevice` via `toLattigoDevice()`.
- External: Lattigo API

#### `changeSimState(input: ChangeSimStateInput): Promise<ChangeSimStateResult>`
1. Constructs `{ device_names: input.iccids, state: "suspend"|"restore" }`.
2. Calls `PUT /v2/device_operations/change_simstate`.
3. Maps `response.change_status` (a per-ICCID dict) back to an array of `ChangeSimStateItem`, where `success = (message === "Success")`.
- External: Lattigo API

#### `getUsageAnalytics(input): Promise<LattigoUsageAnalyticsResult>`
1. Clamps `page >= 1` and `pageSize` in `[1, 100]`.
2. Fetches `siteMap` (ICCID → site name) and `allDevices` in parallel via `buildIccidToSiteMap()` and `getCachedDeviceList()`.
3. Filters by `searchText` (all search terms must match a haystack of `siteName + iccid + modemName + state`, case-insensitive).
4. Sorts the full filtered set by the requested `sortBy` field.
5. Slices the current page.
6. **Without date range**: returns rows with `totalBytes = device.bytes_used` (lifetime, from Lattigo device list). Fast: 1 Lattigo call total.
7. **With date range**: for each row on the current page (~20 rows), calls `fetchDailyUsages(iccid, startDate, endDate)` to get per-day byte counts from `GET /v2/devices/{iccid}/daily_data_usages`. Re-sorts the page by `totalBytes` or `daysWithData` after fetching.
8. Returns `{ items, total, page, pageSize }`.
- External: Lattigo API (1 device-list call + up to 20 per-device calls if date range used)
- Cache: Redis (`lattigo:device_list` TTL 5 min; per-device daily usage keyed by `lattigo:daily_usage:{iccid}:{start}:{end}` TTL 5 min)

#### Private `getCachedDeviceList()`
Checks Redis key `lattigo:device_list`. On miss, calls `GET /v2/devices?details=true` and caches the result for 300 seconds. Handles both raw array and `{ devices: [...] }` response shapes.
- Cache: Redis

#### Private `buildIccidToSiteMap()`
Runs a MongoDB aggregation on the `assets` collection to produce a `Map<ICCID, { siteName, siteId, modemName }>`:
1. `$match`: `type = MODEM AND simIccid != null AND deletedAt = null`
2. `$lookup` `channels` where `config.serialNumber = asset.serialNumber AND source = asset.type`
3. `$lookup` `sites` via `channel.site`
4. `$project`: `simIccid`, `site.name`, `site._id`, modem name from `channel.config.name` or `channel.name`
- DB reads: `assets`, `channels`, `sites`

#### Private `fetchDailyUsages(iccid, startDate?, endDate?)`
Checks Redis for a cached response keyed by ICCID + date range ISO strings. On miss, calls `GET /v2/devices/{iccid}/daily_data_usages?start_date=...&end_date=...`. Caches result for 300 seconds. Returns empty array on error (logs warning, does not throw).
- External: Lattigo API
- Cache: Redis

#### Private `toLattigoDevice(device)`
Maps raw Lattigo API response object to `LattigoDevice` GraphQL type. Parses `connected` field as boolean (handles both boolean and string `"true"`/`"false"`). Falls back `iccid = device.iccid ?? device.device_name`.

---

### ModbusTemplateService — `denowatts-backend/src/channels/services/modbus-template.service.ts`

#### `create(createModbusTemplateInput, createdBy: User)`
1. Checks for an existing template with the same `{ manufacturer, model, name }` combination. Throws `BadRequestException("Template already exists, template name and model must be unique under same manufacturer")` if duplicate found.
2. Creates the template with `createdBy: createdBy._id`.
- DB reads: `modbustemplates` (exists check)
- DB writes: `modbustemplates`

#### `findAll(filter: Partial<ModbusTemplate>)`
Runs an aggregation with:
1. `$match` — applies filter (name is a case-insensitive regex).
2. `$lookup` `channels` — counts channels using this template (via `config.template._id`), filtered to channels belonging to non-deleted sites. Result: `totalUsageCount`.
3. `$lookup` `users` — populates `createdBy` with user document.
4. `$sort` by `manufacturer ASC, model ASC`.
- DB reads: `modbustemplates`, `channels`, `sites`, `users`

#### `findOne(filter: Partial<ModbusTemplate>)`
Simple `findOne(filter)` on the template model.

#### `findByIds(ids: Types.ObjectId[])`
Batch-fetches templates by `_id $in` array. Used by `ChannelsService.bulkUpdate()`.

#### `update(id, updateModbusTemplateInput)`
1. Checks for duplicate with same `{ manufacturer, model, name }` excluding the current `_id`. Throws on duplicate.
2. Calls `findByIdAndUpdate(id, updateModbusTemplateInput, { new: true })`.
- DB reads: `modbustemplates` (duplicate check)
- DB writes: `modbustemplates`

#### `remove(id)`
Calls `findByIdAndDelete(id)`.

#### `modbusManufacturers()`
Aggregation: `$group` by `manufacturer`, `$addToSet` models. Returns `[{ name, models }]`.

#### `bulkUpdate(input: BulkUpdateModbusTemplateInput)`
1. Counts matching documents for all input IDs. Throws `BadRequestException("Template not found")` if count doesn't match.
2. Runs `bulkWrite` with `updateOne` per template.
3. Returns `"Modbus Template bulk update successful"`.

#### `templateSites(template: Types.ObjectId)`
Aggregation starting from the template:
1. `$match` template by `_id`.
2. `$lookup` all channels where `config.template._id = templateId`.
3. `$lookup` sites from channel.site.
4. Filters to non-deleted sites.
5. `$group` by site, counting occurrences (`templateUsageCount`).
6. `$sort` by `templateUsageCount DESC`.
Returns `[{ templateId, templateName, site, siteName, templateUsageCount }]`.
- DB reads: `modbustemplates`, `channels`, `sites`

---

## Schemas {dev}

### Channel — `denowatts-backend/src/channels/schemas/channel.schema.ts`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `_id` | ObjectId | auto | — | |
| `number` | Number | Yes | — | Unique, global auto-increment across ALL channels |
| `channelId` | String | No | — | Unique when present; partial unique index (`$exists: true, $type: "string"`) |
| `site` | ObjectId → Site | Yes | — | |
| `blocks` | [Number] | No | — | Array of block numbers this channel belongs to |
| `siteMap` | ChannelSiteMap | No | — | `{ region?, testPoint?, device? }` — set by `configChannelSiteMap` |
| `name` | String | No | — | Human-readable display name |
| `source` | ChannelSource enum | Yes | — | `GATEWAY|DENO|MODBUS|API|MODBUS_LEGACY|MODEM|OPC` |
| `location` | ChannelLocation | No | — | `{ latitude, longitude, altitude }` |
| `status` | ChannelStatus enum | Yes | `INACTIVE` | `ACTIVE|INACTIVE` |
| `connectionStatus` | ChannelConnectionStatus enum | No | `DISCONNECTED` | `CONNECTED|DISCONNECTED` |
| `remoteManagementServiceStatus` | ChannelRemoteManagementServiceStatus enum | No | `DISCONNECTED` | `CONNECTED|DISCONNECTED` |
| `lastReportedAt` | Date | No | — | |
| `config` | Mixed (ChannelConfigUnion) | No | — | Source-specific config object; type discriminated by `config.type` |
| `images` | ChannelImages | No | — | Object of 20 named photo slots, values are stored as S3 keys (resolved to URLs on read) |
| `notes` | String | No | — | |
| `keyMetric` | Float | No | — | Latest value of the key metric for this channel |
| `writeConfigMessages` | String | No | — | |
| `lastConnectedAt` | Date | No | — | |

**MongoDB indexes on `channels` collection:**
- `{ "config.auxPyranometer.serialNumber": 1 }` (background)
- `{ channelId: "asc" }` unique partial (only where `channelId` is a string)
- `{ "config.serialNumber": "asc" }` unique partial (only where `config.serialNumber` is a string) — enforces one asset per channel

`denowatts-backend/src/channels/schemas/channel.schema.ts:289`

**ChannelImages fields (20 slots):** `front`, `back`, `horizontal`, `denoFront`, `denoAntenna`, `denoBomTempSensor`, `auxPyranometer`, `denoPOAAlignment`, `denoGHIAlignment`, `denoAlignmentOrLevel`, `denoToGatewayAntennaLineOfSight`, `denowattsGateway`, `dasEnclosure`, `allDasAntennas`, `siteTopoGrade`, `inverter`, `meter`, `racking`, `rs485Wiring`, `miscellaneous`, `hubCoverOff`

---

### Config schemas (one per channel type)

#### DenoChannelConfig — `denowatts-backend/src/channels/schemas/deno-channel-config.schema.ts`

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `'DENO'` (literal) | — | Used by `ChannelConfigUnion` resolver |
| `serialNumber` | String | No | Matches `assets.serialNumber`; unique across channels (partial index) |
| `macAddress` | String | No | |
| `model` | String | No | |
| `gateway` | ObjectId → Channel | No | References the gateway channel this Deno reports to |
| `orientation` | DenoChannelOrientation | No | `GHI | POA | SOILING`; determines `channelId` prefix `1.1.2` (GHI) vs `1.1.1` |
| `auxPyranometer` | AuxPyranometer | No | `{ orientation: GHI|POA|RPOA, serialNumber, calibrationFactor }` |
| `bomTemperature` | BomTemperature | No | `T1 | T2 | T3` |
| `modbusGroup` | Number | No | |

#### ModemChannelConfig — `denowatts-backend/src/channels/schemas/deno-channel-config.schema.ts`

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `'MODEM'` | — | |
| `name` | String | No | Display name for the modem |
| `serialNumber` | String | No | Matches `Asset.serialNumber`; the `Asset.simIccid` on that asset is the Lattigo ICCID |

#### GatewayChannelConfig — `denowatts-backend/src/channels/schemas/gateway-channel-config.schema.ts`

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `'GATEWAY'` | — | |
| `serialNumber` | String | No | |
| `model` | String | No | |
| `ipAllocationMethod` | GatewayIpAllocationMethod | No | `DHCP | STATIC` |
| `networkSettings` | GatewayNetworkSettings | No | `{ ipAddress, subnetMask, gateway, dns1, dns2, clientIp }` |
| `preamble` | Number | No | |

#### ModbusChannelConfig — `denowatts-backend/src/channels/schemas/modbus-channel-config.ts`

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `'MODBUS'` | — | |
| `gateway` | ObjectId → Channel | No | Gateway channel this device communicates through |
| `deviceId` | Number | No | Modbus device/slave ID |
| `reportInterval` | String | No | |
| `endian` | ModbusChannelEndian | No | `BIG | LITTLE` |
| `protocol` | ModbusChannelProtocol | No | `TCP | RTU | RTU1 | RTU2 | RTU3` |
| `ipAddress` | String | No | For TCP protocol |
| `port` | Number | No | For TCP protocol |
| `template` | ModbusChannelTemplate | No | `{ _id: ObjectId, model: String }` — reference to ModbusTemplate |
| `metrics` | [ModbusChannelMetric] | No | Per-register metric definitions (see below) |
| `zoneCount` | Int | No | Number of zones for multi-zone devices |
| `serverStartingRegister` | Number | No | |

**ModbusChannelMetric fields:** `name`, `enabled: Boolean`, `registerType: HOLDING|INPUT`, `startingRegister: Number`, `registerCount: Number`, `dataType: INT|UINT|FLOAT|UFLOAT|STRING|BCD`, `sample: String`, `multiplier: Float`, `offset: Float`, `unit: String`, `rules: ModbusRules`, `zone: String`, `scalingMetric: String`, `serverStartingRegister: Number`

**ModbusRules fields:** `faultType: BITMAP|CODE`, `faults: [{ metric, value }]`, `diagnostics: [{ valid }]`

#### OPCChannelConfig — `denowatts-backend/src/channels/schemas/opc-channel-config.ts`

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `'OPC'` | — | |
| `template` | ModbusChannelTemplate | No | Reuses same `ModbusChannelTemplate` type (`{ _id, model }`) as Modbus |
| `reportInterval` | String | No | |
| `opcPrefix` | String | No | OPC server prefix string used to filter tags |
| `metrics` | [OPCChannelMetric] | No | `{ name, zone, opcTagName, unit, multiplier, enabled }` |
| `zoneCount` | Int | No | |

#### APIChannelConfig — `denowatts-backend/src/channels/schemas/api-channel-config.schema.ts`

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `'API'` | — | |
| `username` | String | No | API credential |
| `password` | String | No | API credential |

#### ModbusLegacyChannelConfig — `denowatts-backend/src/channels/schemas/modbus_legacy-channel-config.schema copy.ts`

Legacy placeholder only. No fields beyond the `type` discriminant. Exists so the `MODBUS_LEGACY` source enum doesn't break type resolution.

---

### ModbusTemplate — `denowatts-backend/src/channels/schemas/modbus-template.schema.ts`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `_id` | ObjectId | auto | — | |
| `name` | String | No | — | Label for the template |
| `manufacturer` | String | Yes | — | |
| `model` | String | Yes | — | |
| `prefix` | String | Yes | — | 5-char channelId prefix (e.g., `"5.1.1"` for inverters); determines channelId of linked channels |
| `endian` | ModbusChannelEndian | No | — | `BIG | LITTLE` |
| `notes` | String | No | — | |
| `metrics` | [ModbusChannelMetric] | No | — | Reused from `ModbusChannelConfig.metrics` type |
| `createdBy` | ObjectId → User | Yes | — | |
| `isBulkZones` | Boolean | No | `false` | If true, the template represents a multi-zone device |
| `bulkZonesJump` | Int | No | — | Register address stride between zones |

Uniqueness constraint: `(manufacturer, model, name)` enforced in service layer (not a DB index).

---

### OpcTag — `denowatts-backend/src/channels/schemas/opc-tag.schema.ts`

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | |
| `name` | String | No | OPC tag name (used for regex prefix/suffix filter) |
| `site` | ObjectId → Site | No | |
| `namespace` | String | No | OPC namespace |
| `nodeId` | String | No | OPC node identifier |
| `dataType` | String | No | OPC data type string |
| `createdAt` | Date | auto | |
| `updatedAt` | Date | auto | |

---

## DTOs {dev}

### `CreateChannelInput` — `denowatts-backend/src/channels/dto/create-channel.input.ts`
Extends `PartialType(OmitType(Channel, ['_id', 'channelId', 'number', 'config']))`. Required fields added: `site: ID!`, `source: ChannelSource!`. Optional: `config: CreateChannelConfigInput` containing one of `{ gatewayConfig?, denoConfig?, modbusConfig?, modemConfig?, opcConfig? }`.

### `UpdateChannelInput` — `denowatts-backend/src/channels/dto/update-channel.input.ts`
Extends `PartialType(OmitType(Channel, ['config']))`. Required: `_id: ID!`. Optional: `config: UpdateChannelConfigInput` (same shape as `CreateChannelConfigInput`), `unit: String`.

### `BulkUpdateChannelInput`
`channels: [UpdateChannelInput!]!` with `@ArrayNotEmpty()` and `@IsArray()`.

### `ConfigChannelSiteMapInput`
`site: ID!` with `@IsMongoId()`.

### `FilterChannelsInput` — `denowatts-backend/src/channels/dto/filter-channel.input.ts`
Partial pick of `Channel` fields `site, source, status`, plus `gateway?: ID`, `sites?: [ID]`.

### `FilterChannelInput`
`OmitType(Channel, ['config', 'blocks'])` all optional, plus `serialNumber?: String` (triggers case-insensitive regex on `config.serialNumber`).

### `ChannelFaultsFilterInput` — `denowatts-backend/src/channels/dto/channel-faults.input.ts`
`site: ID!`, `channels: [String!]!`, `start: String!` (ISO date), `end: String!` (ISO date). All validated with class-validator.

### `ChannelFaultResponse` — `denowatts-backend/src/channels/dto/channel-faults.response.ts`
`code: String`, `title: String`, `description: String`, `explanation: String`, `troubleshootingSteps: [String!]`. All fields non-nullable. Populated by OpenAI response.

### `ChannelResponse` — `denowatts-backend/src/channels/dto/channel.input.ts`
Extends `Channel` with: `openAlarms?: Number` (default 0), `totalAlarms?: Number` (default 0), `totalCopiedChannels?: Number` (default 0), `assetInfo?: Asset`, `auxPyranometerAssetInfo?: Asset`, `unit?: String`. These extra fields are populated by the `findAll` aggregation.

### `FilterOpcTagsInput` — `denowatts-backend/src/channels/dto/opc-tags.input.ts`
`opcPrefix: String!`, `opcSuffix?: String`, `site?: ID`.

### `CreateModbusTemplateInput` — `denowatts-backend/src/channels/dto/modbus-template.input.ts`
`OmitType(ModbusTemplate, ['_id', 'createdBy'])` — all non-identity fields.

### `UpdateModbusTemplateInput`
`PartialType(CreateModbusTemplateInput)` plus `_id: String!`.

### `FilterModbusTemplateInput`
Partial pick of `_id, name, manufacturer, model, prefix`.

### `BulkUpdateModbusTemplateInput`
`modbusTemplates: [UpdateModbusTemplateInput!]!`.

### `ModbusTemplateWithPopulatedObject`
`OmitType(ModbusTemplate, ['createdBy'])` plus `createdBy: { _id, firstName, lastName }` and `totalUsageCount?: Number`.

### `ModbusManufacturerObject`
`name: String`, `models: [String!]`.

### `TemplateSites`
`templateId: ID`, `templateName: String`, `site: ID`, `siteName: String`, `templateUsageCount: Number`.

### `ChangeSimStateInput` — `denowatts-backend/src/channels/dto/change-sim-state.input.ts`
`iccids: [String!]!` (non-empty), `action: LattigoSimAction` (enum `suspend | restore`).

### `ChangeSimStateResult` / `ChangeSimStateItem` — `denowatts-backend/src/channels/dto/change-sim-state-result.type.ts`
`results: [ChangeSimStateItem!]` where each item has `iccid: String`, `success: Boolean`, `message?: String`.

### `LattigoDevice` — `denowatts-backend/src/channels/dto/lattigo-device.type.ts`
`deviceName, state?, connected?: Boolean, lastConnectionDate?, bytesUsed?: Float, smsUsed?: Int, contractEndDate?, iccid?, imei?, ratePlan?: { name?, uuid? }`.

### `LattigoUsageAnalyticsInput` — `denowatts-backend/src/channels/dto/lattigo-usage-analytics.type.ts`
`page?: Int`, `pageSize?: Int`, `startDate?: DateTime`, `endDate?: DateTime`, `sortBy?: LattigoUsageAnalyticsSortBy`, `sortDirection?: LattigoUsageAnalyticsSortDirection`, `searchText?: String`.

### `LattigoUsageAnalyticsResult`
`items: [LattigoUsageSite!]`, `total: Int`, `page: Int`, `pageSize: Int`.

### `LattigoUsageSite` — `denowatts-backend/src/channels/dto/lattigo-usage-site.type.ts`
`siteName: String`, `siteId?: ID`, `iccid: String`, `modemName?: String`, `totalBytes: Float`, `daysWithData: Int`, `state?: String`.

---

## Business rules (cited) {dev}

- **Config type must match source**: `create()` and `update()` enforce that the correct sub-config key is present for the declared channel source. A DENO channel must have `denoConfig`, a MODBUS channel must have `modbusConfig`, etc. Mismatch throws `BadRequestException("Invalid config")`. — `denowatts-backend/src/channels/services/channels.service.ts:181`

- **Global channel number**: `number` is a global auto-increment across all channels, not scoped to a site. It is determined by `MAX(number) + 1` at create time, which means it could produce non-sequential values if two channels are created concurrently. — `channels.service.ts:215`

- **`channelId` uniqueness is partial**: The unique index on `channelId` applies only where `channelId` is a non-null string. MODEM channels receive no `channelId` and can coexist without conflict. — `channel.schema.ts:298`

- **`config.serialNumber` uniqueness is partial**: The unique index applies only where `config.serialNumber` is a string, preventing two active channels from sharing a device serial number. On duplicate key error `11000`, the service emits a user-friendly message. — `channel.schema.ts:308`, `channels.service.ts:840`

- **DENO orientation drives channelId prefix**: When a DENO channel is updated with `orientation = GHI`, the prefix changes from `1.1.1` to `1.1.2`. This changes which `deviceType` and `metric` are resolved in `findAll()`. — `channels.service.ts:787`

- **Modbus/OPC template determines channelId**: Setting a template on a Modbus or OPC channel causes `channelId = template.prefix + "." + channel.number`. The `template._id` is also replaced with the actual `Types.ObjectId` from the database lookup to ensure type safety. — `channels.service.ts:795`

- **`configChannelSiteMap` is a destructive deploy**: Any channel for the site that is NOT in the current site-builder flow nodes has its `siteMap` set to `null`. This is a full replace, not a merge. — `channels.service.ts:1086`

- **Modbus template uniqueness by `(manufacturer, model, name)`**: Enforced in `ModbusTemplateService.create()` and `update()` by querying for existence before writing. This is a soft constraint (service layer only, no DB unique index). — `modbus-template.service.ts:21`

- **Role restrictions**:
  - `configChannelSiteMap`: `SUPER_ADMIN` or `ADMIN` — `channels.resolver.ts:58`
  - All `ModbusTemplate` mutations/resolver: `SUPER_ADMIN` (class-level `@Roles` on `ModbusTemplateResolver`) — `modbus-template.resolver.ts:19`
  - `modbusTemplates` query (`findAll`): `@AllRoles()` override (any authenticated user) — `modbus-template.resolver.ts:33`
  - `lattigoDevice`, `changeLattigoSimState`: `ADMIN` or `SUPER_ADMIN` — `lattigo.resolver.ts:20, 41`
  - `lattigoUsageAnalytics`: `SUPER_ADMIN` only — `lattigo.resolver.ts:31`

- **Channel sorting in `findAll`**: A dual-phase sort is applied. Phase 1 is in MongoDB (`$sort` by `deviceTypeOrder, nickAlpha, nickNum, nick, number`). Phase 2 is a JavaScript re-sort on the result array for finer control: device type order → base name prefix → letter group vs numeric → letter chunk → separator (dash before dot) → numeric token depth → locale compare → final tie-breaker by `number`. — `channels.service.ts:569`

- **Channel fault responses are AI-generated**: The `getChannelFaults` query proxies to an external Python service at `matrix.denowatts.com/data/faults` (requires `CAPACITY_TEST_PYTHON_SECRET` env var), then passes each raw fault code to OpenAI's `generateChannelStatusDescription()` to produce human-readable `code`, `title`, `description`, `explanation`, `troubleshootingSteps`. — `channels.service.ts:1106`

- **Lattigo ICCID = Asset.simIccid**: The Lattigo API uses `device_name` as the device identifier, which equals the SIM ICCID. In DenoWatts this is stored as `Asset.simIccid`. Do NOT use `Asset.cellularId` for Lattigo API calls — that is Lattigo's internal numeric ID used only for the Lattigo portal URL. — `lattigo.service.ts:306`

- **Lattigo Redis caching**: Device list is cached for 5 minutes under key `lattigo:device_list`. Per-device daily usage is cached per ICCID+date-range combination. This means SIM state changes (suspend/restore) may not be reflected in the usage analytics list for up to 5 minutes. — `lattigo.service.ts:25,199`

- **Images are stored as keys, returned as URLs**: Channel image fields store S3 object key names (not full URLs) in MongoDB. On every read (`findOne`, `findAll`), these keys are resolved to time-limited pre-signed download URLs via `StorageService`. The path pattern is `denobox/{siteId}/Photos/{key}`. — `channels.service.ts:153`

---

## Data touched {dev}

| Collection | Operation | How/Why |
|---|---|---|
| `channels` | Read/Write | Primary CRUD; all channel documents |
| `assets` | Read | `findAll`: joined to get `assetInfo` (by `config.serialNumber + source`) and `auxPyranometerAssetInfo` (by `config.auxPyranometer.serialNumber + AUX_PYRANOMETER`); `LattigoService.buildIccidToSiteMap`: finds MODEM assets by `simIccid` |
| `assets` (radio) | Read | `findAll`: joined via `assetInfo.radio` to get radio MAC address |
| `events` | Read | `findAll`: two lookups — open alarms (no `endDate`) and 30-day alarm count |
| `devicetypes` | Read | `findAll`: matched by first 5 chars of `channelId` to resolve device type and sort order |
| `metrics` | Read | `findAll`: matched by `deviceType.keyMetric` to resolve `unit` |
| `sites` | Read | `create`/`update`: validates site existence; `getChannelFaults`: retrieves inverter info; `LattigoService`: joined in ICCID-to-site map aggregation |
| `modbustemplates` | Read/Write | `create`/`update`/`bulkUpdate`: prefix lookup; `ModbusTemplateService`: full CRUD |
| `opctags` | Read | `getOpcTags`: queried by name prefix/suffix regex and optional site |
| `sitebuilders` | Read/Write | `configChannelSiteMap`: reads flow nodes, writes `lastDeployData` and `lastDeployAt` |
| `users` | Read | `ModbusTemplateService.findAll`: populates `createdBy` |
| **Redis** | Read/Write | `LattigoService`: device list (`lattigo:device_list`) and per-device daily usage caches, TTL 300s |

---

## Edge cases & gotchas {dev}

- **`findAll` aggregation runs image URL resolution sequentially per channel**: If a site has many channels with images, this can be slow because `storageService.getDownloadUrl()` calls are awaited in a `for...of` loop. `channels.service.ts:657`

- **`findAll` alarm lookups use `!$endDate` for open alarms**: The expression `{ $not: ["$endDate"] }` matches documents where `endDate` is falsy (null, undefined, or 0). This means events with `endDate: null` and events with no `endDate` field are both counted as open alarms. — `channels.service.ts:392`

- **No `GATEWAY` config in `create()`**: The `switch` statement in `create()` has no `case ChannelSource.GATEWAY` for config extraction. Gateway channels can be created without a config, or the config must be added via `update()` afterwards. — `channels.service.ts:181`

- **`channelId` can be `null`**: A MODEM channel receives no `channelId` prefix and will have `channelId = null`. This is why the unique index is partial. The `deviceTypeOrder` `$switch` in the aggregation has a `default: 999` case that catches anything without a matching prefix. — `channels.service.ts:241`

- **Race condition on `number` generation**: `create()` finds `MAX(number)` then immediately inserts. There is no atomic increment or transaction. Two concurrent creates could produce the same `number`. Since `number` is `unique: true`, the second insert would fail. — `channels.service.ts:215`

- **`template._id` is replaced in memory during `update()` and `bulkUpdate()`**: After template lookup, `updateChannelInput.config.modbusConfig.template._id` is mutated to the fetched `Types.ObjectId`. This side-effect ensures the stored value is always an ObjectId, not the string form received from GraphQL. — `channels.service.ts:799`

- **Lattigo `connected` field parses string booleans**: Lattigo may return `"true"` or `"false"` as strings. `parseBoolean()` handles this explicitly. `connected` can also be `undefined` if not returned by the API. — `lattigo.service.ts:423`

- **`ChannelConfigUnion` has no fallback for `MODBUS_LEGACY`**: The `resolveType()` function in the union returns `null` for any `config.type` not explicitly handled. This means `MODBUS_LEGACY` channels will have a null config type in GraphQL responses. — `channel.schema.ts:80`

- **Modbus template `(manufacturer, model, name)` uniqueness is not a DB index**: It is enforced only in the service methods. Concurrent API calls could bypass this check and create duplicates. — `modbus-template.service.ts:21`

- **`siteMap` nulling is per-site, not per-channel**: `configChannelSiteMap` issues a global `updateMany({ site: input.site, _id: { $nin: mappedObjectIds } }, { siteMap: null })`. Any channel for that site not in the flow graph loses its siteMap, even if it had a valid one manually assigned. — `channels.service.ts:1086`

- **OPC tags are a separate collection**: The `opctags` collection is distinct from channels. OPC channels reference tags by name (`opcTagName` in `OPCChannelMetric`), not by ObjectId. The `opcTags` query is used to browse available tags when configuring an OPC channel metric. — `opc-tag.schema.ts`

---

## Solar & platform terminology {dev}

- **Channel** — one configured data stream from a single piece of hardware. The unit this whole module manages.
- **channelId** — the dotted code (`1.1.1.47`) identifying a channel; its 5-char prefix maps to a device type and key metric in the `devicetypes` catalog.
- **Deno** — a Denowatts reference sensor (irradiance + temperature). Its *orientation* (GHI/POA/SOILING) changes its channelId prefix.
- **Gateway (Denobox)** — the on-site data-acquisition box; Deno sensors report through it.
- **Modbus** — an industrial protocol for reading registers off inverters/meters (over RS-485 serial or TCP); a *template* maps registers → metrics.
- **OPC (OPC-UA)** — another industrial data protocol; channels reference named *tags* instead of register addresses.
- **Pyranometer** — the irradiance sensor; an *auxiliary* pyranometer can be oriented to GHI/POA/RPOA.
- **Lattigo / ICCID** — the cellular-SIM management provider; the ICCID is the SIM's unique id (stored as `Asset.simIccid`).
- **Key metric** — the headline value a channel reports, resolved from its device type.
- **Site map / zone** — a channel's physical placement in the visual site layout, deployed from the Site Builder. See [[site-builder]].
- **Fault code** — an inverter-reported error; the fault-diagnosis flow explains these in plain language via AI. See [[tests]].

For the full domain vocabulary, see [[solar-glossary]].

---

**Related flows:** [[site]] · [[field-setup]] · [[site-builder]] · [[status]] · [[alarm-config]] · [[assets]] · [[data-out]] · [[tests]] · [[settings]] · [[device-types]] · [[metrics]] · [[solar-glossary]]
