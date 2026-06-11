---
title: Metrics
owner: alamin-nifty
status: draft
version: 2
updated_at: 2026-06-10
---

# Metrics

A **metric** is one named quantity the platform measures or computes — energy produced, AC power, irradiance, a temperature, an availability percentage, a scaling factor. The metrics catalog is the platform's shared vocabulary: every metric pairs a machine name with a human-friendly display name and a unit, notes which kinds of devices produce it, and can carry classification tags. Charts, reports, alarms, and raw data all refer to measurements by these names.

Some metrics are not measured at all but **calculated**: a KPI metric carries a formula built from other metrics, numbers, and site properties (like nameplate capacity), and the reporting engine evaluates it on the fly. Companies can also have their own preferred name for any metric, which the platform substitutes when showing data to that company.

> **Reading this doc:** use the **Business / Developer** switch at the top. *Business* explains what metrics are, how the catalog is organized, and who can change it. *Developer* adds the full GraphQL surface, services, schemas and DTOs, a module-duplication finding, consumer map, file references, and a solar-terminology primer.

---

## Why this matters

Every number anyone sees in the product traces back to a metric definition. If a metric's unit or display name is wrong, it's wrong on every chart, report, and alarm that uses it. Because everything joins on the metric's machine name, the catalog is foundational data — renaming or duplicating a metric ripples across the whole platform, which is why creation is tightly restricted and names must be unique.

---

## What a metric definition contains

In plain terms, each catalog entry records:

- **A machine name** — the unique key everything else joins on (never shown to end users).
- **A display name and unit** — what people actually see (e.g. a label plus kWh or W/m²).
- **Which device families produce it** — a list of channel-namespace prefixes, so filtering by a device family finds all of its metrics.
- **Tags** — classifications like expected/learned/predicted, instantaneous/cumulative, internal/external, outage types.
- **An optional description and zone** — free text and an analytical-zone scope.
- **For KPIs: a formula** — an ordered expression of metrics, arithmetic operators, numbers, and site properties.
- **Optional plausible value bounds** — a min/max range can be entered in the admin UI, but these currently do not save (a known incomplete feature, flagged for review).

---

## Per-company display names

A company can have its own preferred name for a metric (client phrasing). These translations are stored separately per company, and when the catalog is fetched on behalf of a company, the platform injects the company's name alongside the standard one. The translation never alters the metric itself — it's an overlay applied at read time.

---

## KPI metrics

KPI metrics are derived values: instead of being read from a sensor, they're computed from a formula — for example, one metric divided by another times 100 to get a percentage. Formulas can also reference site properties such as nameplate capacity or power rate. When a report requests a KPI, the reporting engine automatically pulls in whatever underlying metrics the formula needs, even if the requester didn't ask for them explicitly.

---

## Who can do what

- **Anyone (even without signing in)** can read the metric catalog — the list queries are public.
- **Any signed-in user** can view live channel metrics, scaling-factor lists, and the unit list; updating an existing metric also only requires being signed in.
- **Platform super-admins only** can create new metrics and use the naming helpers (prefix catalog, next-name suggestion).
- **Company name translations** are managed through their own separate operations.

---

## The rules that matter

- **Metric names are globally unique** — a duplicate name is rejected at creation, with a database constraint as backstop.
- **Names are required and trimmed** — an empty name is rejected.
- **Scaling factors are recognized purely by naming convention** — any metric whose name starts with "sf" is treated as a scaling factor.
- **Company-specific names are never stored on the metric** — they're computed at query time from the per-company translation list.
- **Filtering by device family is hierarchical** — asking for a parent namespace also matches metrics tagged with its sub-namespaces.
- **For developers:** there is a known code-duplication finding in this module (a dead second copy of the logic that drifts from the live one) — details in the developer view.

---

## Entry points {dev}
- Metric admin (CRUD): Settings → Metrics Management — `denowatts-portal/src/pages/dashboard/settings/metrics-management/MetricsManagementPage.tsx`, route `/settings/metrics-management` (SuperAdmin only, wrapped in `ProtectedRoute` — `denowatts-portal/src/router.tsx:426`).
- Standalone read-only metric library: route `/metrics` — `denowatts-portal/src/pages/metrics/MetricsPage.tsx` (`denowatts-portal/src/router.tsx:606`).
- Channel-status "live metrics" table: `denowatts-portal/src/pages/dashboard/status/channel-status/components/ChannelMetricsTable.tsx` (consumes `getChannelMetrics`).
- Modbus template builder uses `getMetricPrefixes` + `lastMetricName` for auto-naming: `denowatts-portal/src/pages/dashboard/settings/modbus-template/components/AddMetricModal.tsx`.

---

## ⚠️ Module duplication note {dev}

There are **two** `MetricsResolver` + `MetricsService` class pairs in the backend, with byte-for-byte near-identical logic:

| Location | Status |
|---|---|
| `denowatts-backend/src/metrics/metrics.resolver.ts` + `metrics.service.ts` | **ACTIVE.** Registered as providers in `MetricsModule` (`src/metrics/metrics.module.ts:25`), and `MetricsModule` is imported in `AppModule` (`src/app.module.ts:39,155`). This is the live GraphQL implementation. |
| `denowatts-backend/src/assets/metrics.resolver.ts` + `metrics.service.ts` | **DEAD CODE.** Neither class is referenced by `AssetsModule` (`src/assets/assets.module.ts:28` providers list contains only `AssetsResolver, AssetsService, CompanyMetricResolver, CompanyMetricService`) nor by any other module. A repo-wide grep for `MetricsResolver`/`MetricsService` shows the assets copies are imported only by their own spec file (`src/assets/metrics.service.spec.ts`). They are never instantiated by Nest, so their GraphQL operations are never wired into the schema. |

How the confusion is avoided at runtime: the two resolvers register the **same GraphQL operation names** (`metrics`, `updateMetric`, `getChannelMetrics`, `scalingMetrics`, `createMetric`, `getMetricPrefixes`, `lastMetricName`, `metricUnits`). If both were registered, Apollo would throw a duplicate-field error at schema build. Because only the `src/metrics/` resolver is in a registered module, there is no collision.

**The schema and DTOs are genuinely shared, not duplicated:**
- `src/assets/schemas/metric.schema.ts` is a **pure re-export** of `src/metrics/schemas/metric.schema.ts` (its own header comment: *"Single source of truth: metric model lives in `src/metrics/schemas/metric.schema.ts`"*).
- `src/assets/dto/metric.input.ts` is a one-line re-export: `export * from '../../metrics/dto/metric.input';`.

So `src/assets/schemas/company-metric.schema.ts` and the (dead) assets services keep stable import paths while the real Metric model lives under `src/metrics/`.

**Behavioural drift between the two service copies** (the active one is the source of truth, but noting differences for anyone reading the dead copy):
- Active `src/metrics/metrics.service.ts` adds two methods the assets copy lacks: `paginate()` (powers `metricsWithPaginate`) and uses `.toObject()` mapping on returns.
- Active `findAll`/`getScalingMetrics`/`create`/`update` map documents through `.toObject()`; the assets copy returns raw Mongoose docs.
- Active resolver's `createMetric` returns `Metric`; the dead assets resolver returns `CreateMetricResponse` (a `PickType` subset). The active resolver also adds the `metricsWithPaginate` query (`src/metrics/metrics.resolver.ts:34`), which the assets resolver does not have.

Recommendation flagged for humans: delete `src/assets/metrics.resolver.ts`, `src/assets/metrics.service.ts`, and `src/assets/metrics.service.spec.ts` to remove dead, drifting duplicates. (Do not delete `src/assets/schemas/metric.schema.ts` or `src/assets/dto/metric.input.ts` — those re-exports are still imported.)

---

## What a metric is {dev}

Defined in `denowatts-backend/src/metrics/schemas/metric.schema.ts`. Collection: `metrics` (Mongoose default pluralization; confirmed by the `$lookup ... from: "metrics"` in report and metrics aggregations).

A metric record carries:
- **`name`** — the machine key (e.g. `wattsAvgGlob`, `sf1`). This is what raw/rollup data documents store as object keys, and what everything else joins on. **Unique** (enforced by index).
- **`displayName`** — human label shown in UI.
- **`unit`** — unit string (e.g. `kWh`, `W/m²`).
- **`channelPrefixes`** — array of dotted prefixes (e.g. `denoa.energy`, `modbus.inverter`) declaring which channel namespaces emit this metric. Used for filtering (with hierarchical expansion — see `expandChannelPrefixes`).
- **`minRange` / `maxRange`** — optional plausible value bounds (GraphQL-only fields, **not persisted** — no `@Prop`; see gotchas).
- **`description`**, **`zone`** — optional free text (zone scopes a metric to an analytical zone/orientation).
- **`isKpi`** — boolean (default `false`). When true, the metric is a derived KPI computed from an `expression` rather than read directly from data.
- **`expression`** — ordered array of `MetricExpressionItem` defining the KPI calculation (e.g. `[metric, "/", metric, "*", 100]` → `(first / second) * 100`). Each item is one of: a `METRIC` (ObjectId ref), an `OPERATOR` (`+ - * /`), a `NUMBER` literal, or a `SITE_PROPERTY` key (`acNameplate`, `dcCapacity`, `powerRate`, …).
- **`tags`** — array of `MetricTags` enum classifying the metric (P50_GHI, RESOURCE_MODEL, PHYSICAL_MODEL, EXTERNAL, INTERNAL, RECOMMENDED, EXPECTED, LEARNED, PREDICTED, INSTANTANEOUS, CUMULATIVE, DC_OUTAGE, AC_OUTAGE).
- **`companyWiseName`** — NOT stored on the metric. It is a per-company translation/alias injected at query time from the `companymetrics` collection (see Services → `findAll`/`paginate`).
- **Timestamps:** `createdAt`/`updatedAt` (schema has `{ timestamps: true }`).

> Note: there is no explicit "aggregation type" field on the Metric schema itself. Aggregation method (SUM/AVG/etc.) is chosen per-request by report consumers (`MetricAggregationMethod` in the report module), not stored on the metric definition.

---

## GraphQL API surface {dev}

All operations are defined on `MetricsResolver` — `denowatts-backend/src/metrics/metrics.resolver.ts`. Company-translation operations live on a separate resolver in the assets module (see below).

### Query `metrics` → `[Metric]`
- Resolver: `findAll`, `src/metrics/metrics.resolver.ts:24`. Decorated `@Public()` (no auth required).
- Input: `getMetricsInput: GetMetricsInput` (nullable; defaults to `{}`).
- Returns: array of `Metric` (with `companyWiseName` populated when `company` is supplied).
- Service: `MetricsService.findAll`.

### Query `metricsWithPaginate` → `MetricPaginateResponse`
- Resolver: `paginate`, `src/metrics/metrics.resolver.ts:35`. `@Public()`.
- Input: `metricsPaginateFilterInput: MetricsPaginateFilterInput` (nullable; defaults to `{}`).
- Returns: `MetricPaginateResponse` = `PaginateType(Metric)` (`src/metrics/schemas/metric.schema.ts:179`) — `{ docs: [Metric], totalDocs, limit, page, totalPages, pagingCounter, hasPrevPage, hasNextPage, prevPage, nextPage }`.
- Service: `MetricsService.paginate`. Primary data source for the Metrics Management table.

### Mutation `updateMetric` → `Metric`
- Resolver: `update`, `src/metrics/metrics.resolver.ts:43`. No `@Roles`/`@Public` → requires a logged-in user (global `JwtAuthGuard`).
- Input: `updateMetricInput: UpdateMetricInput`. Resolver destructures `_id` out, passes the rest as the patch.
- Service: `MetricsService.update(_id, rest)`.

### Query `getChannelMetrics` → `[GetChannelMetricResponse]`
- Resolver: `getChannelMetric`, `src/metrics/metrics.resolver.ts:49`. Authenticated (no `@Public`).
- Input: `filter: GetChannelMetricsInput` (`{ channelId, site }`).
- Returns: metric definitions active on that channel, each augmented with the latest raw reading and its timestamp.
- Service: `MetricsService.getChannelMetrics`.

### Query `scalingMetrics` → `[ScalingMetricResponse]`
- Resolver: `getScalingMetrics`, `src/metrics/metrics.resolver.ts:54`. Authenticated.
- Input: none.
- Returns: metrics whose `name` starts with `sf` (scaling factors), projected to `{ _id, name, displayName }`.
- Service: `MetricsService.getScalingMetrics`.

### Mutation `createMetric` → `Metric`
- Resolver: `create`, `src/metrics/metrics.resolver.ts:60`. `@Roles(UserType.SUPER_ADMIN)`.
- Input: `createMetricInput: CreateMetricInput`.
- Service: `MetricsService.create`.

### Query `getMetricPrefixes` → `GetMetricPrefixesResponse`
- Resolver: `getMetricPrefixes`, `src/metrics/metrics.resolver.ts:66`. `@Roles(UserType.SUPER_ADMIN)`.
- Input: none.
- Returns: the `METRIC_PREFIX` settings document reshaped into `{ _id, setting, metricPrefixes: [{ name, displayName, unit }] }`.
- Service: `MetricsService.getMetricPrefixes`.

### Query `lastMetricName` → `LastMetricNameResponse`
- Resolver: `getLastMetricName`, `src/metrics/metrics.resolver.ts:72`. `@Roles(UserType.SUPER_ADMIN)`.
- Input: `name: String` (a base prefix).
- Returns: `{ lastMetricName, generatedMetricName }` — the highest-numbered existing metric for the prefix, plus the next suggested name.
- Service: `MetricsService.getLastMetricName`.

### Query `metricUnits` → `[String]`
- Resolver: `getDistinctUnits`, `src/metrics/metrics.resolver.ts:78`. Authenticated.
- Input: none.
- Returns: sorted, de-duplicated, trimmed list of all non-empty `unit` strings in the collection.
- Service: `MetricsService.getDistinctUnits`.

### Company-metric operations (assets module, ACTIVE)
These manage the per-company name translations used by `findAll`/`paginate`. Resolver: `denowatts-backend/src/assets/company-metric.resolver.ts` (`CompanyMetricResolver`), registered in `AssetsModule`. Service: `src/assets/company-metric.service.ts`.
- Query `companyMetric(_id)` → `CompanyMetric` — `findById`.
- Query `companyMetrics` → `[CompanyMetric]` (`@Public()`) — `find()` all.
- Mutation `createCompanyMetric(input: CreateCompanyMetricInput)` → `CompanyMetric` — creates `{ company }` only.
- Mutation `updateCompanyMetric(input: UpdateCompanyMetricInput)` → `CompanyMetric` — `findByIdAndUpdate(_id, rest, { new: true })`; this is how a company's `metrics: [{ metric, name }]` translation array is saved.
- Mutation `deleteCompanyMetric(_id)` → `CompanyMetric` — `findByIdAndDelete`.

### Report module (separate consumer-facing query)
- Query `reportMetrics` → `MetricsResponseDto` — `src/report/resolvers/report-metrics.resolver.ts:10`, delegates to `ReportService.getAvailableMetrics`. Returns the subset of metric definitions that actually appear in a site/channel's data over a date range (plus KPIs for site-level). See [report.md](report.md).

---

## Services {dev}

### MetricsService — `denowatts-backend/src/metrics/metrics.service.ts`

Constructor-injected dependencies (`:34`): `metricModel` (Metric), `channelModel` (Channel), `settingsModel` (Settings), `channelRawModel` (ChannelRaw), `channelsService` (ChannelsService), `dataOutService` (DeviceDataService — injected but **unused** in this file). Two cast accessors expose paginate plugins: `metricPaginateModel` (mongoose-paginate-v2) and `metricAggregatePaginateModel` (mongoose-aggregate-paginate-v2), `:44`/`:48`.

#### `expandChannelPrefixes(channelPrefixes?: string[]): string[]` — `:52` (private)
- Hierarchically expands each dotted prefix into all of its ancestor prefixes. E.g. `"a.b.c"` → `["a", "a.b", "a.b.c"]`. Trims input, drops empties, dedupes via a `Set`.
- Purpose: a query filtering on `denoa` should match metrics tagged with `denoa.energy`, etc. (broadening match up the namespace tree).

#### `findAll(filter?: GetMetricsInput)` → `Metric[]` — `:77`
- Strips `company` and `channelPrefixes` out of the filter; the remaining fields become a direct Mongo filter (`metricFilter`).
- If `channelPrefixes` present → expands them and adds `channelPrefixes: { $in: expandedPrefixes }` to the filter.
- **No `company`:** `metricModel.find(metricFilter)`, returns each doc via `metric.toObject?.()`.
- **With `company`:** runs an aggregation: `$match` (if any filter) → `$lookup` from `companymetrics` (pipeline `$match { company }`) into `matchedB` → `$unwind` (preserve empties) → `$addFields companyWiseName` = the `name` of the matched company-metric entry whose `metric` ObjectId equals this metric's `_id` (via nested `$filter`/`$map`/`$arrayElemAt`, falling back to `null`) → `$project { matchedB: 0 }`.
- DB reads: `metrics` collection; `companymetrics` collection (lookup). No writes.

#### `paginate(filter: MetricsPaginateFilterInput = {})` → paginated `Metric` — `:151`
- Defaults `limit = 10`, `page = 1`.
- Builds `baseMatch`: `channelPrefixes` → expanded `$in`; `tags` → `{ $in: tags }`; `search` (trimmed) → case-insensitive regex `$or` across `name`, `displayName`, `unit`, `description` (regex is escaped via `escapeRegExp`).
- **No `company`:** `metricPaginateModel.paginate(baseMatch, { limit, page, sort: { updatedAt: -1 }, lean: true })`.
- **With `company`:** same `companyWiseName` lookup aggregation as `findAll`, plus `$sort { updatedAt: -1 }`, fed to `metricAggregatePaginateModel.aggregatePaginate(aggregate, { limit, page })`.
- DB reads: `metrics`, `companymetrics`. No writes.

#### `create(input: CreateMetricInput)` → `Metric` — `:243`
- Trims `name`; throws `BadRequestException("Metric name is required")` if empty.
- `findOne({ name }).lean()` — if a metric with that name exists, throws `BadRequestException('Metric with name "..." already exists')`.
- Otherwise `metricModel.create(input)`; returns `.toObject()`.
- DB writes: inserts one `metrics` document. (The unique index on `name` is a second-line guard against races.)

#### `update(_id, input?: Partial<Metric>)` → `Metric | null` — `:258`
- `findByIdAndUpdate(_id, input, { new: true })`, returns `.toObject()`. No validation/uniqueness re-check here (renaming to a duplicate would be blocked only by the unique index).
- DB writes: updates one `metrics` document.

#### `getChannelMetrics(filter: GetChannelMetricsInput)` → `GetChannelMetricResponse[]` — `:264`
- Looks up the channel via `channelsService.findOne({ channelId, site })`; throws `BadRequestException("Channel not found")` if missing.
- Finds the **latest** raw record for that channel: `channelRawModel.findOne({ "metadata.channel": channel.channelId, "metadata.site": channel.site }).sort({ timestamp: -1 })`. If none / no timestamp → returns `[]`.
- Computes a lookback window ending at the latest timestamp:
  - **Modbus** (`source === MODBUS || MODBUS_LEGACY`): window = `reportInterval` (minutes, parsed from e.g. `"5m"`) × 2.5; defaults to 1 minute if no interval.
  - **Non-Modbus:** fixed 5-minute lookback.
- Fetches all raw records in `[startDate, endDate]` sorted ascending.
- Determines `activeMetricsKeys`:
  - Modbus: the names of `channel.config.metrics` where `enabled === true`.
  - Non-Modbus: every object key found across the raw records (`flatMap(Object.keys)`).
- Aggregates `metrics` matching `name $in activeMetricsKeys`, adds a `sortIndex` = position of the name in `activeMetricsKeys`, sorts by it (preserving channel-config order), strips `sortIndex`.
- For each metric, finds the raw record that has a truthy value for `metric.name` and attaches `channelLastRawRecord` (stringified value or `null`) and `lastReportedAt` (that record's timestamp or `null`).
- Wrapped in try/catch → any failure throws `BadRequestException("Failed to fetch channel metrics")` (so the "Channel not found" error is also swallowed/rethrown as the generic message).
- DB reads: `channels` (via ChannelsService), `channelraws` (latest + window), `metrics`. No writes.

#### `getScalingMetrics()` → `ScalingMetricResponse[]` — `:344`
- `metricModel.find({ name: { $regex: '^sf' } })` → metrics whose name starts with `sf` (scaling factors). Returns `.toObject()` for each. try/catch → `BadRequestException("Failed to fetch scaling metrics")`.
- DB reads: `metrics`. No writes.

#### `getMetricPrefixes()` → `GetMetricPrefixesResponse | null` — `:358`
- Reads the singleton settings doc `settingsModel.findOne({ setting: "METRIC_PREFIX" }).lean()`. Returns `null` if absent.
- Treats every key other than `_id`/`setting` as a prefix entry; for each, extracts `displayName` and `unit` if the value is an object with those string fields (else `null`).
- Returns `{ _id, setting, metricPrefixes: [{ name: key, displayName, unit }] }`.
- DB reads: `settings` collection (`Settings` schema is `strict: false`, collection `settings` — `src/status-logs/schemas/settings.schema.ts`). No writes.

#### `getLastMetricName(basePrefix: string)` → `LastMetricNameResponse` — `:403`
- Trims prefix; throws `BadRequestException("Prefix is required")` if empty.
- Aggregation over `metrics`: `$match name` starts-with prefix (case-insensitive, escaped) → `$addFields` extract trailing digits (`$regexFind \d+$`) and flag exact-prefix match → compute `num` (0 for the bare prefix, else the trailing integer, else 0) → `$sort num desc` → `$limit 1` → project `name, num`.
- If no match → `{ lastMetricName: null, generatedMetricName: prefix }`.
- Else next number = `1` if highest `num === 0`, otherwise `highest.num + 1`; returns `{ lastMetricName: highest.name, generatedMetricName: \`${prefix}${nextNum}\` }`.
- Purpose: auto-suggests the next sequential metric name (e.g. existing `sf3` → suggests `sf4`). Used by the Modbus AddMetricModal.
- DB reads: `metrics`. No writes.

#### `escapeRegExp(str)` — `:469` (private)
- Escapes regex metacharacters before building dynamic `RegExp`s (used by `paginate` search and `getLastMetricName`).

#### `getDistinctUnits()` → `string[]` — `:473`
- `metricModel.distinct("unit")`, filters to strings, trims, drops empties, sorts via `localeCompare`.
- DB reads: `metrics`. No writes.

### CompanyMetricService — `denowatts-backend/src/assets/company-metric.service.ts` (ACTIVE, supporting)
Thin CRUD over the `companymetrics` collection: `getCompanyMetrics()` (`find()`), `getCompanyMetric(_id)` (`findById`), `createCompanyMetric({ company })` (creates with only the `company` field), `updateCompanyMetric(_id, input)` (`findByIdAndUpdate ... { new: true }` — used to persist the `metrics` translation array), `deleteCompanyMetric(_id)` (`findByIdAndDelete`). No validation beyond what the schema/index enforce.

---

## Schemas {dev}

### Metric — `denowatts-backend/src/metrics/schemas/metric.schema.ts`
`@Schema({ timestamps: true, autoIndex: true })`. Collection `metrics`.

| Field | Type | Required | Indexed | Persisted (`@Prop`) | Purpose |
|---|---|---|---|---|---|
| `_id` | ObjectId (ID) | auto | PK | — | Identity |
| `name` | string | yes | **unique** (`.index({ name: 1 }, { unique: true })`, `:174`) | yes | Machine key joined on everywhere |
| `companyWiseName` | string | no | no | **no** (computed at query time) | Per-company translated label |
| `displayName` | string | yes | no | yes | Human label |
| `unit` | string | yes | no | yes | Unit string |
| `channelPrefixes` | string[] | yes (`@Prop required`) but GraphQL `nullable` | no | yes | Channel namespaces emitting this metric |
| `minRange` | number | no | no | **no `@Prop`** (GraphQL-only) | Lower plausibility bound — see gotcha |
| `maxRange` | number | no | no | **no `@Prop`** (GraphQL-only) | Upper plausibility bound — see gotcha |
| `description` | string | no | no | yes | Free text |
| `zone` | string | no | no | yes | Analytical zone scope |
| `isKpi` | boolean | no (default `false`) | no | yes (`default: false`) | Marks a derived KPI metric |
| `expression` | `MetricExpressionItem[]` | no (default `[]`) | no | yes (`default: []`) | KPI calculation definition |
| `tags` | `MetricTags[]` | no (default `[]`) | no | yes (`enum: MetricTags, default: []`) | Classification tags |
| `createdAt` / `updatedAt` | Date | auto | no | yes (timestamps) | Audit; `paginate` sorts by `updatedAt` |

#### MetricExpressionItem (embedded, `@Schema({ _id: false })`) — `:55`
| Field | Type | Required | Purpose |
|---|---|---|---|
| `type` | `MetricExpressionItemType` enum | yes | One of `METRIC`, `OPERATOR`, `NUMBER`, `SITE_PROPERTY` |
| `metric` | ObjectId (ref `Metric`) | no | Operand metric (when `type=METRIC`) |
| `operator` | string | no | `+ - * /` (when `type=OPERATOR`) |
| `value` | number (Float) | no | Literal (when `type=NUMBER`) |
| `siteProperty` | string | no | Site property key e.g. `acNameplate`, `dcCapacity`, `powerRate` (when `type=SITE_PROPERTY`) |

Expression order defines the calculation, e.g. `[metric, "/", metric, "*", 100]` ⇒ `(first / second) * 100`, evaluated per data row by the report engine.

#### Enums
- `MetricExpressionItemType` (`:17`): `METRIC`, `OPERATOR`, `NUMBER`, `SITE_PROPERTY`.
- `MetricTags` (`:28`): `P50_GHI`, `RESOURCE_MODEL`, `PHYSICAL_MODEL`, `EXTERNAL`, `INTERNAL`, `RECOMMENDED`, `EXPECTED`, `LEARNED`, `PREDICTED`, `INSTANTANEOUS`, `CUMULATIVE`, `DC_OUTAGE`, `AC_OUTAGE`.

#### `MetricPaginateResponse` — `:179`
`PaginateType(Metric)` — standard paginate envelope (`docs`, `totalDocs`, `limit`, `page`, `totalPages`, `pagingCounter`, `hasPrevPage`, `hasNextPage`, `prevPage`, `nextPage`). Return type of `metricsWithPaginate`.

### CompanyMetric — `denowatts-backend/src/assets/schemas/company-metric.schema.ts`
`@Schema({ timestamps: true, autoIndex: true })`. Collection `companymetrics`.

| Field | Type | Required | Indexed | Purpose |
|---|---|---|---|---|
| `_id` | ObjectId | auto | PK | Identity |
| `company` | string | yes | **unique** (`.index({ company: 1 }, { unique: true })`, `:40`) | Owning company name |
| `metrics` | `CompanyMetrics[]` | no | no | Per-metric translations |

`CompanyMetrics` (embedded, `_id: false`, `:10`): `metric` (ObjectId ref `Metric`, required) + `name` (string, required) — i.e. "for this company, metric X is locally called Y". This is the source of the computed `companyWiseName`.

> The Metric model is registered in three modules' `MongooseModule.forFeature`: `MetricsModule` (`src/metrics/metrics.module.ts:16`), `ReportModule` (`src/report/report.module.ts:46`), and via the re-export it backs `CompanyMetric` in `AssetsModule`. All point at the same `metrics` collection.

---

## DTOs — `denowatts-backend/src/metrics/dto/metric.input.ts` {dev}
(Re-exported unchanged from `src/assets/dto/metric.input.ts`.)

### UpdateMetricInput — `:8`
`PartialType(Metric, InputType)` plus a required `_id` (`@IsMongoId`). So every Metric field is optional except `_id`. No further validation beyond the inherited class-validator decorators on Metric.

### CreateMetricInput — `:15`
`OmitType(Metric, ["_id"], InputType)` — all Metric fields except `_id`. Inherits Metric's validators (e.g. `tags` `@IsEnum(MetricTags, { each: true })`, `expression` `@ValidateNested`). Note `name`/`displayName`/`unit`/`channelPrefixes` are `@Prop({ required: true })` but have **no** class-validator `@IsNotEmpty`, so emptiness for `name` is enforced manually in the service, not by the pipe.

### CreateMetricResponse — `:18`
`PickType(Metric, ["_id","name","displayName","unit","channelPrefixes","description","isKpi","tags"])`. (Only the **dead** assets resolver returns this; the active `createMetric` returns full `Metric`.)

### GetMetricsInput — `:30`
| Field | Type | Validation | Purpose |
|---|---|---|---|
| `company` | string? | `@IsString @IsOptional` | Inject company translations |
| `channelPrefixes` | string[]? | `@IsArray @IsString({each}) @IsOptional` | Prefix filter (expanded) |

### MetricsPaginateFilterInput — `:44`
| Field | Type | Validation | Purpose |
|---|---|---|---|
| `company` | string? | `@IsString @IsOptional` | Company translations |
| `channelPrefixes` | string[]? | `@IsArray @IsString({each}) @IsOptional` | Prefix filter |
| `search` | string? | `@IsString @IsOptional` | Regex search across name/displayName/unit/description |
| `limit` | number? | `@IsNumber @IsOptional` | Page size (default 10) |
| `page` | number? | `@IsNumber @IsOptional` | Page (default 1) |
| `tags` | `MetricTags[]?` | `@IsOptional @IsArray @IsString({each})` | Tag `$in` filter |

### GetChannelMetricsInput — `:94`
| Field | Type | Validation | Purpose |
|---|---|---|---|
| `channelId` | string | `@IsString @IsNotEmpty` | Channel business id |
| `site` | ObjectId (ID) | `@IsMongoId @IsNotEmpty` | Owning site |

### GetChannelMetricResponse — `:107`
Extends `Metric`, adds: `channelLastRawRecord` (string?, latest raw value as string) and `lastReportedAt` (Date?, timestamp of that value).

### ScalingMetricResponse — `:116`
`PickType(Metric, ["_id","name","displayName"])`.

### MetricPrefix / GetMetricPrefixesResponse — `:119` / `:131`
`GetMetricPrefixesResponse` = `{ _id, setting, metricPrefixes: [MetricPrefix] }`; `MetricPrefix` = `{ name, displayName, unit }` (all nullable). Shape of the `METRIC_PREFIX` settings doc reshaped by `getMetricPrefixes`.

### LastMetricNameResponse — `:143`
`{ lastMetricName?: string, generatedMetricName?: string }`.

### Company-metric DTOs
- `CreateCompanyMetricInput` (`:79`): `company` (string, `@IsNotEmpty`).
- `UpdateCompanyMetricInput` (`:87`): `PartialType(CompanyMetric)` + required `_id` (`@IsMongoId`).

---

## Consumers (who uses metric definitions) {dev}

Metric definitions are foundational; multiple modules read the `metrics` collection (joining by `name` or `_id`):

- **Report module** (heaviest consumer) — `denowatts-backend/src/report/`:
  - Registers the Metric model — `report.module.ts:46`.
  - `report.service.ts` injects `metricModel` (`:70`) and imports `Metric, MetricExpressionItem, MetricExpressionItemType` from `../metrics/schemas/metric.schema` (`:12`).
  - `getAvailableMetrics` (`report.service.ts:2223`, backing the `reportMetrics` query) discovers metric keys present in rollup/raw data via `$objectToArray`, then `$lookup from "metrics"` to resolve them to definitions; for `site` type it also includes `isKpi: true` metrics and falls back to returning all KPIs if no data exists.
  - KPI expression evaluation: fetches `isKpi: true` metrics with their `expression`, walks `MetricExpressionItem`s, and pulls in any operand metrics not explicitly requested (`report.service.ts:467`+).
  - `report/utils/metric-resolution.util.ts` `resolveMetricIdentifiers()` resolves mixed ObjectId/name identifiers to `{ names, displayNames, units, idToNameMap, idToUnitMap, isKpiByName }` in one or two queries, selecting `_id name displayName unit isKpi`.
  - Other report files referencing metrics: `report.processor.ts`, `dto/metrics-response.dto.ts`, `dto/metrics-input.dto.ts`, `dto/report-template.input.ts`, `dto/fleet-filter.dto.ts`, `types/`, `utils/units-aggregation.util.ts`, `utils/fleet-excel-prep.util.ts`, `utils/excel-generator.util.ts`, `services/fleet-summary.service.ts`, `services/fleet-excel.service.ts`, `services/report-template.service.ts`. See [report.md](report.md).
- **Data-out module** — `denowatts-backend/src/data-out/`:
  - `device-data.service.ts` accepts a comma-separated `metrics` string, builds a Mongo projection from those metric names (`:116`+), and rewrites legacy metric names via `getMetricsString`/`renameDocumentProperties` from `data/metrics-data.ts` (a static old-name→new-name map). It reads metric **names** as data keys, not the Metric collection directly. See [data-out.md](data-out.md).
- **Channels module** — Modbus channel configs embed per-channel `metrics` (name + enabled flag); `getChannelMetrics` cross-references those names against the Metric collection. See [channels.md](channels.md).
- **Assets module** — owns `CompanyMetric` (per-company name translations) and the dead duplicate metrics resolver/service. See [assets.md](assets.md).
- **Settings** — the `METRIC_PREFIX` document in the `settings` collection feeds `getMetricPrefixes`. See [settings.md](settings.md).

---

## Business rules (cited) {dev}
- Metric `name` is globally unique — enforced at app level in `create` and by a unique Mongo index — `src/metrics/metrics.service.ts:249`, `src/metrics/schemas/metric.schema.ts:174`.
- `name` is required and trimmed; empty names are rejected — `src/metrics/metrics.service.ts:244`.
- `update` does **not** re-validate name uniqueness in code; only the unique index would catch a duplicate rename — `src/metrics/metrics.service.ts:258`.
- Creating, reading prefixes, and suggesting next names are SuperAdmin-only (`@Roles(UserType.SUPER_ADMIN)`) — `src/metrics/metrics.resolver.ts:59,65,71`.
- `metrics` and `metricsWithPaginate` are `@Public()` (unauthenticated read) — `src/metrics/metrics.resolver.ts:23,34`.
- `companyWiseName` is derived per-company at query time, never stored on the metric — `src/metrics/metrics.service.ts:114,207`.
- Channel-prefix filters are hierarchically expanded before matching — `src/metrics/metrics.service.ts:52`.
- Scaling-factor metrics are identified purely by the `^sf` name convention — `src/metrics/metrics.service.ts:346`.
- `getChannelMetrics` lookback window differs by source: Modbus uses `reportInterval × 2.5` minutes, others a fixed 5 minutes — `src/metrics/metrics.service.ts:293`.
- KPI metrics carry an `expression`; their operands are auto-included by the report engine even if not explicitly requested — `src/report/report.service.ts:467`.

## Data touched {dev}
- `metrics.*` — full metric CRUD/read; unique `name` index; `paginate` sorts by `updatedAt` — `src/metrics/metrics.service.ts`, `src/metrics/schemas/metric.schema.ts`.
- `companymetrics.{company, metrics:[{metric,name}]}` — read via `$lookup` to compute `companyWiseName`; CRUD via `CompanyMetricService` — `src/metrics/metrics.service.ts:101`, `src/assets/company-metric.service.ts`.
- `settings` (doc `setting: "METRIC_PREFIX"`) — read-only for `getMetricPrefixes` — `src/metrics/metrics.service.ts:359`.
- `channels` — read to resolve a channel + its Modbus metric config in `getChannelMetrics` — via ChannelsService.
- `channelraws` — read latest + windowed raw records to attach live values to channel metrics — `src/metrics/metrics.service.ts:275,306`.

## Edge cases & gotchas {dev}
- **`minRange` / `maxRange` are not persisted.** They are declared as GraphQL fields on `Metric` with no `@Prop`, so `create`/`update` accept them in input and they appear in the schema, but Mongoose will not store them (no schema path). UI sends them (MetricsManagementPage `handleSubmit` includes `minRange`/`maxRange`) but they will not round-trip. **Flag for human review** — likely an intended-but-incomplete field.
- **Two duplicate resolver/service pairs** (see top section). The assets copies are dead but actively drift from the live ones; risk of someone editing the wrong file.
- **`getChannelMetrics` swallows the specific "Channel not found" error**: the inner `throw new BadRequestException("Channel not found")` is caught by the surrounding try/catch and rethrown as the generic `"Failed to fetch channel metrics"`, so the frontend never sees the specific cause.
- **`getMetricPrefixes` relies on `Settings` being `strict: false`** (collection `settings`) — arbitrary dynamic keys are treated as prefix entries; any non-object value yields `null` displayName/unit.
- **`createMetric` race:** the app-level duplicate check is a separate query from the insert; the unique `name` index is the real guard against concurrent inserts of the same name.
- **`update` returns `null`** when `_id` doesn't exist (GraphQL non-null `Metric` return could surface an error to the client in that case).
- **`dataOutService` is injected into `MetricsService` but never used** — dead dependency.
- **Distinct units / search are case-sensitive on storage**: `getDistinctUnits` only trims (does not normalize case), so `"kWh"` and `"kwh"` would be distinct entries; `paginate` search is case-insensitive.
- **Non-Modbus channel metric discovery** uses raw-record object keys, which include non-metric keys like `timestamp`/`metadata`; those simply won't match any metric `name` in the `$in` lookup, so they're filtered out implicitly.

---

## Solar & platform terminology {dev}

- **Metric** — a named, unit-bearing quantity the platform measures or computes; the catalog entry this module manages.
- **Machine name (`name`)** — the unique key (e.g. `wattsAvgGlob`, `sf1`) stored as object keys in raw/rollup documents and joined on everywhere.
- **Display name / unit** — the human-facing label and unit string (e.g. `kWh`, `W/m²`) shown in UI, charts, and reports.
- **Channel prefix** — a dotted namespace (e.g. `denoa.energy`) declaring which channel families emit a metric; filters are hierarchically expanded up the namespace tree.
- **KPI metric** — a derived metric (`isKpi: true`) computed from an `expression` rather than read from data.
- **Expression** — the ordered formula of a KPI: metric refs, operators (`+ - * /`), number literals, and site properties (`acNameplate`, `dcCapacity`, `powerRate`), evaluated per data row by the report engine. See [[report]].
- **Scaling factor (`sf`)** — a multiplier metric identified purely by the `^sf` name convention; surfaced via `scalingMetrics`.
- **Tags** — `MetricTags` enum values classifying a metric (EXPECTED, LEARNED, PREDICTED, INSTANTANEOUS, CUMULATIVE, DC_OUTAGE, AC_OUTAGE, …).
- **Company-wise name** — a per-company alias for a metric, stored in `companymetrics` and injected at query time as `companyWiseName`; never persisted on the metric.
- **Metric prefix catalog** — the `METRIC_PREFIX` settings document mapping base name prefixes to display names/units, used for auto-naming in the Modbus template builder. See [[settings]].
- **Raw record** — a `channelraw` document; `getChannelMetrics` attaches each metric's latest raw value and timestamp. See [[data-out]].

For the full domain vocabulary, see [[solar-glossary]].

---

**Related flows:** [[assets]] · [[report]] · [[data-out]] · [[channels]] · [[settings]] · [[status]] · [[device-types]] · [[solar-glossary]]
