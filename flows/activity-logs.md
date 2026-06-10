# Activity Logs (Audit Trail)

**What it does (business):** A system-wide, write-once audit trail. Every create / update / delete that goes through a Mongoose model on the main DB connection is automatically recorded as an `ActivityLog` document capturing *who* did it, *what* collection and document were touched, the request *payload*, and a structured *diff* of the change (with previous values). Only Super Admins can read the trail, through a paginated, filterable settings page.

**Entry point(s):**
- **Reading (UI):** Settings gear menu → "Activity Logs" → route `/settings/activity-logs` — `denowatts-portal/src/pages/dashboard/settings/activity-logs/ActivityLogsPage.tsx`. Super-Admin-gated by `ProtectedRoute` — `denowatts-portal/src/views/ProtectedRoute/ProtectedRoute.tsx:27-32`.
- **Writing (no UI, fully automatic):** A global Mongoose connection plugin installs save/update/delete hooks on every schema. There is **no producing endpoint, decorator, or interceptor and no service call to write a log** — entries are a side effect of ordinary Mongoose writes. Installed at `denowatts-backend/src/app.module.ts:112` (`connection.plugin(ActivityLogService.apply)`).

## What gets logged (producer map)

There is exactly **one producer**: the Mongoose connection plugin `ActivityLogService.apply`, registered globally in the `connectionFactory` of `MongooseModule.forRootAsync` at `denowatts-backend/src/app.module.ts:105-116`. Because it is registered with `connection.plugin(...)`, it is applied to **every schema on that connection** — i.e. effectively every collection in the app (users, sites, channels, assets, companies, settings, etc.). No individual service calls the activity-log service to record an action; grep for `ActivityLogService` outside the module returns only this single `app.module.ts` registration line.

The plugin (`ActivityLogService.apply`, `denowatts-backend/src/activity-logs/activity-logs.service.ts:230-302`) attaches these Mongoose middleware hooks to each schema:

| Mongoose hook | Phase | Logged action | File:line |
|---|---|---|---|
| `pre('save')` | pre | captures `this.getChanges()` (empty if new doc) into `updatedObject` | `activity-logs.service.ts:232-235` |
| `post('save')` | post | `CREATE` if `updatedObject` empty, else `UPDATE` | `activity-logs.service.ts:266-277` |
| `pre('updateOne')` | pre | snapshots previous values via `preSchema` | `activity-logs.service.ts:237-242` |
| `post('updateOne')` | post | `UPDATE` | `activity-logs.service.ts:279-281` |
| `pre('findOneAndUpdate')` | pre | snapshots previous values | `activity-logs.service.ts:244-249` |
| `post('findOneAndUpdate')` | post | `UPDATE` | `activity-logs.service.ts:283-285` |
| `pre('replaceOne')` | pre | snapshots previous values | `activity-logs.service.ts:251-256` |
| `post('replaceOne')` | post | `UPDATE` | `activity-logs.service.ts:287-289` |
| `pre('findOneAndReplace')` | pre | snapshots previous values | `activity-logs.service.ts:258-263` |
| `post('findOneAndReplace')` | post | `UPDATE` | `activity-logs.service.ts:291-293` |
| `post('deleteOne')` | post | `DELETE` | `activity-logs.service.ts:295-297` |
| `post('findOneAndDelete')` | post | `DELETE` | `activity-logs.service.ts:299-301` |

**Who the actor is:** the `user` on the log is read from the current request via `nestjs-request-context` (`RequestContext.currentContext.req.user._id`), `activity-logs.service.ts:103-130`. That `req.user` object is the authenticated user attached by the JWT auth flow (`JwtStrategy.validate` → `AuthService.validateUser`, `denowatts-backend/src/auth/jwt.strategy.ts:33-55`; `RequestContextModule` is imported globally at `app.module.ts:102`). If there is no request context or no user (e.g. background jobs, seed scripts, unauthenticated writes), `user` is stored as `null` and the UI shows "System" (`ActivityLogsPage.tsx:170`).

**Not logged / excluded:**
- Writes to the `activitylogs` collection itself are skipped to prevent recursion — `createLog` returns early when `modelName === 'activitylogs'` (`activity-logs.service.ts:112`).
- Auth refresh-token mutations are skipped entirely: if any GraphQL variable key is `refreshTokenInput`, `createLog` returns without writing (`activity-logs.service.ts:114-118`).
- A write that produces no detectable changes is not logged — `postSchema` only calls `createLog` when `changes` has keys (`activity-logs.service.ts:209`). For `UPDATE` via `save`, if `getChanges()` is empty the action is treated as `CREATE`; for query-style updates with no captured diff, `changes` falls back to `{ updated: <after> }`.
- Bulk operations (`updateMany`, `deleteMany`, `insertMany`) have **no hooks attached**, so they are **not** audited.

**Hook coverage gotcha:** only the per-document Mongoose middleware listed above is hooked. Operations that bypass these (raw `bulkWrite`, `updateMany`, `aggregate` `$merge`, direct driver calls) write to the DB without producing an `ActivityLog`.

## GraphQL API surface

Both operations are **queries** (read-only). There are no mutations — the trail is never written or edited through GraphQL. The whole resolver class is guarded `@Roles(UserType.SUPER_ADMIN)` (`denowatts-backend/src/activity-logs/activity-logs.resolver.ts:11`), enforced by `RolesGuard` (`denowatts-backend/src/common/guards/roles.guard.ts`).

### Query `activityLogs(filter: ActivityLogPaginateFilterInput!): ActivityLogPaginateResponse`
- Resolver: `getActivityLogs`, `activity-logs.resolver.ts:16-25` → `ActivityLogService.paginateActivityLogs`.
- **Input** — `ActivityLogPaginateFilterInput` (see DTO table below).
- **Return** — `ActivityLogPaginateResponse` (`dto/activity-log.input.ts:55-59`), which extends the generic `PaginateType(ActivityLog)` (`denowatts-backend/src/common/object-types/paginate-type.ts`):
  - `docs: [ActivityLog]` — the page of logs (each `ActivityLog` with `user` populated to `firstName lastName email` — note: populated on the server but the GraphQL `user` field type is `ID`, so the frontend re-maps user details from a separate `GET_USERS` query).
  - `totalDocs`, `limit`, `totalPages`, `page`, `pagingCounter`, `hasPrevPage`, `hasNextPage`, `prevPage`, `nextPage`.

### Query `activityLogTargets: [String!]`
- Resolver: `getActivityLogTargets`, `activity-logs.resolver.ts:27-33` → `ActivityLogService.getDistinctTargets`.
- **Input** — none.
- **Return** — sorted list of distinct, non-empty `target` (collection) names present in the trail. Used to populate the "Filter by Collection" dropdown in the UI.

## Services

### ActivityLogService — `activity-logs.service.ts`

Holds three **static** members used by the Mongoose hooks (which run outside DI): `static activityLogModel` (assigned in the constructor at line 55 so hooks can write), `static previousData` (the pre-update snapshot), and `static updatedObject` (the `$set` payload of the current update). The instance also injects the `User`, `Site`, `Channel`, `Asset`, and `Company` models for search resolution.

> **Concurrency gotcha:** `previousData` and `updatedObject` are *static* (process-global) and overwritten by every write. Under concurrent writes the pre/post pairing can race, so a logged `before`/`changes` diff can in theory be attributed using another in-flight operation's snapshot. Cited from the static declarations at `activity-logs.service.ts:36-38`.

#### `static getChanges(before, after): Record<string, unknown>` — `activity-logs.service.ts:62-67`
- Delegates to `detailedDiff(before, after)` from the `deep-object-diff` package (dependency `deep-object-diff ^1.1.9`, `denowatts-backend/package.json:76`). Returns `{ added, deleted, updated }`.

#### `static getBeforeForUpdated(updated, before): Record<string, unknown>` — `activity-logs.service.ts:73-94`
- Builds a "before" object that mirrors the *shape* of `updated` (the changed paths) but fills in the corresponding **previous** values from `before`. Recurses into nested objects so each changed path gets its prior value. Used to populate the `before` field for `UPDATE` logs.

#### `static async createLog(action, modelName, documentId, diffObject, beforeValues?)` — `activity-logs.service.ts:96-142`
This is the single function that writes an `ActivityLog`. Steps:
1. Pull the current request from `RequestContext.currentContext?.req` → `body` and `user`.
2. **Skip self-logging:** if `modelName === 'activitylogs'`, return (no write).
3. **Redaction pass** over `body.variables` (GraphQL variables):
   - If any variable key is `refreshTokenInput`, return immediately (don't log token refreshes) — `:114-118`.
   - For any variable object that has a `password` property, overwrite it with `'*****'` before logging — `:120-124`.
4. Build the payload:
   - `target` = `modelName`
   - `action` = the `LogActionType`
   - `user` = `request.user._id ?? null`
   - `documentId` = `documentId ?? null`
   - `payload` = `body.variables` if present, else `body`, else the `diffObject` (so REST writes log the raw body; GraphQL writes log the variables)
   - `changes` = `diffObject ?? null`
   - `before` = `beforeValues` only if provided (`:135-137`)
5. **DB write:** `await this.activityLogModel.create(payload)` — only if `modelName` is truthy (`:139-141`). Inserts one document into the `activitylogs` collection.
- **Side effects:** one insert into `activitylogs`; mutates `body.variables[*].password` in place to redact it.
- **Throws:** does not catch — a failing `create` would reject the surrounding Mongoose `post` hook.

#### `static async preSchema(query, updatedObject, model, next)` — `activity-logs.service.ts:144-160`
Runs in `pre` hooks for `updateOne` / `findOneAndUpdate` / `replaceOne` / `findOneAndReplace`.
1. Take the update object, strip Mongo operator keys (those starting with `$`) to get the set of field names being changed.
2. Always include `updatedAt` in that key set.
3. **DB read:** `model.findOne(query).select(keys).lean()` — fetches the *current* values of exactly the fields about to change, stored in `static previousData`.
4. Call `next()`.
- **DB reads:** one `findOne` on the target collection (projected to the changed fields).

#### `static async postSchema(action, updatedObject, doc, next)` — `activity-logs.service.ts:162-228`
Runs in `post` hooks. Computes the diff and calls `createLog`.
1. If `doc` is null/undefined, just `next()` (nothing to log).
2. **CREATE:** `changes.added = JSON.parse(JSON.stringify(doc))` — the full new document.
3. **UPDATE:**
   - `updatedObject` = `updatedObject['$set']` if present, else `{}`.
   - `before` = the `static previousData` snapshot captured in `preSchema`.
   - `after` = the `$set` values.
   - `changes` = `getChanges(before, after)` if `before` has keys, else `{ updated: after }`.
4. **DELETE:** `changes.deleted = JSON.parse(JSON.stringify(doc))` — the full removed document.
5. If `changes` has any keys:
   - For `UPDATE` with a non-empty `changes.updated`, compute `beforeValues = getBeforeForUpdated(changes.updated, before)` (the prior values of just the changed paths).
   - Resolve the collection name as `doc.collection?.name || doc.target || ''` and call `createLog(action, collectionName, doc._id, changes, beforeValues)`.
6. `next()`.
- **DB writes:** one insert via `createLog` (conditional on having changes).
- **Note:** uses `JSON.parse(JSON.stringify(...))` to deep-clone Mongoose docs into plain objects.

#### `static apply(schema)` — `activity-logs.service.ts:230-302`
The plugin function passed to `connection.plugin(...)`. Registers all the pre/post hooks listed in the producer-map table above on whatever schema it is applied to.

#### `async paginateActivityLogs(filter): ActivityLogPaginateResponse` — `activity-logs.service.ts:304-487`
Builds the Mongo query from the filter and returns a paginated result (via `mongoose-paginate-v2`).
1. **`target` filter** → `query.target = { $regex: filter.target, $options: 'i' }` (case-insensitive partial match on collection name) — `:317-319`.
2. **`action` filter** → exact match `query.action = filter.action` — `:322-324`.
3. **`search` filter** (`:329-437`) — `search` is trimmed; `isObjectIdSearch = Types.ObjectId.isValid(searchText)`. Conditions are OR-ed:
   - If the text is a valid ObjectId → match `documentId` and (in the user lookup) user `_id`.
   - **User lookup:** `userModel.find({ $or: [ _id (if ObjectId), { firstName/lastName/email $regex } ] }).select('_id')`; matched user ids → `{ user: { $in: userIds } }`.
   - For **non-ObjectId** text, additionally resolve entity names to their ids and match `documentId`:
     - **Sites:** `siteModel.find({ name: $regex })` → `{ documentId: { $in: siteIds } }` — `:373-383`.
     - **Channels:** `channelModel.find({ $or: [ name $regex, 'config.serialNumber' $regex ] })` → `{ documentId: { $in: channelIds } }` — `:386-401`.
     - **Assets:** `assetModel.find({ $or: [ serialNumber $regex, macAddress $regex ] })` → `{ documentId: { $in: assetIds } }` — `:404-417`.
     - **Companies:** `companyModel.find({ name: $regex })` → `{ documentId: { $in: companyIds } }` — `:420-430`.
   - Only if at least one condition was produced is `query.$or` set — `:434-436`.
4. **Date filter** on `createdAt` (`:440-451`): `startDate` → `$gte new Date(startDate)`; `endDate` → `$lte` with time forced to `23:59:59.999` (end of day).
5. **Sort** (`:454-463`): `{ createdAt: filter.sortByCreatedAt }` if provided, else default `{ createdAt: -1 }` (newest first).
6. **Pagination** (`:466-479`): `page` (default 1), `limit` (default 10), with `populate: [{ path: 'user', select: 'firstName lastName email' }]`.
7. Returns the `paginate` result cast to `ActivityLogPaginateResponse`.
- **DB reads:** up to 5 lookup queries (users, sites, channels, assets, companies) plus the paginated `activitylogs` query.
- **Throws / side effects:** wraps everything in try/catch; on error logs via `Logger`, reports to `Sentry.captureException`, and re-throws (`:482-486`).

#### `async getDistinctTargets(): string[]` — `activity-logs.service.ts:489-498`
- **DB read:** `activityLogModel.distinct('target')`.
- Filters out null/empty values and sorts ascending.
- On error: logs, `Sentry.captureException`, re-throws.

## Schemas

### ActivityLog — `schemas/activity-logs.schema.ts`
`@Schema({ timestamps: true })` (so `createdAt` / `updatedAt` are auto-managed). Stored in the `activitylogs` collection. No explicit `@Prop` indexes are declared on this schema.

| Field | Type | Required | Indexed | Purpose |
|---|---|---|---|---|
| `target` | `String` | Yes (`required: true`) | No | The collection name the action hit (e.g. `users`, `sites`). `:9-11` |
| `action` | `String` | Yes (`required: true`) | No | The action performed; one of `CREATE` / `UPDATE` / `DELETE` (`LogActionType`). `:13-15` |
| `user` | `ObjectId` | No | No | The acting user's `_id`, or `null` for system/background writes. GraphQL type `ID`, nullable. `:17-22` |
| `documentId` | `ObjectId` | No | No | The `_id` of the affected document. Nullable. `:24-29` |
| `payload` | `Mixed` | Yes (`required: true`) | No | The request body / GraphQL variables that drove the change (passwords redacted to `*****`). GraphQL `JSON` scalar, nullable. `:31-36` |
| `changes` | `Mixed` | Yes (`required: true`) | No | Structured diff: `{ added }` for CREATE, `{ deleted }` for DELETE, `{ added, deleted, updated }` (or `{ updated }`) for UPDATE. GraphQL `JSON` scalar, nullable. `:38-43` |
| `before` | `Mixed` | No (`default: null`) | No | Previous values for just the updated paths (UPDATE only). GraphQL `JSON` scalar, nullable. `:45-50` |
| `createdAt` | `Date` | auto (timestamps) | No | When the log was created = when the action happened. GraphQL field only. `:52-53` |
| `updatedAt` | `Date` | auto (timestamps) | No | Auto-managed; logs are effectively write-once so equals `createdAt` in practice. `:55-56` |

> **Note on `required` vs nullable:** `payload` and `changes` are `required: true` at the Mongo layer but exposed as `nullable: true` in GraphQL. Because every code path that writes a log sets both (`payload` falls back through `variables → body → diffObject`; `changes` is `diffObject ?? null`), `changes` can technically be written as `null` from `createLog` even though the schema marks it required — worth flagging.

The GraphQL `user` field is an `ID` (the raw ObjectId). `paginateActivityLogs` populates `user` with `firstName lastName email` server-side, but since the GraphQL field type is `ID` the frontend instead maps user details client-side from a separate `GET_USERS` query (`ActivityLogsPage.tsx:31-38, 169-187`).

## DTOs

### ActivityLogPaginateFilterInput — `dto/activity-log.input.ts:13-53`
`@InputType()`. All fields optional.

| Field | Type | Validation | Purpose |
|---|---|---|---|
| `page` | `Int` | `@IsOptional`, default `1` | Page number. |
| `limit` | `Int` | `@IsOptional`, default `10` | Page size. |
| `search` | `String` | `@IsOptional`, `@IsString` | Free-text search across documentId, user (id/name/email), and (for non-ObjectId text) site/channel/asset/company metadata. |
| `target` | `String` | `@IsOptional`, `@IsString` | Case-insensitive partial match on the collection name. |
| `action` | `LogActionType` | `@IsOptional`, `@IsEnum(LogActionType)` | Filter to `CREATE` / `UPDATE` / `DELETE`. |
| `sortByCreatedAt` | `Int` | `@IsOptional` | `1` ascending, `-1` descending. Defaults to `-1` server-side when omitted. |
| `startDate` | `Date` | `@IsOptional`, `@IsDate`, `@Type(() => Date)` | Lower bound on `createdAt` (`$gte`). |
| `endDate` | `Date` | `@IsOptional`, `@IsDate`, `@Type(() => Date)` | Upper bound on `createdAt`; coerced to end-of-day `23:59:59.999`. |

### ActivityLogPaginateResponse — `dto/activity-log.input.ts:55-59`
`@ObjectType()` extending `PaginateType(ActivityLog)`. Overrides `docs: [ActivityLog]` and inherits the pagination metadata fields (`totalDocs`, `limit`, `totalPages`, `page`, `pagingCounter`, `hasPrevPage`, `hasNextPage`, `prevPage`, `nextPage`) from `denowatts-backend/src/common/object-types/paginate-type.ts`.

### LogActionType (enum) — `activity-logs.service.ts:27-31`
`CREATE | UPDATE | DELETE`. Registered as a GraphQL enum via `registerEnumType` (`dto/activity-log.input.ts:8-11`).

## Business rules
- **Read access is Super-Admin only** — backend: `@Roles(UserType.SUPER_ADMIN)` on the resolver (`activity-logs.resolver.ts:11`) enforced by `RolesGuard` (`common/guards/roles.guard.ts`); frontend: `ProtectedRoute` redirects non-SuperAdmins to `/not-found` (`ProtectedRoute.tsx:27-32`).
- **The trail is append-only via GraphQL** — only queries exist; no mutation can create/edit/delete logs (`activity-logs.resolver.ts`).
- **Logging is automatic, not opt-in** — every per-document save/update/delete on the main connection is audited because the plugin is global (`app.module.ts:112`).
- **No recursive logging** — writes to `activitylogs` are skipped (`activity-logs.service.ts:112`).
- **Token refreshes are never logged** — `refreshTokenInput` variable short-circuits `createLog` (`activity-logs.service.ts:114-118`).
- **Passwords are redacted** — any GraphQL variable object with a `password` key is masked to `*****` before writing (`activity-logs.service.ts:120-124`).
- **No-op writes are not logged** — `createLog` only runs when a non-empty `changes` was computed (`activity-logs.service.ts:209`).
- **End-date is inclusive to end of day** — `endDate` is bumped to `23:59:59.999` (`activity-logs.service.ts:447-449`).
- **Default ordering is newest-first** — `createdAt: -1` when no sort given (`activity-logs.service.ts:461-463`).

## Data touched
- `activitylogs.{target, action, user, documentId, payload, changes, before, createdAt, updatedAt}` — written by `createLog`; read/paginated by `paginateActivityLogs`; distinct `target` read by `getDistinctTargets`.
- `users.{_id, firstName, lastName, email}` — read in `paginateActivityLogs` to resolve `search` to user ids and to `populate` the `user` field (`activity-logs.service.ts:359-364, 473-478`).
- `sites.{_id, name}` — read in search resolution (`:373-383`).
- `channels.{_id, name, config.serialNumber}` — read in search resolution (`:386-401`).
- `assets.{_id, serialNumber, macAddress}` — read in search resolution (`:404-417`).
- `companies.{_id, name}` — read in search resolution (`:420-430`).
- Every other collection on the connection is **read** in `preSchema` (projected `findOne` of changed fields) and indirectly is the *source* of audited writes, but the activity-log module never writes to them.

## Edge cases & gotchas
- **Bulk ops aren't audited.** Only single-document hooks are registered; `updateMany`, `deleteMany`, `insertMany`, raw `bulkWrite`, and aggregation writes produce no log (`activity-logs.service.ts:230-302`).
- **Static state is shared across requests.** `previousData` / `updatedObject` are process-global statics, so concurrent writes can theoretically cross-contaminate a log's `before`/`changes` (`activity-logs.service.ts:36-38`).
- **`user` field is just an ObjectId in GraphQL.** Server-side populate is overridden by the `ID` field type; the page resolves names via a separate `GET_USERS` call and shows the raw id (or "System") if the user can't be found (`ActivityLogsPage.tsx:169-187`).
- **"System" actor.** Background jobs / unauthenticated writes have no request user, so `user` is `null` and renders as "System".
- **REST vs GraphQL payloads differ.** `payload` is `body.variables` for GraphQL writes but the whole `body` for REST writes (`activity-logs.service.ts:132`).
- **`updatedAt` on the schema is misleading.** Logs are write-once in practice, so `updatedAt` ≈ `createdAt`; do not treat it as "when the log changed."
- **Frontend UX details:** search input is debounced 300ms and filters live in Redux `header.activityLogsSettings`, cleared on unmount; applying a date range auto-switches sort to ascending; filters reset the page to 1 (`ActivityLogsPage.tsx:41-50`, `ActivityLogsSettings.tsx:47-66`). The drawer renders `payload`, `before`, and `changes` as pretty-printed JSON.
- **No export.** Despite an older catalog entry listing "Export logs", there is no export/download/CSV code in the page or settings component (verified by grep) — the page is view + filter only.
- **`required` vs `null` mismatch** for `payload`/`changes` (see schema note) — `changes` is technically written as `diffObject ?? null` against a `required: true` field.

**Related flows:**
- [flows/authentication.md](authentication.md) — supplies `req.user` (the audit actor) and the `refreshTokenInput` that is deliberately excluded.
- [flows/users.md](users.md) — `User` model, `UserType.SUPER_ADMIN`, and the user-search lookup used by `paginateActivityLogs`.
- [flows/settings.md](settings.md) — the Settings menu that hosts the Activity Logs page.
- [flows/site.md](site.md), [channels.md](channels.md), [assets.md](assets.md), [companies.md](companies.md) — entities resolved during free-text search and the most common audited collections.
