---
title: Alarm Config
owner: alamin-nifty
status: draft
version: 2
updated_at: 2026-06-10
---

# Alarm Config

An **alarm rule** describes a condition that should raise an alarm anywhere in the fleet — "a sensor went silent", "an inverter is reporting an abnormal value", "a site metric crossed a threshold". The Alarm Config module is the central catalog of those rules: each one names what it watches, how bad it is (Critical / High / Routine), the threshold it compares against, and whether Denowatts support should be copied when it fires. Platform administrators author the rules once, and every open alarm across every site is then counted and rolled up by rule on the portfolio dashboard.

> **Reading this doc:** use the **Business / Developer** switch at the top. *Business* explains what alarm rules are, what they contain, where they're actually evaluated, and the rules that govern them. *Developer* adds the full GraphQL surface, the service and aggregation internals, every schema and DTO shape, file references, and a solar-terminology primer.

---

## Why this matters

Alarms are how the platform tells you something is wrong before the monthly report does. The rule catalog decides what counts as "wrong", how urgent it is, and — through severity — who gets emailed or pinged when an alarm opens or closes. A badly tuned rule either floods inboxes or stays silent while a site loses production. The portfolio dashboard's open-alarm summary is read directly off this catalog.

---

## What an alarm rule contains

Each rule in the catalog has:

- **A name** — must be unique across the whole catalog.
- **A target** — what it watches: a site-level metric, a metric on matching equipment channels, or a channel's connection status.
- **An effect** — the failure being described: *unavailable*, *disconnected*, or *value abnormal*.
- **A severity** — **Critical**, **High**, or **Routine**. The severity is stamped onto every alarm the rule produces and drives the colors on the dashboard and the notification routing.
- **A comparison** — an operator (greater than / less than / equal) and a threshold number.
- **A suppression level (1–5)** — intended to dampen noisy, flapping alarms.
- **An optional delay and condition** — e.g. only alarm when the sun is actually up ("irradiance above 100 W/m²").
- **A support flag** — when set, Denowatts support is copied on the alarm emails.

---

## Where the rules are evaluated (important)

This platform **stores and displays** the rules — it does not run them. The actual threshold checking happens in an upstream data-processing pipeline outside this codebase: alarms arrive here already flagged with their severity and a reference back to the rule that produced them. What the platform itself does with the catalog is: let administrators edit it, count and roll up open alarms per rule for the portfolio dashboard, and use the rule's name and support flag when sending alarm notifications. Exactly where the upstream evaluation runs is not yet confirmed and is flagged for human review.

---

## Who can do what

- **Platform administrators (Super Admins)** are the only ones who can create, edit, reorder, or delete rules.
- **Every signed-in user** can view the rule catalog (read-only) and the open-alarm summary, scoped to their own company's sites.
- Super Admins can view the open-alarm summary fleet-wide or filtered to any company; everyone else is locked to their own company.

---

## The rules that matter

- **Rules are global.** There is one catalog for the entire fleet — the same rules apply to every company and every site.
- **Rule names must be unique.**
- **Deleting a rule does not clean up its alarms.** Existing alarm events keep pointing at the deleted rule; they simply vanish from the per-rule rollup.
- **The open-alarm rollup counts only genuinely open alarms** — not closed, not deleted, not archived, and not group parents — and tracks how many of them are still unacknowledged.
- **Support is only auto-copied in production** when a rule's support flag is on (in test environments support is always copied).
- **Suppression level is limited to 1–5 and the condition to two presets** in the editing screen, even though the underlying storage is more permissive.

---

## Entry points {dev}
- **Authoring UI** — Settings gear → "Global Alarm Configuration" — `denowatts-portal/src/pages/dashboard/settings/global-alarm/GlobalAlarmPage.tsx` at route `/settings/global-alarm-configuration` (registered in `denowatts-portal/src/router.tsx:458-464`).
- **Consumer UI (status dashboard)** — Portfolio page open-alarm summary table — `denowatts-portal/src/pages/dashboard/portfolio/components/OpenAlarmStatusSummaryTable.tsx` (fed by the `alarmStatusSummary` query inside `PORTFOLIO_PAGE_DATA`, `denowatts-portal/src/graphql/queries/portfolioQueries.ts`).

---

## Scope note (verified against code) {dev}

> **Important scope note (verified against code):** The `alarm-config` module itself is **pure CRUD + a reporting aggregation**. It does **not** evaluate metric values against thresholds and does **not** create alarm events. No code in `denowatts-backend/src` reads `AlarmConfig.threshold`, `operator`, `suppressionLevel`, `delay`, or `condition` to decide whether to fire an alarm. Events already arrive with `isAlarm`, `severity`, and `alarmConfig` pre-set (by an upstream data-processing pipeline that lives outside this repository / outside the searched `src` tree). This module is the **definition store and status dashboard** for those rules, plus the notification fan-out in `webhooks`. Everywhere below that this matters is flagged.

---

## Alarm types & severity levels {dev}

All enums live in `denowatts-backend/src/alarm-config/schemas/alarm-config.schema.ts:6-33` and are registered with GraphQL.

### Target (`AlarmConfigTargetType`) — what the rule watches (`schema.ts:6-10`)
| Value | Meaning |
|---|---|
| `SITE_METRIC` | Rule evaluates a site-level metric. In the UI, `channelPrefixes` is forced empty for this target. |
| `CHANNEL_METRIC` | Rule evaluates a metric on channels matching the given `channelPrefixes`. |
| `CHANNEL_STATUS` | Rule evaluates a channel's connection/status (no `metric` — UI forces `metric = null`). |

### Effect (`AlarmConfigEffectType`) — the failure condition described (`schema.ts:12-16`)
| Value | Meaning |
|---|---|
| `UNAVAILABLE` | Target is unavailable. |
| `DISCONNECTED` | Target is disconnected (default effect for a brand-new rule in the UI). |
| `VALUE_ABNORMAL` | Target's value is abnormal (used with operator + threshold). |

### Severity (`AlarmConfigSeverityType`) — `schema.ts:18-22`
| Value | UI color (portfolio table) |
|---|---|
| `CRITICAL` | red (`text-red-600`) |
| `HIGH` | orange (`text-orange-600`) |
| `ROUTINE` | slate/grey (default) |

`EventSeverity` in `denowatts-backend/src/events/schemas/event.schema.ts:76-80` is the **same three values** (`CRITICAL`, `HIGH`, `ROUTINE`); the event copies the rule's severity. Severity color mapping is in `OpenAlarmStatusSummaryTable.tsx:29-39`. The Severity dropdown in the editor is populated from the frontend `EventSeverity` enum, not `AlarmConfigSeverityType` (`AlarmConfigTable.tsx:778`) — they are value-identical so it works.

### Operator (`AlarmConfigOperatorType`) — `schema.ts:24-28`
| Value | UI label (`AlarmConfigTable.tsx:91-102`) |
|---|---|
| `GREATER_THAN` | `> (Greater than)` |
| `LESS_THAN` | `< (Less than)` |
| `EQUAL` | `= (Equal)` |

### Threshold / suppression / delay / condition
- **`threshold`** (number, required) — the comparison value the operator uses (`schema.ts:91-94`). *Not evaluated in this repo* (see scope note).
- **`suppressionLevel`** (number, required) — UI offers values **1–5** only (`AlarmConfigTable.tsx:842-848`). Intended to dampen/de-bounce alarm firing. *Not evaluated in this repo.*
- **`delay`** (number, optional) — intended firing delay. *Not evaluated in this repo.* UI coerces `null → 0` on edit (`AlarmConfigTable.tsx:1125-1127`).
- **`condition`** (string, optional) — free-form gating condition. UI offers only two preset options: **`None` (null)** and **`irr>100 w/m2`** (`AlarmConfigTable.tsx:964-967`). *Not evaluated in this repo.*

---

## GraphQL API surface {dev}

All operations are defined in `denowatts-backend/src/alarm-config/alarm-config.resolver.ts`. The resolver class is decorated `@Roles(UserType.SUPER_ADMIN)` (`resolver.ts:14`), so **every operation defaults to Super-Admin-only** unless individually re-opened with `@AllRoles()`. The `@AllRoles()` decorator short-circuits the guard to allow any authenticated user (`denowatts-backend/src/common/guards/roles.guard.ts:18-25`); Super Admin always passes (`roles.guard.ts:34`).

### Queries

#### `alarmConfigs: [AlarmConfig!]!` — `resolver.ts:19-23`
- **Access:** `@AllRoles()` → any authenticated user.
- **Args:** none (injects `@CurrentUser() user`).
- **Returns:** array of full `AlarmConfig` objects, sorted by `order` ascending.
- Delegates to `AlarmConfigService.findAll(user)`.

#### `alarmConfig(_id: String!): AlarmConfig` — `resolver.ts:25-28`
- **Access:** class default → Super Admin only.
- **Args:** `_id: String!`.
- **Returns:** one `AlarmConfig` (or `null` if not found — note the GraphQL return type is non-null `AlarmConfig`, so a missing id resolves to `null` at the service but the schema advertises non-null).
- Delegates to `AlarmConfigService.findOne(_id)`.

#### `alarmStatusSummary(input: AlarmStatusSummaryInput!): [AlarmStatusSummaryResponse!]!` — `resolver.ts:59-65`
- **Access:** `@AllRoles()` → any authenticated user.
- **Args:** `input: AlarmStatusSummaryInput` (one optional field `company`), plus injected `@CurrentUser() user`.
- **Returns:** array of `AlarmStatusSummaryResponse` — per-rule open-alarm rollups (see DTO + aggregation below).
- Delegates to `AlarmConfigService.getAlarmStatusSummary(input, user)`.

### Mutations (all Super-Admin-only via class-level `@Roles`)

#### `createAlarmConfig(createAlarmConfigInput: CreateAlarmConfigInput!): AlarmConfig!` — `resolver.ts:30-36`
- Delegates to `AlarmConfigService.create(input)`.

#### `updateAlarmConfig(updateAlarmConfigInput: UpdateAlarmConfigInput!): AlarmConfig!` — `resolver.ts:38-44`
- Pulls `_id` out of the input and delegates to `AlarmConfigService.update(input._id, input)`. Returns the updated doc (`new: true`).

#### `bulkUpdateAlarmConfig(bulkUpdateAlarmConfigInput: BulkUpdateAlarmConfigInput!): String!` — `resolver.ts:46-52`
- Delegates to `AlarmConfigService.bulkUpdate(input)`. Returns the literal string `"Bulk update successful!"` on success; throws `BadRequestException` otherwise.

#### `deleteAlarmConfig(_id: String!): AlarmConfig!` — `resolver.ts:54-57`
- Delegates to `AlarmConfigService.delete(_id)`. Returns the deleted doc.

### Frontend operation documents
- Queries: `denowatts-portal/src/graphql/queries/alarmConfigQueries.ts` — `AlarmConfig($id)` (`GET_ALARM_CONFIG`), `AlarmConfigs` (`GET_ALARM_CONFIGS`).
- Mutations: `denowatts-portal/src/graphql/mutations/alarmConfigMutations.ts` — `CreateAlarmConfig`, `UpdateAlarmConfig`, `UpdateBulkAlarmConfig` (`bulkUpdateAlarmConfig`), `DeleteAlarmConfig`.
- `alarmStatusSummary` is queried only inside `PORTFOLIO_PAGE_DATA` and a standalone `AlarmStatusSummary` doc in `denowatts-portal/src/graphql/queries/portfolioQueries.ts`.

---

## Services {dev}

### AlarmConfigService — `denowatts-backend/src/alarm-config/alarm-config.service.ts`

Constructor injects the Mongoose model for `AlarmConfig` and `SitesService` (`service.ts:20-24`).

#### `findAll(user?: User): Promise<AlarmConfig[]>` — `service.ts:26-31`
- **Logic:**
  1. If `user` is provided AND `user.type !== SUPER_ADMIN` AND `user.company` is falsy → throw `ForbiddenException('User is not associated with a company')`.
  2. Otherwise `find()` all configs sorted by `{ order: 1 }`.
- **DB reads:** `alarmconfigs` collection — full scan, sorted by `order`.
- **Note:** no company filtering is applied — alarm configs are **global**, identical for all companies. The company check is only a gate, not a filter.
- **Throws:** `ForbiddenException` (non-super-admin without a company).

#### `findOne(_id: string): Promise<AlarmConfig | null>` — `service.ts:33-35`
- `findById(_id)`. Returns `null` if not found. No access check beyond the resolver guard.

#### `create(createAlarmConfigInput: CreateAlarmConfigInput): Promise<AlarmConfig>` — `service.ts:37-39`
- `alarmConfigModel.create(input)`.
- **DB writes:** inserts one `alarmconfigs` doc. Mongoose timestamps add `createdAt`/`updatedAt`.
- **Throws:** Mongo duplicate-key error (code `11000`) if `name` collides (the `name` field is `unique`) — *not* caught here, so it surfaces as a raw GraphQL error (unlike `bulkUpdate`, which catches it).

#### `update(_id: Types.ObjectId, updateAlarmConfigInput: UpdateAlarmConfigInput): Promise<AlarmConfig | null>` — `service.ts:41-46`
- `findByIdAndUpdate(_id, input, { new: true, runValidators: true })`.
- `new: true` → returns the post-update document. `runValidators: true` → schema validators run on update.
- **DB writes:** updates one `alarmconfigs` doc.

#### `delete(_id: string): Promise<AlarmConfig | null>` — `service.ts:48-50`
- `findByIdAndDelete(_id)`. Returns the deleted doc (or `null`).
- **Side effect / gotcha:** no cascade — events that reference this `alarmConfig` are **not** cleaned up; their `Event.alarmConfig` becomes a dangling ObjectId.

#### `bulkUpdate(input: BulkUpdateAlarmConfigInput): Promise<string>` — `service.ts:52-75`
- **Logic:**
  1. `isArrayDuplicate(input.data, 'name')` (util at `denowatts-backend/src/common/utils/array.ts`) checks for duplicate `name` values **within the submitted batch**. If duplicates → throw `BadRequestException("'name' must be unique")`.
  2. Maps each item to a Mongo `updateOne` op: `{ filter: { _id: update._id }, update: update }`.
  3. `alarmConfigModel.bulkWrite(bulkOps)`.
  4. Returns `'Bulk update successful!'`.
- **DB writes:** one `bulkWrite` against `alarmconfigs` (one `updateOne` per row).
- **Error handling (`service.ts:69-74`):**
  - Mongo duplicate-key error (`error.code === 11000`) → `BadRequestException("Duplicate key error: 'name' must be unique")`.
  - Any other error → `BadRequestException("Bulk update failed: <message>")` (message extracted by the local `getErrorMessage` helper, `service.ts:15-16`).
- **Gotcha:** the whole payload object (including `_id`) is passed as the Mongo `update` document. The `_id` field is immutable in Mongo and is silently ignored by `updateOne`'s filter-matched update; the rest of the fields overwrite the matched doc. This is how the frontend persists drag-reorder (`order`) and all edited fields in one call.

#### `getAlarmStatusSummary(filter: AlarmStatusSummaryInput, currentUser: User): Promise<AlarmStatusSummaryResponse[]>` — `service.ts:77-228`
This is the open-alarm rollup powering the portfolio dashboard.

- **Step 1 — resolve company scope (`service.ts:78-88`):**
  - `isSuperAdmin = currentUser.type === SUPER_ADMIN`.
  - If **not** super admin AND no `currentUser.company` → return `[]` immediately.
  - If super admin AND `filter.company` provided → `company = new ObjectId(filter.company)`.
  - If non-super-admin AND has `currentUser.company` → `company = new ObjectId(currentUser.company)` (the filter's `company` is ignored for non-super-admins — they are locked to their own company).
  - Super admin with **no** `filter.company` → `company` stays `null` (fleet-wide, all sites).
- **Step 2 — resolve site ids (`service.ts:90-98`):** if `company` is set, call `siteService.getAllSites({ company }, currentUser)` and collect `site._id` into `siteIds`. If `company` is null, `siteIds` stays empty (no site filter).
- **Step 3 — aggregation over `alarmconfigs` (`service.ts:100-225`):**
  - **`$lookup` from `events`** correlated per alarm config. The sub-pipeline matches events where **all** of:
    - `event.site` ∈ `siteIds` *(only added when `siteIds.length > 0`)* (`service.ts:112-118`),
    - `event.alarmConfig == this alarmConfig._id` (`service.ts:119-121`),
    - `event.isAlarm == true` (`service.ts:122-124`),
    - `event.isAlarmGroup` field is **missing** (`$type == 'missing'`) (`service.ts:125-132`) — i.e. excludes alarm-group parent events,
    - `event.endDate` is **missing** (`service.ts:133-140`) → the alarm is still **open** (not closed),
    - `event.deletedAt` is **missing** (`service.ts:141-148`),
    - `event.archivedAt` is **missing** (`service.ts:149-156`).
    - projects only `site` and `acknowledgedBy` into `alarms` (`service.ts:161-167`).
  - **`$addFields` (`service.ts:171-208`):**
    - `sites` = unique set of `alarms.site`.
    - `siteCount` = size of that unique set.
    - `totalOpenAlarmEvents` = size of `alarms` (count of all open alarm events for this rule).
    - `unacknowledgedCount` = count of `alarms` whose `acknowledgedBy` is missing or `null`.
  - **`$sort` by `order: 1`** (`service.ts:209-213`).
  - **`$project`** keeps `name`, `severity`, `alarms`, `sites`, `siteCount`, `totalOpenAlarmEvents`, `unacknowledgedCount` (`service.ts:214-224`). `_id` is implicitly retained.
- **Returns:** one row per alarm config, with its open-alarm counts.
- **DB reads:** `alarmconfigs` (driver collection) + `events` (`$lookup`) + `sites` (via `siteService.getAllSites`).

---

## Schemas {dev}

### AlarmConfig — `denowatts-backend/src/alarm-config/schemas/alarm-config.schema.ts`
`@Schema({ timestamps: true, versionKey: false })` → adds `createdAt`/`updatedAt`, drops `__v`. Mongoose collection: `alarmconfigs`.

| Field | Type | Required | Indexed | Default | Purpose / notes |
|---|---|---|---|---|---|
| `_id` | `ObjectId` (GraphQL `ID`) | auto | yes (PK) | — | Unique id. `@IsMongoId()`. (`schema.ts:38-42`) |
| `name` | `String` | yes | **unique** | — | Rule name; `unique: true` enforces a unique index. `@IsNotEmpty`/`@IsString`. (`schema.ts:44-48`) |
| `target` | `String` enum `AlarmConfigTargetType` | yes | no | — | What the rule watches. (`schema.ts:50-55`) |
| `effect` | `String` enum `AlarmConfigEffectType` | yes | no | — | Failure condition described. (`schema.ts:57-62`) |
| `severity` | `String` enum `AlarmConfigSeverityType` | yes | no | — | CRITICAL / HIGH / ROUTINE. (`schema.ts:64-69`) |
| `channelPrefixes` | `[String]` | yes | no | — | Channel-type prefixes the rule applies to (e.g. `1.1.1`). Forced empty when `target = SITE_METRIC`. (`schema.ts:71-76`) |
| `metric` | `String` | no | no | — | Metric name (for SITE_METRIC / CHANNEL_METRIC). Forced `null` when `target = CHANNEL_STATUS`. (`schema.ts:78-82`) |
| `operator` | `String` enum `AlarmConfigOperatorType` | yes | no | — | `>`, `<`, `=`. (`schema.ts:84-89`) |
| `threshold` | `Number` | yes | no | — | Comparison value. (`schema.ts:91-94`) |
| `suppressionLevel` | `Number` | yes | no | — | De-bounce level 1–5 (UI-bounded). (`schema.ts:96-99`) |
| `isAcknowledgeable` | `Boolean` | no | no | `false` | Whether resulting alarms can be acknowledged. **Note:** present in schema + test mock but **not** exposed in the GraphQL create/update operation documents, and not rendered in the editor table. (`schema.ts:101-108`) |
| `delay` | `Number` | no | no | — | Intended firing delay. (`schema.ts:110-114`) |
| `condition` | `String` | no | no | — | Optional gating condition (e.g. `irr>100 w/m2`). (`schema.ts:116-120`) |
| `order` | `Number` | no | no | — | Sort order; drives `sort({ order: 1 })` everywhere and drag-reorder. (`schema.ts:122-126`) |
| `notifySupport` | `Boolean` | no | no | `false` | If true, DenoWatts support is CC'd on alarm emails (consumed in webhooks). (`schema.ts:128-135`) |
| `createdAt` / `updatedAt` | `Date` | auto | no | — | From `timestamps: true`. |

> Only `name` is indexed (unique). There are **no** indexes on `target`, `severity`, `order`, etc.

### Related — Event (alarm-bearing fields only) — `denowatts-backend/src/events/schemas/event.schema.ts`
The fields the `alarmStatusSummary` aggregation and the webhook dispatcher rely on:

| Field | Type | Notes |
|---|---|---|
| `isAlarm` | `Boolean` default `false` | Marks the event as an alarm. (`event.schema.ts:278-283`) |
| `isAlarmGroup` | `Boolean` default `false` | Parent/grouping flag; aggregation excludes these via `$type == 'missing'`. (`event.schema.ts:285-290`) |
| `alarmGroup` | `ObjectId` ref `Event` | Parent group; webhook `processAlarm` refuses events that belong to a group. (`event.schema.ts:292-297`) |
| `severity` | `String` enum `EventSeverity` | Copied from the rule's severity; drives notification routing. (`event.schema.ts:299-305`) |
| `alarmConfig` | `ObjectId` ref `AlarmConfig` | Links the event back to its rule. (`event.schema.ts:307-312`) |
| `acknowledgedBy` | `ObjectId | User` | Null/missing → counts toward `unacknowledgedCount`. (`event.schema.ts:265-268`) |
| `endDate` | `Date` | Missing → alarm is **open**. (`event.schema.ts:237`) |
| `deletedAt` / `archivedAt` | `Date` | Missing required for an event to count as open. (`event.schema.ts:339`, `:369`) |

---

## DTOs {dev}

### CreateAlarmConfigInput — `denowatts-backend/src/alarm-config/dto/alarm-config.input.ts:7-8`
`OmitType(AlarmConfig, ['_id'], InputType)` → **every `AlarmConfig` field except `_id`**, with the same `class-validator` rules declared on the schema class (`@IsNotEmpty`, `@IsString`, `@IsNumber`, `@IsBoolean`, `@IsOptional`, etc.). Required: `name`, `target`, `effect`, `severity`, `channelPrefixes`, `operator`, `threshold`, `suppressionLevel`. Optional: `metric`, `isAcknowledgeable`, `delay`, `condition`, `order`, `notifySupport`.

### UpdateAlarmConfigInput — `dto/alarm-config.input.ts:10-17`
`PartialType(AlarmConfig, InputType)` → **all fields optional**, plus a re-declared **required non-null** `_id: ID` (`:12-16`). Used by both `updateAlarmConfig` and each element of a bulk update.

### BulkUpdateAlarmConfigInput — `dto/alarm-config.input.ts:19-26`
| Field | Type | Validation | Purpose |
|---|---|---|---|
| `data` | `[UpdateAlarmConfigInput]` | `@ArrayNotEmpty()`, `@ValidateNested({ each: true })`, `@Type(() => UpdateAlarmConfigInput)` | Batch of rule updates (used for save-all + drag-reorder). |

### AlarmStatusSummaryInput — `denowatts-backend/src/alarm-config/dto/alarm-status.input.ts:49-58`
| Field | Type | Validation | Purpose |
|---|---|---|---|
| `company` | `ID` (`ObjectId`) | `@IsMongoId()`, `@IsOptional()` | Company filter. Honored only for Super Admins; non-super-admins are forced to their own company. |

### AlarmStatusSummaryResponse (ObjectType) — `dto/alarm-status.input.ts:5-47`
| Field | Type | Nullable | Purpose |
|---|---|---|---|
| `_id` | `ID` | no | The alarm config id. |
| `name` | `String` | yes | Rule name. |
| `siteCount` | `Number` | yes | Distinct sites with an open alarm for this rule. |
| `severity` | `String` | yes | Rule severity. |
| `sites` | `[ID]` | yes | Distinct site ids with an open alarm. |
| `totalOpenAlarmEvents` | `Number` | yes | Count of open alarm events for this rule. |
| `unacknowledgedCount` | `Number` | yes | Open alarm events with no `acknowledgedBy`. |

> The `description` text on `totalOpenAlarmEvents` and `unacknowledgedCount` in the source says "The number of acknowledged events" for both — this is a **copy-paste mislabel in the DTO descriptions**; the actual aggregation computes "total open" and "unacknowledged" respectively (`service.ts:181-206`). Flagged for human review.

---

## Alarm evaluation logic {dev}

Two distinct concerns, both *outside* the CRUD service:

### 1. Where alarms are actually evaluated (NOT in this repo)
No backend code reads `threshold`/`operator`/`suppressionLevel`/`delay`/`condition` to fire alarms. Events arrive already flagged `isAlarm: true` with `severity` and `alarmConfig` populated. `events.service.ts` and `channels.service.ts` only *filter/aggregate* on `isAlarm`/`alarmConfig` (e.g. `events.service.ts:321-388`, `channels.service.ts:389-409`); they never compute a threshold breach. **Conclusion:** the actual threshold evaluation engine that turns these `AlarmConfig` rules into alarm events lives in an upstream data-processing pipeline not present in the searched `src` tree. *(Flagged for human review — confirm where rule→event evaluation runs.)*

### 2. Alarm notification dispatch (webhooks) — `denowatts-backend/src/webhooks/webhook.service.ts`
Triggered by `POST /webhooks/event/process-alarm` (`webhook.controller.ts:38-42`) with body `EventProcessAlarmDto` (`webhooks/dto/webhook-site.dto.ts:115-122` — `_id: ObjectId` required, optional `description`). This is how an alarm open/close turns into emails + in-app notifications.

`processAlarm(dto)` (`webhook.service.ts:422-581`):
1. Loads the event by `_id`, populating `site.managers` (emails) and `alarmConfig` (selecting only `name notifySupport`) (`:426-439`).
2. Guards: throws `NotFoundException` if the event is missing or `!event.isAlarm` (`:441-443`); throws if `event.alarmGroup` is set ("Event is part of an alarm group") (`:445-447`).
3. Loads candidate companies for the site (owner + access companies, de-duplicated) via `loadCompaniesForAlarmNotification` (`:59-106`).
4. `collectAlarmNotificationRecipientIdSets` (`:111-194`) maps the **event severity** to a `NotificationEventType` and finds each company's matching, `isActive` notification setting; from it gathers email + in-app recipient user ids (site managers and/or explicit "other users") based on `emailNotifications` / `inAppNotifications` flags. **This is the link between alarm severity and who gets notified.**
5. Creates in-app notifications for in-app recipients (`:486-503`).
6. **`notifySupport` consumption:** reads `alarmConfig.notifySupport`; `buildSupportEmailRecipientsForAlarm` (`:196-198`) adds the DenoWatts support email **only in production** and only when `notifySupport` is true. This is the single place `AlarmConfig.notifySupport` is used.
7. If no recipients → returns `"No recipients found"` (`:514-516`).
8. Sends a templated email: **closed alarm** template if `event.endDate` exists (subject `Closed Alarm (<Severity>): ...`), otherwise **created alarm** template (subject `New Alarm (<Severity>): ...`) (`:532-570`). Severity is `capitalizeSentence(event.severity)`. Times are formatted in the site timezone (default `America/New_York`).
9. All errors are caught, logged, sent to Sentry, and the method returns the string `"Failed to process alarm notification"` (`:573-580`) — it does **not** re-throw.

**So the only `AlarmConfig` fields the runtime actually consumes are: `name` + `notifySupport` (webhook emails), `severity`/`order`/`name` (status aggregation), and all fields for display/editing in the UI.**

---

## Business rules (cited) {dev}
- Alarm configs are **global**, not per-company; `findAll` never filters by company, it only gates non-super-admins who lack a company — `alarm-config.service.ts:26-31`.
- **Authoring is Super-Admin-only.** Resolver class is `@Roles(SUPER_ADMIN)` (`alarm-config.resolver.ts:14`); only `alarmConfigs` and `alarmStatusSummary` are re-opened to all roles via `@AllRoles()` (`resolver.ts:19`, `:59`). Frontend mirrors this: `useGlobalAlarmAccess.ts:13-15` sets `canManageAlarmConfigs = isSuperAdmin`; non-super-admins get a read-only table.
- **`name` must be unique** — DB unique index (`schema.ts:45`) + in-batch dedupe check in `bulkUpdate` (`service.ts:54-58`) + frontend pre-checks on add/duplicate (`GlobalAlarmPage.tsx:94-97`, `AlarmConfigTable.tsx:293-296`).
- **Target-driven field clearing (UI rule):** `SITE_METRIC` → `channelPrefixes` cleared to `[]`; `CHANNEL_STATUS` → `metric` cleared to `null`. Enforced both on save (`GlobalAlarmPage.tsx:152-171`) and live in the table (`AlarmConfigTable.tsx:1069-1082`, `:402-406`, `:566-570`).
- **Suppression level constrained to 1–5** in the UI (`AlarmConfigTable.tsx:842-848`); schema allows any number.
- **`condition` limited to two presets** in the UI: `None` or `irr>100 w/m2` (`AlarmConfigTable.tsx:964-967`).
- **Status rollup = only open, non-deleted, non-archived, non-group alarm events**, scoped to the requesting user's company unless Super Admin overrides — `alarm-config.service.ts:100-167`.
- **Support email only fires in production and only when `notifySupport` is true** — `webhook.service.ts:196-198`.
- New-alarm defaults from the UI: `target=CHANNEL_METRIC`, `effect=DISCONNECTED`, `severity=CRITICAL`, `channelPrefixes=['1.1.1']`, `operator=EQUAL`, `metric=''`, `threshold=0`, `suppressionLevel=1`, `notifySupport=false` (`GlobalAlarmPage.tsx:114-125`).

## Data touched {dev}
- `alarmconfigs.*` — full CRUD; the rule catalog. Created/updated/deleted by the service; read (sorted by `order`) by `findAll`, `findOne`, `getAlarmStatusSummary` — `alarm-config.service.ts`.
- `alarmconfigs.name` — unique index; uniqueness enforced on create/bulk-update.
- `alarmconfigs.order` — drives every sort and the drag-reorder bulk save.
- `events.{isAlarm,isAlarmGroup,alarmConfig,site,endDate,deletedAt,archivedAt,acknowledgedBy,severity}` — read-only here, via `$lookup` in `getAlarmStatusSummary`, to count open/unacknowledged alarms per rule.
- `sites._id` — read via `SitesService.getAllSites` to scope the status rollup to a company.
- `companies.notificationSettings` + `users.email` — read by webhook `processAlarm` to resolve alarm notification recipients.

## Edge cases & gotchas {dev}
- **No referential cleanup on delete.** Deleting an `AlarmConfig` leaves `Event.alarmConfig` pointers dangling; those events simply stop appearing in `alarmStatusSummary` (their `$lookup` join no longer matches a config). — `alarm-config.service.ts:48-50`.
- **`create` does not catch duplicate-name errors**, but `bulkUpdate` does — a single create with a colliding `name` returns a raw Mongo `E11000` error to the client; a bulk update returns a friendly `BadRequestException`. — `service.ts:37-39` vs `:69-74`.
- **`_id` is passed inside the bulk update body.** Harmless (Mongo ignores `_id` mutation), but means the entire row object — including `__typename` if the frontend forgets to strip it — is sent as the update doc. The frontend spreads `...config` directly (`GlobalAlarmPage.tsx:159`).
- **DTO description mislabel:** both `totalOpenAlarmEvents` and `unacknowledgedCount` are described as "The number of acknowledged events" in `alarm-status.input.ts` — inaccurate; see Alarm evaluation logic. Flagged.
- **Severity dropdown uses `EventSeverity`, not `AlarmConfigSeverityType`** (`AlarmConfigTable.tsx:25,778`). They are value-identical (`CRITICAL/HIGH/ROUTINE`), so this is currently safe but is a coupling risk if either enum diverges.
- **`isAcknowledgeable` is orphaned in the UI/API:** it exists on the schema (default `false`) and in the service test mock, but no GraphQL query/mutation selects it and the editor never renders it. Its value can only be set via a direct create/update mutation that includes it. Flagged for human review.
- **`getAlarmStatusSummary` short-circuits to `[]`** for a non-super-admin with no company (`service.ts:82-83`) — the portfolio alarm table renders empty in that case rather than erroring.
- **Route is not wrapped in `ProtectedRoute`.** Unlike sibling Super-Admin settings routes, `/settings/global-alarm-configuration` (`router.tsx:458-464`) has no route-level guard; access control is entirely in-page (`useGlobalAlarmAccess` → read-only table + hidden Add/Save buttons) and on the backend resolver. A non-super-admin can reach the page but cannot mutate.
- **`alarmConfig(_id)` and `deleteAlarmConfig` advertise non-null `AlarmConfig`** in the schema but the service can return `null` (not found) — a bad id resolves to `null` against a non-null field, which Apollo will surface as a GraphQL non-null violation error.

---

## Solar & platform terminology {dev}

- **Alarm rule (`AlarmConfig`)** — one catalog entry describing an alarm-worthy condition: target + effect + severity + operator/threshold + suppression/delay/condition.
- **Target** — what the rule watches: `SITE_METRIC` (site-level value), `CHANNEL_METRIC` (a metric on matching channels), or `CHANNEL_STATUS` (connection state).
- **Effect** — the failure described: `UNAVAILABLE`, `DISCONNECTED`, or `VALUE_ABNORMAL`.
- **Severity** — `CRITICAL / HIGH / ROUTINE`; copied onto every alarm event the rule produces and used as the key into company notification settings.
- **Channel prefix** — the 5-character dotted code (e.g. `1.1.1`) identifying a device type; rules use prefixes to say which equipment they apply to. See [[channels]] and [[device-types]].
- **Threshold / operator** — the comparison (`>`, `<`, `=`) and value a rule describes; evaluated upstream, not in this codebase.
- **Suppression level** — a 1–5 de-bounce setting intended to dampen flapping alarms; stored here, consumed upstream.
- **Condition** — an optional gate such as `irr>100 w/m2` (only alarm when irradiance exceeds 100 watts per square metre, i.e. daytime).
- **Open alarm** — an alarm event with no end date; the rollup counts open alarms and how many remain unacknowledged.
- **Alarm group** — a parent event bundling related child alarms; group parents are excluded from the rollup. See [[events]].
- **`notifySupport`** — the per-rule flag that CCs Denowatts support on alarm emails (production only); consumed by the [[webhooks]] dispatch.
- **Irradiance** — the solar power falling on a surface (W/m²), the platform's core measured resource.

For the full domain vocabulary, see [[solar-glossary]].

---

**Related flows:** [[events]] · [[notification]] · [[webhooks]] · [[status]] · [[portfolio]] · [[settings]] · [[channels]] · [[solar-glossary]]
