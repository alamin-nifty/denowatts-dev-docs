---
title: Assets
owner: alamin-nifty
status: draft
version: 3
updated_at: 2026-08-19
---

# Assets

An **asset** is a physical piece of Denowatts hardware tracked in inventory — a Deno reference sensor, the radio paired to it, an auxiliary pyranometer, an on-site gateway, or a cellular modem. The assets module is the registry of all that equipment: every unit's serial number, model, firmware, calibration history, and condition, from registration through retirement. Alongside the hardware inventory it also keeps the platform's catalogue of **metrics** (the named data signals sites report) and lets each customer company use its own names for them.

> **Reading this doc:** use the **Business / Developer** switch at the top. *Business* explains what assets are, what's recorded about each device, and the rules around them. *Developer* adds the full GraphQL surface, the services and search logic, every schema and DTO shape, file references, and a terminology primer.

---

## Why this matters

An asset on its own is just a box on a shelf — it becomes useful when it's wired up at a site as a data channel, and the link between the two is the **serial number**. The inventory is how the company knows what hardware exists, what shape it's in (condition flags from "good" through "replace urgently" to "retired"), when each sensor was last calibrated, and which SIM is in which modem. If the inventory drifts from reality, calibration audits, field repairs, and cellular billing all get harder.

---

## The hardware tracked

Five kinds of device live in the inventory:

- **Deno sensor** — the wireless Denowatts reference sensor (irradiance + temperature). Each Deno records which radio it's paired with.
- **Radio** — the wireless link unit paired to a Deno, identified by MAC address.
- **Aux Pyranometer** — an auxiliary irradiance sensor, with its calibration factor.
- **Gateway** — the on-site data-acquisition box (Denobox), including its serial-port and network settings.
- **Cellular modem** — the SIM/modem backhauling a site's data, with IMEI, SIM identifiers, WiFi details, and the credentials for the device's own web interface.

---

## What's recorded about each device

Every asset carries a serial number, model, firmware version, a **condition flag** (Good / Watch / Replace / Replace Urgent / Maintenance Required / Retired), free-text notes, and a history of **calibration records** — each with a date and a downloadable certificate. Modems additionally carry their SIM details, which is how the platform's cellular-management features know which SIM belongs to which site. An asset is connected to its live data stream (a channel) by matching serial numbers, so the inventory record and the measurements from the same physical device stay linked. See [[channels]].

---

## Remote Deno configuration

SuperAdmins can read and write a Deno sensor's firmware settings remotely — calibration gains and offsets, day/night/twilight reporting schedules, capacity and derate figures — and can issue reset and launch commands to the device. These operations talk to the live device through the platform's remote-management service; nothing is stored locally except the inventory record.

---

## Metrics and company-specific names

The module also owns the **metric catalogue**: every named signal the platform understands, with its display name, unit, and which kinds of channel it applies to. Some metrics are **KPIs** computed from an expression combining other metrics, numbers, and site properties. On top of the global catalogue, each customer company can be given its own **alias** for a metric, so that company's reports and screens use the naming its team is used to.

---

## Who can do what

- **Any signed-in user** can view asset lists and look up individual assets (non-SuperAdmin users must belong to a company).
- **SuperAdmins only** can create or edit assets, manage metrics, and use the remote Deno configuration tools — both screens live under Settings (Asset Management and Remote Management). See [[settings]].

---

## The rules that matter

- **Serial numbers are unique** among active Deno, aux-pyranometer, and modem assets; **MAC addresses are unique** among active radios and gateways.
- **Assets are never truly deleted** — "deleting" one just marks it as removed (soft delete), so history and audit trails are preserved. The delete button isn't even exposed in the UI yet.
- **Editing a Deno's serial or model updates its channel too** — any live data stream wired to that Deno is kept in sync automatically.
- **A retired Deno can't keep a radio pairing** — the pairing is cleared when a Deno is registered as retired.
- **Calibration certificates are stored privately** and downloaded via short-lived secure links.
- **Metric names must be unique** across the catalogue.

---

## Entry points {dev}
- Asset Management — `denowatts-portal/src/features/settings/asset-management/AssetManagementPage.tsx` — route `/settings/asset-management` (SuperAdmin only, wrapped in `ProtectedRoute`)
- Remote Management — `denowatts-portal/src/pages/dashboard/settings/remote-management/RemoteManagementPage` — route `/settings/remote-management` (SuperAdmin only)

---

## GraphQL API surface {dev}

### Resolver: AssetsResolver — `denowatts-backend/src/assets/resolvers/assets.resolver.ts`

Class guard: `@Roles(UserType.SUPER_ADMIN)` applies by default; individual queries override to `@AllRoles()`, and **`updateAsset` overrides to `@Roles(SUPER_ADMIN, ADMIN)`** so admins can edit assets — `denowatts-backend/src/assets/resolvers/assets.resolver.ts:23,33,39,48,57`.

#### Queries

- **`assets(filter: FilterAssetInput!): [AssetsResponse!]!`** — returns all non-deleted assets matching the filter, with `radio` field populated (macAddress only). Accessible to all roles (`@AllRoles()`).
  - Input: `FilterAssetInput` — `type` (AssetType, required), `serialNumber` (String, optional), `flag` (AssetFlag, optional)
  - Returns: `[AssetsResponse]` — full Asset fields except `radio` is `AssetRadioInfo { _id, macAddress }` instead of ObjectId

- **`assetsWithPaginate(assetsPaginateFilterInput: AssetsPaginateFilterInput!): AssetsResponseWithPaginate!`** — paginated asset list with channel/site/radio cross-join info. Accessible to all roles (`@AllRoles()`).
  - Input: `AssetsPaginateFilterInput` — `type` (AssetType), `limit` (Number, default 10), `page` (Number, default 1), `search` (String, free-text), `channelInfo` (AssetChannelInfo), `radioInfo` (AssetRadioInfo), `denoInfo` (AssetDenoInfo), all other Asset fields as optional filters
  - Returns: `AssetsResponseWithPaginate` — paginated wrapper containing `docs: [AssetsPaginateResponse]` plus `totalDocs`, `limit`, `totalPages`, `page`, `pagingCounter`, `hasPrevPage`, `hasNextPage`, `prevPage`, `nextPage`
  - Each doc extends Asset with: `channelInfo { _id, name, siteName, status }`, `radioInfo { _id, macAddress }`, `denoInfo { _id, serialNumber, model }`, `updatedAt`

- **`asset(singleAssetFilterInput: SingleAssetFilterInput!): Asset`** — returns a single asset matching all provided filter fields, nullable. Accessible to all roles.
  - Input: `SingleAssetFilterInput` — any subset of Asset fields (partial, omits `config`)
  - Returns: `Asset` or `null`

- **`getDenoConfig(serialNumber: String!): DenoConfig`** — fetches live firmware configuration from the Python Matrix service for a given Deno serial number. SuperAdmin only.
  - Returns: `DenoConfig` — 35 Float fields (see DTOs section)

- **`getDenoConfigBlockData(serialNumber: String!): BlockData`** — fetches the "block/array" subset of firmware parameters. SuperAdmin only.
  - Returns: `BlockData` — 7 fields: `clip`, `dc`, `dcOhmic`, `denowattsDerate`, `denowattsTcoeffGain`, `energyDerate`, `expectedTcoeffGain`

- **`getDenoConfigCalibrationData(serialNumber: String!): CalibrationData`** — fetches the sensor calibration subset of firmware parameters. SuperAdmin only.
  - Returns: `CalibrationData` — 6 fields: `irr1Gain`, `irr1Offset`, `irr2Gain`, `irr2Offset`, `refGain`, `refOffset`

- **`getDenoConfigResetAndReadData(serialNumber: String!): DenoConfig`** — resets Deno firmware and reads back the resulting configuration in one operation. SuperAdmin only.
  - Returns: `DenoConfig`

- **`getDenoConfigResetData(serialNumber: String!): String`** — issues a firmware reset command to the Deno. SuperAdmin only.
  - Returns: `"Reset successful!"` on success

- **`getDenoConfigLaunchData(serialNumber: String!): String`** — issues a firmware launch command to the Deno. SuperAdmin only.
  - Returns: `"Launch successful!"` on success

#### Mutations

- **`createAsset(createAssetInput: CreateAssetInput!): Asset!`** — creates a new hardware asset record. SuperAdmin only.
  - Input: all Asset fields except `_id` and `deletedAt`; `config` uses `AssetConfigInput` (wrapper with per-type sub-objects)

- **`updateAsset(updateAssetInput: UpdateAssetInput!): Asset!`** — updates an existing asset by `_id`. **SuperAdmin *or* Admin** (`@Roles(SUPER_ADMIN, ADMIN)`); it is the one mutation that relaxes the class-level SuperAdmin guard — `denowatts-backend/src/assets/resolvers/assets.resolver.ts:57-58`.
  - Input: `UpdateAssetInput` — all Asset fields as optional except `_id` (required ID); `config` uses `UpdateAssetConfigInput`
  - Throws `BadRequestException` if `_id` is missing (resolver guard) — `assets.resolver.ts:58`

- **`updateDenoConfig(updateDenoConfigInput: updateDenoConfigInput!): String!`** — writes a full firmware config block to the Deno via Python Matrix. SuperAdmin only.
  - Input: `UpdateDenoConfigInput` — `serialNumber` (String, required) + all 35 DenoConfig Float fields
  - Returns: `"Config updated successfully!"` on success

---

### MetricsResolver — moved out of this module

`src/assets/metrics.resolver.ts` was an **unregistered duplicate** — never listed in `AssetsModule`'s providers, so its operations were never wired into the GraphQL schema — and has been **deleted** in this release. The live resolver is `denowatts-backend/src/metrics/resolvers/metrics.resolver.ts`, provided by `MetricsModule`; its full operation list is documented in [[metrics]].

`AssetsModule` now provides exactly `AssetsResolver, AssetsService, CompanyMetricResolver, CompanyMetricService` — `denowatts-backend/src/assets/assets.module.ts:28`.
### Resolver: CompanyMetricResolver — `denowatts-backend/src/assets/resolvers/company-metric.resolver.ts`

No class-level guard.

#### Queries

- **`companyMetric(_id: String!): CompanyMetric`** — returns a single company metric record by ID. Requires auth.

- **`companyMetrics: [CompanyMetric!]!`** — returns all company metric records. Public (`@Public()`).

#### Mutations

- **`createCompanyMetric(input: CompanyMetricInput!): CompanyMetric!`** — creates a new company metric record (creates the shell; metrics are added via update). Requires auth.
  - Input: `{ company: String! }`

- **`updateCompanyMetric(input: UpdateCompanyMetricInput!): CompanyMetric`** — updates a company metric record, typically to set the `metrics` array. Requires auth.
  - Input: `UpdateCompanyMetricInput` — `_id` (ID, required, `@IsMongoId()`) + partial `CompanyMetric` fields

- **`deleteCompanyMetric(_id: String!): CompanyMetric`** — hard-deletes a company metric record. Requires auth.

---

## Services {dev}

### AssetsService — `denowatts-backend/src/assets/services/assets.service.ts`

#### `create(createAssetInput: CreateAssetInput): Asset`

1. **Serial number uniqueness check (DENO, AUX_PYRANOMETER):** Queries `assets` collection for `{ serialNumber, deletedAt: { $exists: false } }`. Throws `BadRequestException` if found.
2. **MAC address uniqueness check (RADIO, GATEWAY):** Queries `assets` collection for `{ macAddress, deletedAt: { $exists: false } }`. Throws `BadRequestException` if found.
3. **Serial number uniqueness check (MODEM):** Same as step 1 but scoped to MODEM type.
4. **Config unwrapping:** If `createAssetInput.config` is present, extracts the type-specific sub-object from the wrapper (`gatewayConfig`, `denoConfig`, `auxPyranometerConfig`, `radioConfig`, `modemConfig`) based on `createAssetInput.type`. This is necessary because the GraphQL input uses a union wrapper, but the Mongo schema stores the flat config directly.
5. **DB write:** `assetModel.create({ ...createAssetInput, config })` — inserts with the unwrapped config.

#### `findAll(filter?: Partial<Asset>): Asset[]`

- Queries: `assetModel.find({ ...filter, deletedAt: { $exists: false } })` then `.populate([{ path: 'radio', select: 'macAddress' }])`
- No soft-delete boundary: only excludes records where `deletedAt` exists.

#### `findByPaginate(filter: AssetsPaginateFilterInput, user: User): AssetsResponseWithPaginate`

Step-by-step:
1. **Auth guard:** Non-SuperAdmin users without a `company` field throw `ForbiddenException`.
2. **Base query:** `{ type: filter.type, deletedAt: { $exists: false } }`.
3. **Type-specific full-text search via `$or`** (when `searchText` is non-empty):
   - **DENO:** searches `serialNumber` and `model` by regex; additionally finds matching RADIO assets by `macAddress` regex and adds their `_id` values to the DENO `$or` via `radio: { $in: [...] }`.
   - **RADIO:** searches `macAddress` by regex; additionally finds matching DENO assets by `serialNumber`/`model` and adds their `radio` field IDs to the RADIO `$or` via `_id: { $in: [...] }`.
   - **AUX_PYRANOMETER:** searches `serialNumber` by regex only.
   - **GATEWAY:** searches `serialNumber` by regex only.
   - **MODEM:** searches `serialNumber`, `macAddress`, `model`, `imei`, `simEid`, `simIccid` by regex; additionally calls `sitesService.searchAssetsSites(searchText)` and if a site is found, searches for channels on that site with `source: MODEM` and adds their `config.serialNumber` values to the `serialNumber $in` clause.
4. **Pagination:** `assetPaginateModel.paginate(query, { limit, page, sort: { updatedAt: -1 }, lean: true, populate: [{ path: 'radio', select: 'macAddress' }] })`.
5. **Post-processing each document:**
   - For GATEWAY, DENO, MODEM: looks up a `Channel` by `config.serialNumber = asset.serialNumber`, populates `site.name`; attaches `channelInfo: { _id, name, siteName, status }`.
   - For RADIO: looks up a DENO asset by `radio: asset._id` (optionally filtered by `denoInfo.model`/`denoInfo.serialNumber`); attaches `denoInfo: { serialNumber, model }`.
   - For DENO with populated `radio` field: copies populated radio object to `radioInfo`, then overwrites `radio` with just the ObjectId.
   - All docs: calls `processAssetDownloadUrls()` — resolves each `calibration.certificate` filename to a full S3 pre-signed download URL via `StorageService.getDownloadUrl('assets/{assetId}/{certificate}')`.
6. **Returns:** `{ ...paginateResult, docs: processedDocs }`.

#### `findOne(filter: Partial<Asset>, user?: User): Asset | null`

1. **Auth guard:** Non-SuperAdmin users without `company` throw `ForbiddenException`.
2. **Serial number handling:** If `filter.serialNumber` is set, converts it to a case-insensitive regex: `{ $regex: value, $options: 'i' }`.
3. **Query:** `assetModel.findOne({ ...filter, deletedAt: { $exists: false } }, null, { sort: { updatedAt: -1 } })`.

#### `update(id: ObjectId, updateAssetInput: UpdateAssetInput): Asset`

1. **Existence check:** `assetModel.findOne({ _id: id, deletedAt: { $exists: false } })`. Throws `BadRequestException('Asset not found!')` if missing.
2. **Serial number uniqueness check (DENO, AUX_PYRANOMETER):** Queries for conflicting serial number excluding the current `_id`. Throws if found.
3. **MAC address uniqueness check (RADIO, GATEWAY):** Same pattern, checks `macAddress`. Throws if found.
4. **Serial number uniqueness check (MODEM):** Same as serial check but for MODEM type.
5. **Config unwrapping:** Same switch logic as `create`, but reads `asset.type` (from the existing record) rather than the input type to determine which sub-config to extract. Merges existing config with new: `{ ...asset.config, type: asset.type, ...config }`.
6. **DB write:** `assetModel.findByIdAndUpdate(id, { ...updateAssetInput, config: mergedConfig }, { new: true })`.
7. **Channel cascade (DENO only):** If updated asset is `AssetType.DENO`, runs: `channelModel.updateMany({ 'config.serialNumber': updatedAsset.serialNumber }, { $set: { 'config.serialNumber': ..., 'config.model': ... } })`. This keeps channel config in sync when a DENO asset's serial or model changes.
8. **Returns:** Updated asset document.

#### Python Matrix proxy methods

All six methods follow the same pattern: POST to the Matrix Python server, passing `serial_number` and `python_secret` (from `ConfigService`), return `data`. Any HTTP error throws `BadRequestException`.

| Method | Endpoint constant | HTTP body | Returns |
|---|---|---|---|
| `getDenoConfig(serialNumber)` | `GET_DENO_CONFIG_API_URL` | `{ serial_number, python_secret }` | `DenoConfig` object |
| `updateDenoConfig(input)` | `GET_CONFIG_BLOCK_FROM_DENO_CONFIG_API_URL` | all DenoConfig fields + `serial_number` + `python_secret` | `"Config updated successfully!"` |
| `getBlockData(serialNumber)` | `GET_BLOCK_DATA_API_URL` | `{ serial_number, python_secret }` | `BlockData` object |
| `getCalibrationData(serialNumber)` | `GET_CALIBRATION_DATA_API_URL` | `{ serial_number, python_secret }` | `CalibrationData` object |
| `resetAndRead(serialNumber)` | `GET_RESET_AND_READ_API_URL` | `{ serial_number, python_secret }` | `DenoConfig` object |
| `reset(serialNumber)` | `GET_RESET_API_URL` | `{ serial_number, python_secret }` | `"Reset successful!"` |
| `launch(serialNumber)` | `GET_LAUNCH_API_URL` | `{ serial_number, python_secret }` | `"Launch successful!"` |

Matrix base URL: `https://matrix.denowatts.com` — `denowatts-backend/src/common/constants/apis.ts:1`

---

### MetricsService — moved out of this module

`src/assets/metrics.service.ts` was an **unregistered duplicate** of the live implementation and has been **deleted** in this release. The canonical service is `denowatts-backend/src/metrics/services/metrics.service.ts`, provided by `MetricsModule`. Its methods are documented in [[metrics]].
### CompanyMetricService — `denowatts-backend/src/assets/services/company-metric.service.ts`

| Method | Operation | Notes |
|---|---|---|
| `getCompanyMetrics()` | `companyMetricModel.find()` | Returns all company metric records |
| `getCompanyMetric(_id)` | `companyMetricModel.findById(_id)` | Single record by ID |
| `createCompanyMetric(input)` | `companyMetricModel.create({ company: input.company })` | Creates shell with no metrics array; populate via update |
| `updateCompanyMetric(_id, input)` | `companyMetricModel.findByIdAndUpdate(_id, input, { new: true })` | Updates any field including `metrics` array |
| `deleteCompanyMetric(_id)` | `companyMetricModel.findByIdAndDelete(_id)` | Hard delete |

---

## Schemas {dev}

### Asset — `denowatts-backend/src/assets/schemas/asset.schema.ts`

| Field | Type | Required | Indexed | Purpose |
|---|---|---|---|---|
| `_id` | ObjectId | auto | — | Primary key |
| `type` | AssetType enum | Yes | compound with serialNumber | Device type: DENO, AUX_PYRANOMETER, GATEWAY, RADIO, MODEM |
| `serialNumber` | String | No | Unique (partial: exists & non-null); compound with type | Hardware serial number |
| `model` | String | No | — | Hardware model identifier |
| `firmware` | String | No | — | Firmware version string |
| `radio` | ObjectId (ref: Asset) | No | Yes (background) | Self-referential: DENO assets reference their paired RADIO asset |
| `macAddress` | String | No | — | Network MAC address (RADIO, GATEWAY, MODEM) |
| `macPreamble` | Number | No | — | MAC preamble number (RADIO) |
| `flag` | AssetFlag enum | No | — | Asset condition status |
| `calibrationLinks` | String[] | No | — | Legacy: array of calibration URLs (superseded by `calibrations`) |
| `notes` | String | No | — | Free-text notes |
| `latestData` | AssetLatestData | No | — | Most recent gateway network snapshot (IP allocation, settings, preamble, timestamp) |
| `config` | AssetConfigUnion (Mixed) | No | — | Type-specific configuration object stored as SchemaTypes.Mixed |
| `calibrations` | AssetCalibration[] | No | — | Calibration records with date and certificate filename |
| `deletedAt` | Date | No | Yes (background) | Soft-delete timestamp; absence = active record |
| `username` | String | No | — | Modem web-UI credentials |
| `password` | String | No | — | Modem web-UI credentials |
| `imei` | String | No | — | Modem IMEI number |
| `wifiSsid` | String | No | — | Modem WiFi SSID |
| `wifiPassword` | String | No | — | Modem WiFi password |
| `simEid` | String | No | — | SIM EID (embedded SIM identifier) |
| `simIccid` | String | No | — | SIM ICCID — also the Lattigo `device_name` for cellular API calls |
| `remoteManagementId` | String | No | — | External remote management system ID |
| `cellularId` | String | No | — | Lattigo internal numeric device ID (used for Lattigo portal URL only, NOT for API calls) |
| `createdAt` | Date | auto | — | Mongoose timestamps |
| `updatedAt` | Date | auto | Yes (`updatedAt: -1`, background) | Mongoose timestamps; used for pagination sort |

**Enum: AssetType** — `DENO`, `AUX_PYRANOMETER`, `GATEWAY`, `RADIO`, `MODEM`

**Enum: AssetFlag** — `GOOD`, `WATCH`, `REPLACE`, `REPLACE_URGENT`, `MAINTENANCE_REQUIRED`, `RETIRED`

**Enum: RTUPortsType** — `MASTER`, `LISTENER`, `PASSTHRU`

**MongoDB indexes (compound/special):**
- `{ updatedAt: -1 }` background — default sort for pagination
- `{ deletedAt: 1 }` background — soft-delete filter
- `{ serialNumber: 1, type: 1 }` background — multi-type queries
- `{ radio: 1 }` background — DENO→RADIO lookup
- `{ coordinates: '2dsphere' }` background — geo index (no `coordinates` field defined in schema — appears unused/legacy)
- `{ serialNumber: 1 }` unique partial (`{ $exists: true, $ne: null }`) background — enforces serial number uniqueness only when set

**Embedded types:**

`AssetCalibration` — `{ date?: Date, certificate?: String }` — certificate stores a filename only; `AssetsService.processAssetDownloadUrls()` resolves it to a full S3 URL at query time.

`AssetLatestData` — picks `ipAllocationMethod`, `networkSettings`, `preamble` from `GatewayChannelConfig` plus `timestamp: Date`.

`AssetGatewayConfig` — `{ type: GATEWAY, socketxpId: String, rtuPorts: RTUPorts }`. RTUPorts contains up to 3 RTU ports (`rtu1`, `rtu2`, `rtu3`), each with `mode`, `baudRate`, `byteSize`, `parity`, `stopBits`, `timeout`.

`AssetDenoConfig` — `{ type: DENO }` — no additional fields; Deno config is managed live via Python proxy.

`AssetAuxPyranometerConfig` — `{ type: AUX_PYRANOMETER, calibrationFactor: Float }`.

`AssetRadioConfig` — `{ type: RADIO }` — no additional fields.

`AssetModemConfig` — `{ type: MODEM, ipAddress: String }`.

---

### Metric — `denowatts-backend/src/metrics/schemas/metric.schema.ts`

| Field | Type | Required | Indexed | Purpose |
|---|---|---|---|---|
| `_id` | ObjectId | auto | — | Primary key |
| `name` | String | Yes | Unique | Internal metric key (e.g. `"sf1"`, `"irr1"`) |
| `companyWiseName` | String | No | — | Virtual field, not persisted; populated by `findAll` aggregation |
| `displayName` | String | Yes | — | Human-readable label shown in UI |
| `unit` | String | Yes | — | SI unit string (e.g. `"W/m²"`, `"kWh"`) |
| `channelPrefixes` | String[] | Yes | — | Channel name prefix patterns this metric belongs to |
| `minRange` | Number | No | — | Display range minimum |
| `maxRange` | Number | No | — | Display range maximum |
| `description` | String | No | — | Long description |
| `zone` | String | No | — | Geographic or functional zone |
| `isKpi` | Boolean | No (default: false) | — | Whether this is a KPI metric with an expression |
| `expression` | MetricExpressionItem[] | No (default: []) | — | Ordered array of expression items for KPI calculation |
| `tags` | MetricTags[] | No (default: []) | — | Categorical tags |
| `createdAt` | Date | auto | — | Mongoose timestamps |
| `updatedAt` | Date | auto | — | Mongoose timestamps |

**Enum: MetricExpressionItemType** — `METRIC`, `OPERATOR`, `NUMBER`, `SITE_PROPERTY`

**Enum: MetricTags** — `P50_GHI`, `RESOURCE_MODEL`, `PHYSICAL_MODEL`, `EXTERNAL`, `INTERNAL`, `RECOMMENDED`, `EXPECTED`, `LEARNED`, `PREDICTED`, `INSTANTANEOUS`, `CUMULATIVE`, `DC_OUTAGE`, `AC_OUTAGE`

**Embedded: MetricExpressionItem** — `{ type: MetricExpressionItemType, metric?: ObjectId, operator?: String, value?: Float, siteProperty?: String }` — used for computed KPI metrics; expression items are evaluated in order.

---

### CompanyMetric — `denowatts-backend/src/assets/schemas/company-metric.schema.ts`

| Field | Type | Required | Indexed | Purpose |
|---|---|---|---|---|
| `_id` | ObjectId | auto | — | Primary key |
| `company` | String | Yes | Unique | Company identifier string (not a ref to Company model) |
| `metrics` | CompanyMetrics[] | No | — | Array of metric aliases for this company |
| `createdAt` | Date | auto | — | Mongoose timestamps |
| `updatedAt` | Date | auto | — | Mongoose timestamps |

**Embedded: CompanyMetrics** — `{ metric: ObjectId (ref: Metric), name: String }` — maps a global metric ID to a company-specific display name.

---

## DTOs {dev}

### FilterAssetInput — `denowatts-backend/src/assets/dto/filter-asset.input.ts`

| Field | Type | Validation | Purpose |
|---|---|---|---|
| `type` | AssetType | None | Filter by asset type (used as required in practice by all callers) |
| `serialNumber` | String | Optional | Exact match filter |
| `flag` | AssetFlag | Optional | Filter by condition flag |

### CreateAssetInput — `denowatts-backend/src/assets/dto/asset.input.ts` (primary) / `denowatts-backend/src/assets/dto/asset.input.ts`

Two definitions exist. The active one used by the resolver is from `dto/asset.input.ts`:

```typescript
// dto/asset.input.ts
export class CreateAssetInput extends OmitType(Asset, ['_id', 'deletedAt', 'config'], InputType)
```
with an additional `config?: AssetConfigInput` field wrapping the type-specific configs.

`dto/create-asset.input.ts` (older) simply does `OmitType(Asset, ['_id'], InputType)` — includes `deletedAt` and the raw config union; appears superseded.

### AssetConfigInput / UpdateAssetConfigInput

Both are wrappers with five optional typed sub-fields: `gatewayConfig?`, `denoConfig?`, `auxPyranometerConfig?`, `radioConfig?`, `modemConfig?`. The service switch-case extracts the correct one based on `type`.

### UpdateAssetInput — `denowatts-backend/src/assets/dto/update-asset.input.ts`

| Field | Type | Validation | Purpose |
|---|---|---|---|
| `_id` | ID | Required in resolver (guard at resolver:58) | Asset to update |
| all Asset fields | Partial | Optional (`PartialType`) | Fields to update |
| `config` | UpdateAssetConfigInput | Optional, `@ValidateNested` | Type-specific config wrapper |

### AssetsPaginateFilterInput — `denowatts-backend/src/assets/dto/asset.input.ts:144`

| Field | Type | Validation | Purpose |
|---|---|---|---|
| `type` | AssetType | Optional | Filter by type (required in practice) |
| `limit` | Number | Optional | Page size (default 10 in service) |
| `page` | Number | Optional | Page number (default 1 in service) |
| `search` | String | Optional | Free-text search term |
| `channelInfo` | AssetChannelInfo | Optional, `@ValidateNested` | Unused in current search logic (commented out) |
| `radioInfo` | AssetRadioInfo | Optional, `@ValidateNested` | Filter by radio macAddress (commented out in service) |
| `denoInfo` | AssetDenoInfo | Optional, `@ValidateNested` | Filter by Deno model/serialNumber when querying RADIO type |
| all other Asset fields | Partial | Optional | Passed through to query |

### SingleAssetFilterInput — `denowatts-backend/src/assets/dto/asset.input.ts:177`

`PartialType(OmitType(Asset, ['config']))` — any combination of Asset fields as filter criteria.

### DenoConfig — `denowatts-backend/src/assets/dto/asset.input.ts:179`

35 Float fields (all nullable) representing firmware configuration parameters. Also used as `InputType('DenoConfigInput')` for the update mutation.

| Field | Purpose |
|---|---|
| `clip` | Clip level (kWAC) |
| `dayReportInterval`, `daySampleAverages`, `daySampleInterval` | Daytime measurement scheduling |
| `dc` | Asset DC capacity (kWDC) |
| `dcOhmic` | DC ohmic factor |
| `denowattsDerate`, `denowattsTcoeffGain` | Denowatts model parameters |
| `energyDerate`, `expectedTcoeffGain` | Expected energy model parameters |
| `irr1Gain`, `irr1Offset`, `irr1Weighting` | Irradiance sensor 1 calibration |
| `irr2Gain`, `irr2Offset`, `irr2Weighting` | Irradiance sensor 2 calibration |
| `lun` | Logical unit number (1–5) |
| `nightDarkLimit`, `nightReportInterval`, `nightSampleAverages`, `nightSampleInterval` | Nighttime measurement scheduling |
| `queueDepth` | Data queue depth |
| `refGain`, `refOffset`, `refSelector` | Reference pyranometer calibration |
| `tbomChannel`, `tbomGain`, `tbomOffset` | Back-of-module temperature sensor |
| `tcellGain`, `tcellOffset` | Cell temperature sensor |
| `twilightDarkLimit`, `twilightReportInterval`, `twilightSampleAverages`, `twilightSampleInterval` | Twilight measurement scheduling |
| `version` | Config version number |

### UpdateDenoConfigInput — `denowatts-backend/src/assets/dto/asset.input.ts:288`

Extends `DenoConfig` with `serialNumber: String` (required, `@IsNotEmpty()`).

### BlockData — `denowatts-backend/src/assets/dto/asset.input.ts:297`

`PickType(DenoConfig, ['clip', 'dc', 'dcOhmic', 'denowattsDerate', 'denowattsTcoeffGain', 'energyDerate', 'expectedTcoeffGain'])` — 7 fields.

### CalibrationData — `denowatts-backend/src/assets/dto/asset.input.ts:311`

`PickType(DenoConfig, ['irr1Gain', 'irr1Offset', 'irr2Gain', 'irr2Offset', 'refGain', 'refOffset'])` — 6 fields.

### CreateMetricInput / UpdateMetricInput — `denowatts-backend/src/metrics/dto/metric.input.ts`

| Field | Type | Validation | Purpose |
|---|---|---|---|
| `name` | String | `@IsString` | Unique metric key |
| `displayName` | String | — | UI label |
| `unit` | String | — | SI unit |
| `channelPrefixes` | String[] | `@IsArray`, `@IsString each` | Channel name matching prefixes |
| `description` | String | Optional | Description text |
| `zone` | String | Optional | Zone assignment |
| `isKpi` | Boolean | Optional, `@IsBoolean` | KPI flag |
| `expression` | MetricExpressionItem[] | Optional, `@IsArray`, `@ValidateNested` | KPI calculation expression |
| `tags` | MetricTags[] | Optional, `@IsArray`, `@IsEnum each` | Tags |

`UpdateMetricInput` adds `_id: ID` with `@IsMongoId()`.

### CreateCompanyMetricInput — `denowatts-backend/src/metrics/dto/metric.input.ts:79`

| Field | Type | Validation | Purpose |
|---|---|---|---|
| `company` | String | `@IsString`, `@IsNotEmpty` | Company identifier |

### UpdateCompanyMetricInput — `denowatts-backend/src/metrics/dto/metric.input.ts:87`

`PartialType(CompanyMetric, InputType)` plus `_id: ID` with `@IsMongoId()`.

### GetChannelMetricsInput — `denowatts-backend/src/metrics/dto/metric.input.ts:94`

| Field | Type | Validation | Purpose |
|---|---|---|---|
| `channelId` | String | `@IsString`, `@IsNotEmpty` | Channel identifier |
| `site` | ID | `@IsMongoId`, `@IsNotEmpty` | Site ObjectId |

---

## Business rules (cited) {dev}

- Soft delete via `deletedAt` field — no asset is ever hard-deleted through the public API. The "delete" action in the UI calls `updateAsset` with `deletedAt: new Date()`. — `denowatts-backend/src/assets/services/assets.service.ts:86`
- Serial number must be globally unique across all non-deleted DENO and AUX_PYRANOMETER assets. — `assets.service.ts:87`
- MAC address must be globally unique across all non-deleted RADIO and GATEWAY assets. — `assets.service.ts:104`
- Serial number must be globally unique across all non-deleted MODEM assets. — `assets.service.ts:120`
- A DENO asset flagged as `RETIRED` cannot have a radio paired (UI enforces this at create time; radio field is forcibly set to null). — `denowatts-portal/src/features/settings/asset-management/components/CreateDenoAsset.tsx:116`
- When a DENO asset's `serialNumber` or `model` is updated, all channels with a matching `config.serialNumber` are updated in the same transaction to keep channel config in sync. — `assets.service.ts:548`
- Calibration certificate paths are stored as filenames only in MongoDB. The full pre-signed S3 download URL is generated at query time by `StorageService`. Path pattern: `assets/{assetId}/{certificate}` — `assets.service.ts:65`
- All Python Matrix proxy calls authenticate using `PYTHON_SERVER_SECRET` from environment config — `assets.service.ts:568`
- Non-SuperAdmin users must have a `company` field on their user record to use any paginated or single-asset query; otherwise `ForbiddenException` is thrown. — `assets.service.ts:181`
- Metric names must be unique; attempting to create a duplicate throws `BadRequestException`. — `metrics.service.ts:144`

---

---

## Asset list pipeline {dev}

The asset list is built by a dedicated, type-aware aggregation rather than a blanket set of joins — `denowatts-backend/src/assets/pipelines/asset-list.pipeline.ts`.

- **Pagination happens before enrichment.** A `__PREPAGINATE__` marker tells `mongoose-aggregate-paginate-v2` which stages run *after* the page is sliced, so the enrichment `$lookup`s join at most `limit` documents instead of the whole collection.
- **Joins are per type.** `JOINS_BY_TYPE` declares exactly which enrichments each asset type owns — DENO gets `radio` + `channel`, RADIO gets `deno`, GATEWAY and MODEM get `channel`, AUX_PYRANOMETER gets none. Nothing joins what it does not need.
- **Only GATEWAY, DENO and MODEM rows carry a `channelInfo` summary** (`CHANNEL_BACKED_TYPES`).
- **Free-text search is per type too.** `SEARCH_FIELDS` splits each type's searchable fields into `own` (on the asset document) and `joined` (requires a join, which must therefore run *before* pagination) — e.g. searching a RADIO matches its own `macAddress` plus the joined `denoInfo.serialNumber` / `denoInfo.model`.

---

## Serial-number normalization {dev}

Serial numbers are normalized on the way in: `upperCaseTransform` trims and upper-cases any string value, applied via `@Transform` on the schema's serial-number fields — `denowatts-backend/src/common/utils/string.ts:7-8`, `denowatts-backend/src/assets/schemas/asset.schema.ts:270`. The same transform is applied across the channel config schemas (see [[channels]]), so serials store and match consistently regardless of how they were typed.

## Data touched {dev}

- `assets` collection — full CRUD — `denowatts-backend/src/assets/services/assets.service.ts`
- `assets.config` — stored as `SchemaTypes.Mixed`; structure varies by `type` — `denowatts-backend/src/assets/schemas/asset.schema.ts:247`
- `assets.calibrations` — array of `{ date, certificate }` embedded docs — `assets.schema.ts:257`
- `assets.deletedAt` — soft-delete marker; presence/absence is the active filter — `assets.service.ts:94`
- `channels` collection — read-only in assets module: `findOne({ 'config.serialNumber': ... })` to get channel/site info; `updateMany` when a DENO serial/model changes — `assets.service.ts:365`
- `metrics` collection — schema declared here (`denowatts-backend/src/assets/schemas/metric.schema.ts`); full CRUD lives in `MetricsModule`, see [[metrics]]
- `companymetrics` collection — full CRUD via CompanyMetricService; `$lookup` from metrics aggregation — `denowatts-backend/src/assets/schemas/company-metric.schema.ts`

---

## Edge cases & gotchas {dev}

- **Two `CreateAssetInput` definitions exist.** `dto/create-asset.input.ts` and `dto/asset.input.ts` both export a class of that name. The resolver imports from `dto/asset.input.ts` which is the current, correct version (omits `_id`, `deletedAt`, `config` replaced with typed wrapper). The file at `dto/create-asset.input.ts` appears to be an older version. — `assets.resolver.ts:16`

- **Config union requires a wrapper at input, but is stored flat.** The GraphQL input accepts `AssetConfigInput { gatewayConfig?, denoConfig?, ... }` because GraphQL cannot represent a discriminated union as input. The service switch extracts the correct sub-object and stores only that directly as `asset.config`. On read, `AssetConfigUnion` resolves the GraphQL union type based on `config.type`. — `assets.service.ts:132`

- **`cellularId` vs `simIccid` for Lattigo API.** `simIccid` = Lattigo `device_name` = the field used for all Lattigo API calls. `cellularId` = Lattigo's internal numeric `id` = only for constructing Lattigo portal URLs (`https://www.lattigo.com/devices/{cellularId}`). Do not use `cellularId` for API calls. — backend CLAUDE.md

- **The geo index `coordinates: '2dsphere'` is defined on the schema but `coordinates` is not a `@Prop()` field.** The index will be created but has no functional data path currently. This is likely legacy or intended for future use. — `assets.schema.ts:342`

- **`radioInfo` and `radio` field duality for DENO in paginated results.** The paginated query populates `radio` (which becomes an object `{ _id, macAddress }`), then copies it to `radioInfo`, then strips the populated object back to just the ObjectId for `radio`. This is to return both the raw ID and the resolved radio info in the same response object without changing the Mongoose model. — `assets.service.ts:405`

- **Soft delete is UI-inaccessible for most types.** The delete button in all asset tab list components is rendered but hidden (`className='hidden'`) — `DenoAsset.tsx:277`, `ModemAsset.tsx:339`. The delete action was implemented but is not yet exposed to end users.

- **MODEM search includes a site-name lookup.** A text search in the MODEM tab triggers `sitesService.searchAssetsSites()` and then queries `channels` by site to find serial numbers — this is a multi-collection read for a single search keystroke. — `assets.service.ts:283`

- **`serialNumber` filter in `findOne` uses case-insensitive regex**, not an exact match. This means `findOne({ serialNumber: "ABC123" })` will also match `"abc123"` or `"Abc123"`. — `assets.service.ts:429`

- **`dto/metric.input.ts` is a re-export passthrough in the assets module.** `denowatts-backend/src/assets/dto/metric.input.ts` simply does `export * from '../../metrics/dto/metric.input'`. The actual source of truth is `denowatts-backend/src/metrics/dto/metric.input.ts`.

- **`metric.schema.ts` in the assets module is also a re-export.** `denowatts-backend/src/assets/schemas/metric.schema.ts` re-exports everything from `denowatts-backend/src/metrics/schemas/metric.schema.ts`. There is no separate metric schema in the assets module itself.

- **The duplicate `MetricsService` / `MetricsResolver` in this module are gone.** They were never registered in `AssetsModule`, so their GraphQL operations were never live; the copies in `src/assets/` have been deleted and the canonical pair lives in `src/metrics/` (see [[metrics]]). The earlier uncertainty here is resolved. — `denowatts-backend/src/assets/assets.module.ts:28`

- **The `denoInfo` and `radioInfo` filter fields in `AssetsPaginateFilterInput` have their service-side logic commented out.** The service reads `denoInfo` from the input but only uses `denoInfo.model` / `denoInfo.serialNumber` when fetching the DENO paired to a RADIO asset (step 5 of `findByPaginate`). The original filter-based approach is commented out with `// if (denoInfo?.model...)` at `assets.service.ts:314`. — `assets.service.ts:302`

---

## Solar & platform terminology {dev}

- **Asset** — one physical piece of hardware in inventory; linked to its live data stream (channel) by serial number.
- **Deno** — the Denowatts wireless reference sensor (irradiance + temperature); pairs with a **Radio** asset via the `radio` self-reference.
- **Radio** — the wireless link unit for a Deno, identified by MAC address (and `macPreamble`).
- **Aux pyranometer** — an auxiliary irradiance sensor; its config carries a `calibrationFactor`.
- **Gateway (Denobox)** — the on-site data-acquisition box; its config holds RTU serial-port settings and a `socketxpId`.
- **Modem / ICCID / IMEI** — the cellular backhaul device; `simIccid` is the SIM's unique id (and the Lattigo `device_name`), `imei` identifies the modem hardware. `cellularId` is Lattigo's internal id, for portal URLs only.
- **Calibration record / certificate** — a dated calibration entry whose certificate file is stored privately in S3 and served via pre-signed URLs.
- **Flag** — the asset's condition status: `GOOD`, `WATCH`, `REPLACE`, `REPLACE_URGENT`, `MAINTENANCE_REQUIRED`, `RETIRED`.
- **Metric** — a named data signal (e.g. irradiance, energy) with display name, unit, and `channelPrefixes` scoping which channel types report it.
- **KPI metric** — a computed metric whose `expression` array combines metrics, operators, numbers, and site properties.
- **Company metric alias** — a per-company display name for a global metric, stored in `companymetrics` and surfaced as `companyWiseName`.
- **Matrix service** — the external Python service (`matrix.denowatts.com`) the backend proxies to for live Deno firmware reads/writes/resets.

For the full domain vocabulary, see [[solar-glossary]].

---

**Related flows:** [[settings]] · [[field-setup]] · [[site]] · [[channels]] · [[metrics]] · [[solar-glossary]]
