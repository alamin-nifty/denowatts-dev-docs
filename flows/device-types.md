# Device Types

**What it does (business):** Device Types is a read-only reference catalog of every kind of channel/sensor signal the platform understands, organized as a three-level taxonomy (Category → Major → Minor) with a dotted numeric `prefix` (e.g. `1.2.3`). The prefix is the canonical key used across the app to classify Modbus channels, match channels in the Virtual Site Builder, group metrics, and configure alarms. Each entry optionally names a "key metric" — the primary measurement that device type produces. The catalog is static lookup data (the platform only reads it; there is no create/update/delete API in this module).

**Entry point(s):**
- UI page — `denowatts-portal/src/pages/device-types/DeviceTypesPage.tsx`, route `/device-types` (`denowatts-portal/src/router.tsx:609-615`).
- Header dropdown menu item "Device Types" (menu key `5`) — `denowatts-portal/src/common/components/Header.tsx:479-486`, with the active-key mapping at `Header.tsx:420`.
- The same `deviceTypes` query is consumed (without a dedicated page) by Site Builder, Modbus channel config, the Modbus Template settings, Metrics, and the Global Alarm config — see "Consumers" below.

## GraphQL API surface

The entire module exposes a **single query and no mutations**. Source: `denowatts-backend/src/device-types/device-types.resolver.ts`.

### Query: `deviceTypes`
- Signature — `denowatts-backend/src/device-types/device-types.resolver.ts:11-14`
  ```graphql
  deviceTypes: [DeviceType!]!
  ```
- **Arguments:** none.
- **Auth:** the whole resolver class is annotated `@Public()` (`device-types.resolver.ts:6`), so this query bypasses the global auth guard — no JWT/token is required to call it. (`@Public()` sets metadata `isPublic=true`; see `denowatts-backend/src/common/decorators/public.decorator.ts`.) Note the UI page is still only reachable by logged-in users because the `<App />` shell redirects anonymous users to `/signin` (`denowatts-portal/src/App.tsx:79-94`) — but the GraphQL endpoint itself is open. See "Edge cases & gotchas".
- **Resolver body:** delegates directly to `deviceTypesService.findAll()` (`device-types.resolver.ts:13`). No argument parsing, no mapping, no auth/context use.
- **Return type fields** (`DeviceType` ObjectType — `denowatts-backend/src/device-types/schemas/device-types.schema.ts:5-39`):

  | GraphQL field | GraphQL type | Nullable | Description (from `@Field`) |
  |---|---|---|---|
  | `categoryId` | `Int` | no | The category ID of the device type |
  | `category` | `String` | no | The category of the device type |
  | `majorId` | `Int` | no | The major ID of the device type |
  | `major` | `String` | no | The major of the device type |
  | `minorId` | `Int` | no | The minor ID of the device type |
  | `minor` | `String` | no | The minor of the device type |
  | `prefix` | `String` | no | The prefix of the device type |
  | `keyMetric` | `String` | yes (`nullable: true`) | The key metric of the device type |

  Note: `_id`, `createdAt`, and `updatedAt` exist on the Mongo document (the schema uses `timestamps: true`) but are **not** declared with `@Field`, so they are not part of the GraphQL type and cannot be selected. The frontend never requests them.

- **Frontend query document** — `denowatts-portal/src/graphql/queries/deviceTypeQueries.ts:3-16`, exported as `GET_DEVICE_TYPES`. It selects all eight fields (`categoryId, category, majorId, major, minorId, minor, prefix, keyMetric`). Generated TS type `DeviceTypesQuery` lives at `denowatts-portal/src/graphql/__generated__/graphql.ts:7890`.

## Services

### DeviceTypesService — `denowatts-backend/src/device-types/device-types.service.ts`

Injected with the Mongoose model for `DeviceType` via `@InjectModel(DeviceType.name)` (`device-types.service.ts:8-11`). The model is registered in the module with `MongooseModule.forFeature` (`device-types.module.ts:8`), bound to collection name `devicetypes` (Mongoose pluralizes/lowercases the class name `DeviceType`).

#### `findAll(): Query<DeviceTypeDocument[]>`
- **Logic:** one line — returns `this.deviceTypeModel.find().sort({ prefix: 1 })` (`device-types.service.ts:13-15`). No filter (returns the entire collection), sorted ascending by `prefix`.
- **DB reads:** full scan / read of the `devicetypes` collection. Fields read: all (no projection).
- **Sort:** `{ prefix: 1 }` — ascending lexicographic on the string `prefix`. This is a string sort, so ordering is alphabetical-by-character, not numeric (e.g. `"1.10"` sorts before `"1.2"`). The frontend table relies on this server-side ordering for its `rowSpan` grouping logic (see Consumers / gotchas).
- **Side effects:** none.
- **Throws:** nothing explicitly; only propagates Mongoose/connection errors. No not-found handling (an empty collection yields `[]`).
- **Return:** a Mongoose `Query` (the resolver returns it directly; NestJS/Mongoose resolves the thenable to an array of `DeviceTypeDocument`).

> There are **no** create/update/delete service methods. The catalog is seeded/maintained outside this module (e.g. DB seeding or migrations), not through the API.

#### Unit test
`denowatts-backend/src/device-types/device-types.service.spec.ts` covers only `findAll`: it asserts `find()` is called with no args and `.sort({ prefix: 1 })` is applied, returning the mocked rows (`device-types.service.spec.ts:53-68`). Note the test's mock fixtures use a `{ name, prefix, description }` shape (`device-types.service.spec.ts:14-31`) that does **not** match the real schema (`category/major/minor/...`) — the test mocks the model, so the shape mismatch is harmless but is misleading documentation of the real document shape.

## Schemas

### DeviceType — `denowatts-backend/src/device-types/schemas/device-types.schema.ts`

Dual-purpose class: `@ObjectType()` (GraphQL) + `@Schema({ timestamps: true })` (Mongo). `timestamps: true` adds `createdAt`/`updatedAt`. Collection: `devicetypes`. Document type alias `DeviceTypeDocument = HydratedDocument<DeviceType>` and `DeviceTypeSchema = SchemaFactory.createForClass(DeviceType)` (`schema.ts:41-42`).

| Field | Type | Required | Indexed | GraphQL `@Field` | Purpose |
|---|---|---|---|---|---|
| `categoryId` | `number` | yes (`required: true`) | no | `Int` | Numeric ID of the top-level category |
| `category` | `string` | yes | no | `String` | Top-level category label (e.g. an equipment class) |
| `majorId` | `number` | yes | no | `Int` | Numeric ID of the major group |
| `major` | `string` | yes | no | `String` | Major group label |
| `minorId` | `number` | yes | no | `Int` | Numeric ID of the minor type |
| `minor` | `string` | yes | no | `String` | Minor (most specific) type label |
| `prefix` | `string` | yes, **`unique: true`** | yes (unique index) | `String` | Canonical dotted key (e.g. `1.2.3`); the join key used everywhere else |
| `keyMetric` | `string` | no (`required: false`) | no | `String` (`nullable: true`) | Name of the primary metric this device type produces; optional |
| `createdAt` | `Date` | auto | no | not exposed | Mongoose timestamp |
| `updatedAt` | `Date` | auto | no | not exposed | Mongoose timestamp |
| `_id` | `ObjectId` | auto | yes (default `_id` index) | not exposed | Mongo document id |

**Indexes:** only `prefix` carries an explicit index, created by `unique: true` on `@Prop` (`schema.ts:33`). That unique constraint is the module's single integrity rule — no two device types may share a `prefix`. There is no compound index on `categoryId/majorId/minorId`.

## DTOs

**None.** This module has no input DTOs and no `dto/` folder — the only query takes no arguments, and there are no mutations. The "input/validation" section of the standard template is not applicable here.

## Business rules
- `prefix` is globally unique — enforced by `unique: true` on the schema prop. `denowatts-backend/src/device-types/schemas/device-types.schema.ts:33`.
- All taxonomy fields except `keyMetric` are required; `keyMetric` is optional/nullable. `schema.ts:9-38`.
- Results are always returned for the whole collection sorted ascending by `prefix` (no pagination, no filtering server-side). `denowatts-backend/src/device-types/device-types.service.ts:14`.
- The query is intentionally public (no auth). `denowatts-backend/src/device-types/device-types.resolver.ts:6`.
- Read-only by design: the module provides no mutation to create/edit/delete device types. `denowatts-backend/src/device-types/device-types.resolver.ts` (entire file is one query).

## Data touched
- `devicetypes.*` — full read, sorted by `prefix` asc, on every `deviceTypes` query. `device-types.service.ts:14`.
- `devicetypes.prefix` — read as the join/match key by consumers; unique-indexed. `schema.ts:33`.
- No writes occur anywhere in this module.

## Consumers (how `prefix`/`major`/`keyMetric` are used elsewhere)

The `deviceTypes` query is shared lookup data. Key consumers (all frontend, all read-only):

- **Device Types page (this module's page)** — `denowatts-portal/src/pages/device-types/DeviceTypesPage.tsx`. Renders an Ant Design `Table` with columns Category, Major, Minor, Prefix, Key Metric (`DeviceTypesPage.tsx:84-126`). A text search box filters client-side across `category/major/minor/prefix` (case-insensitive `includes`, `DeviceTypesPage.tsx:34-49`). Rows are merged with `rowSpan` on the Category and Major columns via `getRowSpan` (`DeviceTypesPage.tsx:64-82`), which **assumes rows are already grouped/contiguous** — this only looks right because the service returns them sorted by `prefix`. `keyMetric` renders as `-` when null (`DeviceTypesPage.tsx:124`). `rowKey` is the `prefix` (`DeviceTypesPage.tsx:172`), reinforcing prefix uniqueness. Pagination is disabled — the whole catalog renders at once.
- **Virtual Site Builder** — matches a Modbus channel id to the best device type by longest-matching dotted prefix: `findBestDeviceTypeForChannelId` sorts device types by normalized prefix length desc and returns the first whose prefix equals the channel id or is a dotted-prefix-of it (`denowatts-portal/src/pages/dashboard/site/site-builder/utils/deviceTypeChannelMatching.ts:14-28`; `prefixMatchesChannelId` at `:6-12` strips trailing dots and checks `c === p || c.startsWith(p + '.')`). Wired via `SiteBuilderPage.tsx:306-307` → `useChannelPaletteData.ts:80-85` → `buildChannelPillSections.ts`.
- **Channel Modbus config** — `denowatts-portal/src/pages/dashboard/site/channel-configuration/components/Modbus.tsx:86,337` looks up a device type by prefix.
- **Modbus Template settings** — `ModbusTemplate.tsx`, `ModbusTemplateTable.tsx`, `ModbusTemplateModal.tsx`, `AddMetricModal.tsx`, `FilterModal.tsx` under `denowatts-portal/src/pages/dashboard/settings/modbus-template/components/`. `AddMetricModal.tsx:92-110` derives a unique list of `major` labels, each mapped to a two-segment prefix (`<seg0>.<seg1>`) for use as a select value. (Several of these call `refetchQueries: [GET_DEVICE_TYPES, ...]` even though no device-type mutation exists — a harmless over-refetch.)
- **Metrics page** — `denowatts-portal/src/pages/metrics/MetricsPage.tsx:99-100,258` resolves a device type per metric.
- **Global Alarm config** — `denowatts-portal/src/pages/dashboard/settings/global-alarm/components/AlarmConfigTable.tsx:144,172-183` builds a de-duplicated device-type option list.

## Edge cases & gotchas
- **Public GraphQL query vs. authed UI.** `deviceTypes` is `@Public()` on the backend (`device-types.resolver.ts:6`) so anyone can query it directly, but the only UI page (`/device-types`) is behind the `<App />` redirect-to-signin effect (`App.tsx:83-92`). The catalog entry says "Accessible to all authenticated users," which is true for the page but understates that the backend endpoint itself is unauthenticated.
- **String sort, not numeric.** Sorting on the string `prefix` means dotted versions don't sort numerically (`"1.10" < "1.2"`). The Device Types table's row-merge (`rowSpan`) logic depends on contiguous grouping and assumes this server order; resorting client-side could break the visual grouping.
- **No projection / pagination.** The whole `devicetypes` collection is read and shipped on every call, and the page renders all rows (pagination disabled). Fine while the catalog is small.
- **No write path.** There is no admin UI or mutation to manage device types from the app; entries are maintained out-of-band (seed/migration/DB). The `refetchQueries: [GET_DEVICE_TYPES]` calls in the Modbus Template components are therefore no-ops with respect to changing the data — they just re-read it.
- **Unexposed timestamp/`_id` fields.** `createdAt`/`updatedAt`/`_id` exist in Mongo but aren't `@Field`-decorated, so they're invisible to GraphQL clients.
- **Spec fixture mismatch.** The unit test fixtures (`{ name, prefix, description }`) don't match the real schema shape; they don't reflect actual document structure and shouldn't be used as a field reference. `device-types.service.spec.ts:14-31`.

**Related flows:**
- [channels.md](./channels.md) — Modbus channels are classified by matching their channel id against a device type `prefix`.
- [field-setup.md](./field-setup.md) / Site Builder — uses `findBestDeviceTypeForChannelId` to assign device types during channel setup.
- [metrics.md](./metrics.md) — metrics are associated with device types; `keyMetric` names the primary metric.
- [assets.md](./assets.md) — physical assets (gateways/modems/denos) vs. this signal-type taxonomy.
- [alarm-config.md](./alarm-config.md) — global alarm config builds option lists from device types.
- [settings.md](./settings.md) — the Device Types page is reached from the settings/header menu (menu key `5`).
