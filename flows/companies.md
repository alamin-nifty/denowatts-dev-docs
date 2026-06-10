# Companies

**What it does (business):** A **Company** is the top-level organization/tenant record in Denowatts. It owns sites, scopes which users belong to it, holds the per-company API key and IP whitelist used by the public data-out API, and stores the per-company `notificationSettings` array that drives who receives alarm/event email and in-app notifications. Companies are the foundational multi-tenant boundary that other features (users, sites, events, notifications, webhooks, data-out) attach to.

**Entry point(s):**
- **Company Management** (SuperAdmin only) — `denowatts-portal/src/pages/dashboard/settings/company-management/CompanyManagementPage.tsx`, route `/settings/company-management` (`denowatts-portal/src/router.tsx:361`). List/create/edit all companies, generate/revoke API keys.
- **Company** (own-company profile) — `denowatts-portal/src/pages/dashboard/settings/company-management/CompanyPage.tsx`, route `/settings/company` (`denowatts-portal/src/router.tsx:354`). View/edit the current user's own company and list its users.
- **Notification Management** — `denowatts-portal/src/pages/dashboard/settings/notification-management/NotificationManagementPage.tsx`, route `/settings/notification-management`. Writes the `notificationSettings` array back onto a Company via the same `updateCompany` mutation.
- Both routes live under the `settings` parent which is wrapped in `CompanyRequiredRoute` (`denowatts-portal/src/router.tsx:350-351`) — a user must have a `company` to reach them.

---

## Role in multi-tenancy

A company is the tenant boundary. Concretely:

- **Users belong to a company.** `User.company` is an optional `ObjectId` ref to `Company` — `denowatts-backend/src/users/schemas/user.schema.ts:56-62`. `SUPER_ADMIN` users may have no/any company and see all data; `ADMIN`/`USER` are scoped to their `company`.
- **Sites are owned by / shared with companies.** A site has an `owner` company and an `accesses[]` list of `{ company }` grants. `SitesService.getSitesAccessCompanies(company)` returns the owning company plus every company granted access to that company's sites — `denowatts-backend/src/sites/services/sites.service.ts:787-802`. This is how cross-company site sharing is resolved for tag/site filtering.
- **The public data-out API authenticates by company.** `ApiGuard` looks up the company by `apiKey` header, then enforces the company's `whitelistedIPs`, then verifies the requested `site` is owned-by or shared-with that company — `denowatts-backend/src/data-out/guards/api.guard.ts`. See `flows/data-out.md`.
- **Notifications are configured per company.** Alarm (webhook) and event notification dispatch both read `Company.notificationSettings` to decide recipients — `denowatts-backend/src/webhooks/webhook.service.ts:136-187` and `denowatts-backend/src/events/events.service.ts:162-228`. See `flows/notification.md` and `flows/events.md`.
- **A special "Denowatts" company** is identified by having `denowatts.com` in `verifiedDomains` and is always included in site-tag results so internal sites are visible — `denowatts-backend/src/companies/companies.service.ts:111-115`.

---

## GraphQL API surface

Resolver: `denowatts-backend/src/companies/companies.resolver.ts`. The whole resolver class is decorated `@Roles(UserType.SUPER_ADMIN)` (`companies.resolver.ts:17`), so **every operation defaults to SuperAdmin-only** unless an individual handler overrides it with `@AllRoles()`.

> How the guard reads this: `RolesGuard` returns `true` immediately if `@AllRoles()` metadata is present on the handler or class, OR if no `@Roles` metadata is found; otherwise it allows `SUPER_ADMIN` unconditionally and checks the handler's required roles for everyone else — `denowatts-backend/src/common/guards/roles.guard.ts:23-42`. Because `@AllRoles()` short-circuits to `true`, the `@AllRoles()`-marked operations below perform **no role check** (any authenticated user) and rely on the **service** to scope results.

### Mutations

| Operation | Args (input type) | Returns | Access | Resolver |
|---|---|---|---|---|
| `createCompany` | `createCompanyInput: CreateCompanyInput` | `Company` | SuperAdmin only | `companies.resolver.ts:22-25` |
| `updateCompany` | `updateCompanyInput: UpdateCompanyInput` | `Company` | `@AllRoles()` (any authenticated user; service restricts non-SuperAdmin to `siteTags` only) | `companies.resolver.ts:43-51` |
| `updateApiKey` | `company: ID`, `action: UpdateApiKeyAction` | `Company` | SuperAdmin only | `companies.resolver.ts:53-61` |

- `createCompany` calls `companiesService.create(createCompanyInput)`.
- `updateCompany` destructures `_id` out and calls `companiesService.update(_id, input, user)`; `user` is injected via `@CurrentUser()` (`denowatts-backend/src/common/decorators/current-user.decorator.ts`).
- `updateApiKey` parses `company` through `ParseObjectIdPipe` (validates ObjectId, else `BadRequestException` — `denowatts-backend/src/common/pipes/parse-object-id.pipe.ts`) and passes `action` (the `UpdateApiKeyAction` enum).

### Queries

| Operation (name) | Args (input type) | Returns | Access | Resolver |
|---|---|---|---|---|
| `companies` | none | `[Company]` | SuperAdmin only | `companies.resolver.ts:27-30` |
| `companiesWithPaginate` | `companyPaginateFilterInput: CompanyPaginateFilterInput` | `CompanyPaginateResponse` | SuperAdmin only | `companies.resolver.ts:32-35` |
| `company` | `id: ID` (parsed via `ParseObjectIdPipe`) | `Company` (nullable) | `@AllRoles()` | `companies.resolver.ts:37-41` |
| `getSiteTags` | `input: SiteTagsInput` | `[SiteTagsResponse]` | `@AllRoles()` (service scopes by user) | `companies.resolver.ts:63-71` |

- `company` calls `findOne({ _id: id })` and returns `null` when not found (nullable query, no throw).
- `getSiteTags` passes `input` and `@CurrentUser() user` to the service, which applies tenant scoping (see service below).

**Return field shape note:** the GraphQL return type is the full `Company` ObjectType (all fields listed in the schema table below). Frontend documents pick subsets — e.g. `GET_COMAPANY` (`denowatts-portal/src/graphql/queries/companyQueries.ts`) requests `notificationSettings { id type siteManagers inAppNotifications emailNotifications otherUsers isActive }`; `UPDATE_API_KEY` returns `_id name apiKey whitelistedIPs`.

---

## Services

### CompaniesService — `companies.service.ts`

Constructor injects `companyModel` (Mongoose `Model<Company>` for the `'Company'` collection) and `sitesService` (via `forwardRef` because of a circular module dependency) — `companies.service.ts:23-27`. A private getter `companyPaginateModel` casts the model to `PaginateModel<Company>` to expose `mongoose-paginate-v2`'s `.paginate()` — `companies.service.ts:30-32`.

#### `create(createCompanyInput: CreateCompanyInput): Promise<Company>`
- One write: `companyModel.create(createCompanyInput)` — `companies.service.ts:34-36`.
- No extra validation beyond schema/DTO validators. `apiKey` is **not** settable here (omitted from `CreateCompanyInput`).

#### `find(filter: FilterQuery<Company> = {}): Query<Company[]>`
- One read: `companyModel.find(filter)` — `companies.service.ts:38-40`. Returns an un-awaited Mongoose query (resolver awaits it). Used by the `companies` query and by other modules importing `CompaniesService`.

#### `findOne(filter: FilterQuery<Company> = {}): Promise<Company | null>`
- One read: `companyModel.findOne(filter).exec()` — `companies.service.ts:42-44`. Used by the `company` query and, critically, by `ApiGuard` (`findOne({ apiKey })`) and by `getSiteTags` (`findOne({ verifiedDomains: 'denowatts.com' })`).

#### `findByPaginate(filter: CompanyPaginateFilterInput)`
- Destructures `limit = 10`, `page = 1`, `search`, `...rest` from the filter — `companies.service.ts:46-47`. `rest` (any other Company fields supplied) becomes an exact-match query.
- If `search` is present, builds a case-insensitive (`$options: 'i'`) `$or` over: `name` (regex), and `$elemMatch` regex on each of `verifiedDomains`, `whitelistedIPs`, `siteTags` — `companies.service.ts:51-58`.
- One read: `.paginate(query, { limit, page, sort: { updatedAt: -1 }, lean: true })` — `companies.service.ts:60-65`. Returns the standard paginate envelope (`docs`, `totalDocs`, `totalPages`, `hasNextPage`, `hasPrevPage`, etc.).
- No throws.

#### `update(id, updateCompanyInput, user, internal = false)`
- **Privilege gate:** if `!internal` AND `user.type !== SUPER_ADMIN`, the payload is **forcibly reduced to `{ siteTags }` only** — every other field the caller sent is dropped — `companies.service.ts:78-82`. So non-SuperAdmins can only edit `siteTags` through this mutation. SuperAdmins (or internal calls) update the full payload.
- One write: `companyModel.findByIdAndUpdate(id, payload, { new: true, runValidators: true })` — `companies.service.ts:84-87`. `runValidators: true` re-runs schema validators on the update.
- **Throws** `NotFoundException('Company not found')` if no document matches `id` — `companies.service.ts:88`.
- `internal` (4th param) lets other backend services bypass the role reduction; the resolver always calls it with the default (`false`).
- This is the path the **Notification Management** page uses to persist `notificationSettings` (it passes `{ _id, notificationSettings }`), so a non-SuperAdmin would have that payload stripped to `siteTags` — meaning notification-settings edits effectively require SuperAdmin via this mutation (flag for human review; see Edge cases).

#### `updateApiKey(id, action: UpdateApiKeyAction)`
- If `action === GENERATE`: `apiKey = uuidv4().replace(/-/g, '')` (a 32-char hex string, dashes stripped). If `REVOKE` (or anything not `GENERATE`): `apiKey = null` — `companies.service.ts:92-93`.
- One write: `companyModel.findByIdAndUpdate(id, { $set: { apiKey } }, { new: true })` — `companies.service.ts:95-99`.
- **Throws** `NotFoundException('Company not found')` if no match — `companies.service.ts:101`.
- Side effect: rotating/revoking this key immediately changes which requests `ApiGuard` accepts on the data-out API.

#### `getSiteTags(filter: SiteTagsInput, currentUser: User)`
Returns companies (with their `siteTags`) the caller is allowed to see. Logic — `companies.service.ts:105-173`:
1. Spreads `filter` into a mutable `query`. Reads (`findOne`) the Denowatts company by `verifiedDomains: 'denowatts.com'` and captures its id (`dennoWatsId`) — `companies.service.ts:111-115`.
2. **If `filter.company` is provided:** calls `sitesService.getSitesAccessCompanies(filter.company)` and sets `query._id = { $in: [dennoWatsId?, ...accessibleCompanies] }` — `companies.service.ts:117-130`.
3. **Else if caller is not SUPER_ADMIN:** requires `currentUser.company` (else **throws** `BadRequestException('Company is required')`), then scopes to `{ $in: [dennoWatsId?, ...getSitesAccessCompanies(currentUser.company)] }` — `companies.service.ts:131-150`.
4. **If `filter.siteOwnerAndAccesses` is provided:** overrides `query._id = { $in: [dennoWatsId?, ...siteOwnerAndAccesses] }` — `companies.service.ts:152-165`. (Note: this runs *in addition* to / after the above branches and re-assigns `_id`.)
5. Deletes the helper keys `company` and `siteOwnerAndAccesses` from `query`, then reads `companyModel.find(query).select('_id name siteTags')` — `companies.service.ts:167-172`.
- SuperAdmin with no `company`/`siteOwnerAndAccesses` filter → unscoped (sees all companies' tags).
- Reads: 1 `findOne` (Denowatts) + up to 2 site lookups (inside `getSitesAccessCompanies`) + 1 `find`.

---

## Schemas

### Company — `company.schema.ts`

Defined `@ObjectType()` (GraphQL) + `@Schema({ timestamps: true })` (Mongo, so `createdAt`/`updatedAt` are auto-added) — `company.schema.ts:135-190`. Collection: `companies`. Exports: `CompanyDocument` (`HydratedDocument<Company>`), `CompanySchema`, `CompanyReference` (`ObjectId | Company`), and `CompanyPaginateResponse = PaginateType(Company)`.

| Field | Type | Required | Indexed | Purpose / notes |
|---|---|---|---|---|
| `_id` | `ObjectId` | auto | yes (PK) | Identifier. `@IsMongoId()`. — `company.schema.ts:138-140` |
| `name` | `string` | **yes** (`required: true`) | no | Company display name. `@IsString`. — `:142-145` |
| `billingInfo` | `CompanyBillingInfo` (embedded sub-doc) | no | no | Address/contact (see sub-doc below). — `:147-149` |
| `apiKey` | `string` | no | no (not declared unique/indexed) | Secret key for data-out API auth. Managed only via `updateApiKey`; omitted from create/update DTOs. `@IsString @IsOptional`. — `:151-155` |
| `whitelistedIPs` | `string[]` | no | no | IPs allowed to call data-out API with this company's key. `@IsString({ each: true })`. — `:157-164` |
| `siteTags` | `string[]` | no | no | Free-form tags used to label/group this company's sites. Only field non-SuperAdmins may edit via `updateCompany`. — `:166-173` |
| `verifiedDomains` | `string[]` | no | no | Email domains owned by the company; `denowatts.com` marks the internal company. — `:175-182` |
| `notificationSettings` | `NotificationSettings[]` | no | no | `@Prop({ type: [NotificationSettings], default: [] })`. Per-type notification rules (see below). — `:184-189` |
| `createdAt` | `Date` | auto | no | Added by `timestamps: true`. |
| `updatedAt` | `Date` | auto | no | Added by `timestamps: true`; `findByPaginate` sorts by this descending. |

> No explicit secondary indexes are declared in the schema. `apiKey`, `verifiedDomains`, `whitelistedIPs`, and `siteTags` are queried (in `ApiGuard.findOne({apiKey})`, `getSiteTags`, and `findByPaginate` search) without a declared index — flag for human review if these collections grow.

### CompanyBillingInfo sub-document — `company.schema.ts:92-133`

Embedded `@Schema()` (gets its own `_id` by default) + dual `@ObjectType` / `@InputType("CompanyBillingInfoInput")`. All fields optional strings (`@IsString @IsOptional`):

| Field | Type | Required | Purpose |
|---|---|---|---|
| `address` | `string` | no | Street address — `:98-102` |
| `city` | `string` | no | City — `:104-108` |
| `state` | `string` | no | State — `:110-114` |
| `zipCode` | `string` | no | ZIP / postal code — `:116-120` |
| `email` | `string` | no | Billing email — `:122-126` |
| `phone` | `string` | no | Billing phone — `:128-132` |

### notificationSettings sub-document (detailed) — `NotificationSettings`, `company.schema.ts:36-90`

Declared `@Schema({ _id: false })` (no per-element `_id`) + dual `@ObjectType` / `@InputType("NotificationSettingsInput")`. `Company.notificationSettings` is an **array** of these — one entry per notification type the company has configured. This array is the single source of truth consumed by both the event-notification path and the alarm/webhook path.

| Field | Type | Required | Default | Purpose / what consumes it |
|---|---|---|---|---|
| `id` | `number` | no (optional) | none | UI row identifier. The frontend uses serial ids 101–111 (101–103 = alarm severities Critical/High/Routine; 104–111 = event categories). `@IsNumber`. — `:42-48` |
| `type` | `NotificationEventType` (enum) | **yes** (`required: true, enum`) | none | Which notification/event type this rule governs. Matched against the event's category/severity. — `:50-54` |
| `siteManagers` | `boolean` | no | `false` | If true, the site's managers are added to the recipient set for this type. — `:56-61` |
| `inAppNotifications` | `boolean` | no | `false` | If true, recipients get an in-app notification for this type. — `:63-68` |
| `emailNotifications` | `boolean` | no | `false` | If true, recipients get an email for this type. (Field description in code says "in-app" — copy/paste typo; the property name and consumers treat it as email.) — `:70-75` |
| `otherUsers` | `ObjectId[]` (ref `User`) | no | `[]` | Explicit additional user recipients beyond site managers. — `:77-82` |
| `isActive` | `boolean` | no | `true` | Master on/off for this rule; consumers skip rules where `isActive` is false. — `:84-89` |

**`NotificationEventType` enum values** (`company.schema.ts:17-29`): `CRITICAL`, `HIGH`, `ROUTINE`, `TICKET`, `ADMIN`, `MAINTENANCE`, `LESSONS_LEARNED`, `MALFUNCTION`, `SITE_DIAGNOSTICS`, `DATA_CURATION`, `NOTES`.

**Who consumes it (dispatch):**
- **Alarms / webhooks** — `webhook.service.ts:136-187`: for each company, find a `notificationSettings` entry where `type === eventSeverity` (must be a valid `NotificationEventType`) and `isActive`. If found, collect recipients: add site managers if `siteManagers`, add `otherUsers`; then route to email set if `emailNotifications`, in-app set if `inAppNotifications`. See `flows/notification.md`.
- **Events feed** — `events.service.ts:162-228`: iterate `company.notificationSettings`, pick the entry matching the event's category where `isActive` and the type is in the event-notification category list; then if `siteManagers` add `site.managers`, if `otherUsers` add them, dedupe, load `ACTIVE`/non-deleted users, and create in-app notifications (`inAppNotifications`) and/or send emails (`emailNotifications`). See `flows/events.md`.

### UpdateApiKeyAction enum — `company.schema.ts:7-15`
`GENERATE` | `REVOKE`. Registered as GraphQL enum `UpdateApiKeyAction`. Consumed by `updateApiKey`.

### CompanyPaginateResponse — `company.schema.ts:197`
`PaginateType(Company)` from `denowatts-backend/src/common/object-types/paginate-type.ts`. Wraps `docs: [Company]` with `totalDocs`, `limit`, `totalPages`, `page`, `pagingCounter`, `hasPrevPage`, `hasNextPage`, `prevPage`, `nextPage`.

---

## DTOs — `dto/company.input.ts`

These derive from the `Company` ObjectType using NestJS GraphQL mapped-type helpers, so they inherit each field's `class-validator` decorators from the schema.

### CreateCompanyInput — `company.input.ts:6-7`
`OmitType(Company, ['_id', 'apiKey'], InputType)`. Same fields as `Company` minus `_id` and `apiKey`.

| Field | Type | Validation (inherited) | Purpose |
|---|---|---|---|
| `name` | `string` | required, `@IsString` | Company name |
| `billingInfo` | `CompanyBillingInfoInput` | optional | Billing details |
| `whitelistedIPs` | `string[]` | optional, `@IsString({each})` | IP allowlist |
| `siteTags` | `string[]` | optional, `@IsString({each})` | Tags |
| `verifiedDomains` | `string[]` | optional, `@IsString({each})` | Domains |
| `notificationSettings` | `NotificationSettingsInput[]` | optional | Notification rules |

### UpdateCompanyInput — `company.input.ts:9-13`
`PartialType(OmitType(Company, ['apiKey']), InputType)` plus a required `_id`. All fields optional except `_id` (`@Field(() => ID, { nullable: false })`). Includes everything from create plus `_id`; `apiKey` excluded. Note: the **service** further restricts which of these a non-SuperAdmin may actually apply (only `siteTags`).

### CompanyPaginateFilterInput — `company.input.ts:15-31`
`PartialType(OmitType(Company, ['apiKey']), InputType)` plus pagination/search:

| Field | Type | Validation | Purpose |
|---|---|---|---|
| (all Company fields except `apiKey`) | optional | inherited | Exact-match filters (passed as `...rest`) |
| `limit` | `number` | `@IsOptional` | Page size (default 10) |
| `page` | `number` | `@IsOptional` | Page number (default 1) |
| `search` | `string` | `@IsOptional` | Case-insensitive search across `name`, `verifiedDomains`, `whitelistedIPs`, `siteTags` |

### SiteTagsInput — `company.input.ts:33-49`

| Field | Type | Validation | Purpose |
|---|---|---|---|
| `siteOwnerAndAccesses` | `ObjectId[]` (`[ID]`) | `@IsOptional` | Restrict results to these company ids (plus Denowatts) |
| `company` | `ObjectId` (`ID`) | `@IsOptional @IsMongoId` | Resolve tags for this company and the companies sharing its sites |

### SiteTagsResponse — `company.input.ts:51-52`
`PickType(Company, ['_id', 'name', 'siteTags'])` — the projection returned by `getSiteTags` (`.select('_id name siteTags')`).

---

## Module wiring — `companies.module.ts`
- Registers the `Company` Mongoose model (`MongooseModule.forFeature`).
- Imports `SitesModule` via `forwardRef` (circular: Companies ↔ Sites).
- Providers: `CompaniesResolver`, `CompaniesService`.
- **Exports `CompaniesService`** so other modules (notably the data-out `ApiGuard`, sites, events, webhooks) can inject it.

---

## Business rules

- Resolver is `@Roles(SUPER_ADMIN)` at class level; only `company`, `updateCompany`, and `getSiteTags` opt into `@AllRoles()` — `companies.resolver.ts:17,37,43,63`.
- `@AllRoles()` makes `RolesGuard` short-circuit to `true` (no role check) — `roles.guard.ts:23-25`. Access control for those operations is enforced in the service, not the guard.
- `SUPER_ADMIN` bypasses all role checks in `RolesGuard` — `roles.guard.ts:34`.
- Non-SuperAdmin `updateCompany` payloads are reduced to `{ siteTags }` only — `companies.service.ts:78-82`.
- `apiKey` cannot be set via create/update DTOs (`OmitType([... 'apiKey'])`); it is only mutable through `updateApiKey` (SuperAdmin-only) — `company.input.ts:7,10` + `companies.resolver.ts:53`.
- API key format: 32-char dash-stripped UUIDv4 on GENERATE; `null` on REVOKE — `companies.service.ts:92-93`.
- `getSiteTags` for a non-SuperAdmin with no `currentUser.company` throws `BadRequestException('Company is required')` — `companies.service.ts:132-134`.
- The Denowatts internal company (`verifiedDomains` includes `denowatts.com`) is always merged into `getSiteTags` results — `companies.service.ts:111-115`.
- Data-out auth: company resolved by `apiKey`, then IP must be in `whitelistedIPs`, then the requested site must be owned-by or shared-with the company — `data-out/guards/api.guard.ts`.

## Data touched (collection `companies`)

- `companies.{name, billingInfo, whitelistedIPs, siteTags, verifiedDomains, notificationSettings}` — written by create/update — `companies.service.ts:34-90`.
- `companies.apiKey` — set/cleared by `updateApiKey` via `$set` — `companies.service.ts:92-99`.
- `companies.updatedAt` — sort key for pagination — `companies.service.ts:63`.
- Reads: `findOne({ apiKey })` (`api.guard.ts`), `findOne({ verifiedDomains: 'denowatts.com' })` and `find().select('_id name siteTags')` (`getSiteTags`), `paginate` (`findByPaginate`).
- Cross-collection: `sites` (via `SitesService.getSitesAccessCompanies` reading `Site.accesses[].company`) and `users` (notification recipients reference `User._id` through `notificationSettings.otherUsers`).

## Edge cases & gotchas

- **Class-level SuperAdmin guard is easy to miss.** New handlers added to this resolver are SuperAdmin-only by default; you must add `@AllRoles()` to relax them.
- **`@AllRoles()` = no auth check at the guard layer.** `company`, `updateCompany`, and `getSiteTags` are reachable by any authenticated user; the safety net is the service-level scoping/payload-reduction, not the guard. Removing that service logic would silently open a tenant-isolation hole.
- **Notification settings save likely requires SuperAdmin.** The Notification Management page submits `{ _id, notificationSettings }` through `updateCompany`. For a non-SuperAdmin the service strips this down to `{ siteTags }`, so the notification settings would not persist — `companies.service.ts:78-82`. Confirm intended (the page is reachable by any company user). **Flag for human review.**
- **`emailNotifications` description typo.** Its `@Field` description reads "Enable in-app notifications" — `company.schema.ts:70-73`. The field name and all consumers treat it as email; the description is a copy/paste error in the code.
- **No uniqueness on `apiKey`.** Two companies could in theory hold the same key; `ApiGuard.findOne({ apiKey })` returns the first match. Practically unique because generated from UUIDv4, but not DB-enforced.
- **IP whitelist exact-match.** `whitelistedIPs.includes(originIP)` is a strict string match after stripping the `::ffff:` IPv6-mapped prefix — no CIDR/range support — `api.guard.ts`.
- **`getSiteTags` branch ordering.** If a caller passes both `company` and `siteOwnerAndAccesses`, the `siteOwnerAndAccesses` block runs last and overwrites `query._id` — `companies.service.ts:152-165`.
- **Circular dependency** between `CompaniesModule` and `SitesModule` is resolved with `forwardRef` in both the module and the service constructor — breaking it requires care.

**Related flows:** [data-out.md](./data-out.md) (API key + IP whitelist auth, tenant scoping), [notification.md](./notification.md) (`notificationSettings`-driven alarm dispatch), [events.md](./events.md) (event-category notification dispatch), [settings.md](./settings.md) (Company / Company Management / Notification Management pages), [site.md](./site.md) (`owner`/`accesses` company grants).
