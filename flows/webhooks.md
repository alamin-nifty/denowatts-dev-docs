# Webhooks

**What it does (business):** The webhooks module is the backend's **inbound REST integration surface** — the only place the otherwise GraphQL-first backend exposes plain HTTP `POST` endpoints to external systems. It receives webhooks from **HubSpot** (the CRM) to keep portal `Site` and `Company` records in sync with CRM deals/quotes, and it receives an **alarm-processing** webhook (from the internal alarm/event detection pipeline) that fans a triggered alarm event out into **email notifications** (via SendGrid) and **in-app notification records** for the right users. It also wraps the HubSpot CRM API (`HubSpotService`) for use by this and other modules.

**Entry point(s):** All endpoints are mounted under the REST prefix `webhook` and are guarded by a shared-secret bearer guard. There is **no frontend UI** for this module — a `grep` for "webhook" across `denowatts-portal/src/` returns zero matches. Callers are HubSpot workflows and the internal alarm pipeline, not the portal.
- Controller: `denowatts-backend/src/webhooks/webhook.controller.ts`

## Webhook flows overview

This module mixes **two unrelated inbound concerns** behind one controller:

1. **HubSpot CRM sync (inbound + outbound to HubSpot)** — HubSpot fires a webhook on its side (create/update site, create/update company, "send quote email"). The handler reads/writes the portal MongoDB **and** calls back out to the HubSpot REST API via `HubSpotService` to write the new portal `_id` back onto the HubSpot object (`site_portal_id` / `company_portal_id`), so the two systems stay cross-linked. External systems involved: **HubSpot CRM API** (`@hubspot/api-client`), **Google Maps** (geocoding new site addresses), **SendGrid** (quote email).
2. **Alarm dispatch (inbound trigger → outbound notifications)** — the alarm/event detection pipeline `POST`s the event id to `webhook/event/process-alarm`. The handler loads the `Event`, resolves which users should be notified based on **per-company `notificationSettings`**, then dispatches **SendGrid emails** and creates **in-app `Notification` documents**. External systems: **SendGrid**. See [Alarm dispatch flow (detailed)](#alarm-dispatch-flow-detailed).

`HubSpotService` is also exported and reused outside this module (`exports: [HubSpotService, WebhookService]` in `webhook.module.ts`).

## API surface (REST endpoints)

All routes live in `denowatts-backend/src/webhooks/webhook.controller.ts`. Every handler is decorated `@HttpCode(HttpStatus.OK)` (returns `200` even on the create endpoints), is `@Public()` (skips the normal JWT auth), and the whole controller is `@UseGuards(WebhookGuard)` (shared-secret bearer instead — see [Auth](#auth--webhookguard)).

| Method / Path | What it does | Input DTO | Output |
|---|---|---|---|
| `POST /webhook/hubspot/create-site` | Create a portal `Site` from a HubSpot site object; geocode address; link owner company; write `site_portal_id` back to HubSpot. | `WebhookCreateSiteDto` | `{ success: boolean, message: string }` |
| `POST /webhook/hubspot/update-site` | Update a portal `Site` (mainly `owner`) by id. | `WebhookUpdateSiteDto` | `{ success: boolean, message: string }` |
| `POST /webhook/hubspot/create-company` | Create a portal `Company`; write `company_portal_id` back to HubSpot. | `WebhookCreateCompanyDto` | `{ success: boolean, message: string }` |
| `POST /webhook/hubspot/update-company` | Update a portal `Company` name + merge billing info. Controller splits `companyId` from the rest before calling the service. | `WebhookUpdateCompanyDto` | `{ success: boolean, message: string }` |
| `POST /webhook/event/process-alarm` | Dispatch an alarm event to email + in-app notifications. | `EventProcessAlarmDto` | `string` (status message, e.g. `"An email has been sent successfully!"`) |
| `POST /webhook/hubspot/email-quote` | Look up a HubSpot deal's primary contact and email them a quote link. | `EmailQuoteDto` | `string` (status message) |

Note: `WebhookUpdateCompanyDto` is the only handler with controller-level logic — `webhook.controller.ts:52-55` destructures `{ companyId, ...rest }` and calls `webhookService.updateCompany(companyId, rest)`.

### Auth — `WebhookGuard`

`denowatts-backend/src/common/guards/webhook.guard.ts`. Every request must carry header `Authorization: Bearer <WEBHOOK_SECRET>`.
- Missing header → `401 UnauthorizedException('Authorization header is missing')` (`webhook.guard.ts:22-24`).
- Header that does not exactly equal `` `Bearer ${WEBHOOK_SECRET}` `` → `401 UnauthorizedException('Invalid authorization header')` (`webhook.guard.ts:26-28`).
- `WEBHOOK_SECRET` is a required env var, validated in `denowatts-backend/src/config/env.validation.ts:22`.

## Services

### WebhookService — `denowatts-backend/src/webhooks/webhook.service.ts`

Injects (constructor, `webhook.service.ts:44-54`): `SitesService`, `HubSpotService`, `CompaniesService`, `EmailService`, `EventsService`, `ConfigService`, `GoogleMapsService`, `UsersService`, `NotificationService`. Has a private `Logger`. **Every public method is wrapped in `try/catch` that reports to `Sentry.captureException` and returns a soft failure value instead of throwing** — so HubSpot/callers always get a `200` with a `success:false`/error string rather than a 5xx.

#### `createSite(dto: WebhookCreateSiteDto)` → `{ success, message }`
`webhook.service.ts:203-302`
- Validates `dto.name` and `dto.serviceStatus` are present; throws plain `Error` if not (caught → `success:false, "Failed to create site"`).
- **DB read:** `sitesService.findOne({ name: dto.name }, undefined, true)` (3rd arg `internal=true`). If a site with that name exists → returns `{ success:true, message: ERROR_MESSAGES.SITE_ALREADY_EXISTS }` (idempotent, treated as success).
- **External HTTP (Google Maps):** if `dto.address` present, `googleMapsService.getCoordinates(dto.address)` → `{ lng, lat }`. Stored as GeoJSON-style `location.coordinates = [lng, lat]`.
- **DB write:** `sitesService.create({ name, location:{address,city,state,zip}, serviceStatus, [coordinates] })`.
- **External HTTP (HubSpot write-back):** `hubSpotService.update("p_sites", String(dto.hsObjectId), { properties: { site_portal_id: newSite._id } })` — writes the new portal id back onto the HubSpot custom object.
- **External HTTP (HubSpot read):** `hubSpotService.getAssociations("p_sites", hsObjectId, "companies")`, then picks the association with `type === "site_owner"`, fetches that company (`findOne("companies", id, ["name","company_portal_id"])`).
- **DB write (conditional):** if that HubSpot company already has a `company_portal_id`, `sitesService.update(newSite._id, { _id, owner: new ObjectId(company_portal_id) }, false)` — links the new site to its owner company.
- Returns `{ success:true, message: "Site <id> created successfully" }`.
- **Throws/errors:** any failure is caught → Sentry + `{ success:false, message:"Failed to create site" }`.

#### `updateSite(dto: WebhookUpdateSiteDto)` → `{ success, message }`
`webhook.service.ts:304-326`
- **DB write:** `sitesService.update(dto.siteId, { _id: dto.siteId, ...dto })`. In practice the only updatable field on this DTO besides `siteId` is `owner`.
- If `sitesService.update` returns falsy → throws `Error("Site update failed")` → caught → `{ success:false, "Failed to update site" }`.
- Success → `{ success:true, "Site <id> updated successfully" }`.

#### `updateCompany(companyId, dto: Omit<WebhookUpdateCompanyDto, "companyId">)` → `{ success, message }`
`webhook.service.ts:328-372`
- **DB read:** `companiesService.findOne({ _id: companyId })`. If not found → `{ success:false, "Company not found" }`.
- **Merge logic:** builds `billingInfo` by spreading existing `company.billingInfo` then conditionally overlaying each provided field (`address`, `city`, `state`, `zipCode`, `email`, `phone`) — each only applied if truthy (`webhook.service.ts:341-349`). Empty/missing fields preserve existing values.
- **DB write:** `companiesService.update(companyId, { [name?], billingInfo }, {} as User, true)` — `{} as User` is a fake actor (no real auth user in a webhook), `true` = internal flag.
- Success → `{ success:true, "Company <id> updated successfully" }`. Error → Sentry + `{ success:false, "Failed to update company" }`.

#### `createCompany(dto: WebhookCreateCompanyDto)` → `{ success, message }`
`webhook.service.ts:374-420`
- **DB read:** `companiesService.findOne({ name: dto.name })`. If exists → `{ success:true, message: ERROR_MESSAGES.COMPANY_ALREADY_EXISTS }` (idempotent).
- **Payload build:** `CreateCompanyInput` with `verifiedDomains: dto.domain ? [dto.domain] : []` and `billingInfo` from the `billingInfo*` fields (zip coerced to string via `.toString()`, empty string fallback).
- **DB write:** `companiesService.create(payload)`.
- **External HTTP (HubSpot write-back):** `hubSpotService.update("companies", String(dto.hsObjectId), { properties: { company_portal_id: newCompany._id } })`.
- Success → `{ success:true, "Company <id> created successfully" }`. Error → Sentry + `{ success:false, "Failed to create company" }`.

#### `processAlarm(dto: EventProcessAlarmDto)` → `string`
`webhook.service.ts:422-581` — **the alarm dispatch handler.** Fully detailed in [Alarm dispatch flow](#alarm-dispatch-flow-detailed). Summary of effects:
- **DB read:** `eventsService.findById(dto._id)` with nested `.populate` of `site` (and site's `managers` selecting `email`) and `alarmConfig` (selecting `name notifySupport`).
- **Guards / throws (caught internally):** throws `NotFoundException("Event not found")` if `!event || !event.isAlarm`; throws `NotFoundException("Event is part of an alarm group")` if `event.alarmGroup` is set. Both are caught by the surrounding try/catch.
- **DB reads:** `companiesService.find(...)` (owner + access companies), `usersService.find(...)` (active, non-deleted recipients).
- **Side effect — in-app:** `notificationService.createMany([...])` inserts one `Notification` document per in-app recipient.
- **Side effect — email:** `emailService.sendEmailWithTemplate(...)` (SendGrid) using the **closed** or **created** alarm template depending on whether `event.endDate` is set.
- **Returns** one of: `"Event not found"`-style errors are swallowed; on the happy path returns `"An email has been sent successfully!"`; if no recipients resolve, returns `"No recipients found"`; on caught error logs via `this.logger.error(...)` + Sentry and returns `"Failed to process alarm notification"`.

Private helpers used by `processAlarm`:
- **`loadCompaniesForAlarmNotification(eventSite)`** (`webhook.service.ts:59-106`) — builds an ordered, de-duplicated list of company ids: **owner first**, then each unique `accesses[].company`. **DB read:** `companiesService.find({ _id: { $in: [...] } })`. Returns companies re-ordered to match (owner first, then accesses in order). Returns `[]` if no company ids.
- **`collectAlarmNotificationRecipientIdSets(companies, eventSeverity, siteManagers)`** (`webhook.service.ts:111-194`) — pure (no DB); returns `{ emailRecipientIdStrings, inAppRecipientIdStrings, inAppNotificationType }`. Logic: if no `eventSeverity` → empty sets. For each company, finds the active `notificationSettings` entry whose `type` equals the event severity (only if severity is a valid `NotificationEventType`) and `isActive === true`. From that setting: if `siteManagers` flag → adds all site-manager user ids; if `otherUsers` set → adds them. Then de-dupes, and splits into the email set (if `emailNotifications`) and in-app set (if `inAppNotifications`). `inAppNotificationType` is set to the matched setting's `type`. **Note:** only one company's `type` is captured into `inAppNotificationType` — the last matched one wins (it is reassigned per company, `webhook.service.ts:157`).
- **`buildSupportEmailRecipientsForAlarm(notifySupport)`** (`webhook.service.ts:196-201`) — in `NODE_ENV === production`: returns `[EMAIL.DENOWATTS_SUPPORT]` only if `notifySupport` truthy, else `[]`. In **non-production: always returns `[EMAIL.DENOWATTS_SUPPORT]`** (so dev/staging always CC support). `EMAIL.DENOWATTS_SUPPORT = "support@denowatts.com"` (`denowatts-backend/src/common/constants/email.ts:2`).

#### `emailQuote(dto: EmailQuoteDto)` → `string`
`webhook.service.ts:583-622`
- **External HTTP (HubSpot):** `hubSpotService.findOne("deals", dto.dealId.toString(), ["name"], ["contacts"])`.
- Reads first associated contact id `deal?.associations?.contacts?.results?.[0]?.id`; if none → returns `"Failed to send email quote"`.
- **External HTTP (HubSpot):** `hubSpotService.findOne("contacts", contactId, ["firstname","lastname","email"])`. If no `email` → `"Failed to send email quote"`.
- Builds `quoteUrl = ${FRONTEND_URL}/order/${deal.id}`.
- **Side effect — email (SendGrid):** `emailService.sendEmailWithTemplate(EMAIL_QUOTE_TEMPLATE_ID, recipientEmail, { dynamicTemplateData: { name: "<firstname> <lastname>", quoteUrl } })`.
- Returns `"Email send successfully"` (note the typo in the literal). Error → Sentry + `"Failed to send email quote"`.

### HubSpotService — `denowatts-backend/src/webhooks/hubspot.service.ts`

Thin wrapper over `@hubspot/api-client` (CRM) plus a raw `HttpService` for file uploads. Constructed with a `HubSpot.Client` whose `Authorization` header is `Bearer <HUBSPOT_API_KEY>` (env var, validated `env.validation.ts:21`). **Every method swallows errors → `Sentry.captureException` then returns `undefined`** (except `uploadFiles`, which throws `InternalServerErrorException`).

| Method | HubSpot SDK call | Purpose |
|---|---|---|
| `findAll(objectType, requestBody)` | `crm.objects.searchApi.doSearch` | Search objects. `hubspot.service.ts:29` |
| `findOne(objectType, objectId, properties?, associations?)` | `crm.objects.basicApi.getById` | Get one object, optionally with props/associations. `:42` |
| `create(objectType, requestBody)` | `crm.objects.basicApi.create` | Create object (arrow-function property). `:63` |
| `update(objectType, objectId, requestBody)` | `crm.objects.basicApi.update` | Patch object — used for write-back of portal ids. `:73` |
| `getAssociations(fromType, fromId, toType)` | `crm.associations.batchApi.read` | Returns `results[0].to` (e.g. site→companies). `:87` |
| `createAssociation(fromType, fromId, toType, toId, type)` | `crm.associations.batchApi.create` | Create association. `:105` |
| `getProperties(objectType, propertyName)` | `crm.properties.coreApi.getByName` | Read a property definition. `:137` |
| `uploadFiles(file, fileName, folderId?)` | raw `POST https://api.hubapi.com/files/v3/files` (multipart, `PUBLIC_INDEXABLE`) | Upload a file to HubSpot. **Throws** `InternalServerErrorException` on bad input/error. `:150` |
| `deleteFile(id)` | `files.filesApi.archive` | Archive a HubSpot file. `:188` |

HubSpot object types referenced by `WebhookService`: `"p_sites"` (custom object), `"companies"`, `"deals"`, `"contacts"`. Custom properties written: `site_portal_id`, `company_portal_id`. Association type read: `"site_owner"`.

## Schemas

This module defines **no schemas of its own**. It reads/writes schemas owned by other modules. The relevant ones:

### Notification (written by `processAlarm`) — `denowatts-backend/src/notification/schemas/notification.schema.ts`
`@Schema({ timestamps: true })`, so `createdAt`/`updatedAt` are auto-managed.

| Field | Type | Required | Indexed | Purpose |
|---|---|---|---|---|
| `_id` | ObjectId | auto | yes (pk) | Notification id |
| `recipient` | ObjectId → `User` | **yes** (`required: true`) | no | Who sees this in-app notification (`:40`) |
| `sender` | ObjectId → `User` | no | no | Who triggered it — set to `event.createdBy` (`:49`) |
| `type` | enum `NotificationType` | no | no | Notification category; set to the matched alarm severity/type (`:58`) |
| `title` | string | no | no | Display title (`:66`) |
| `message` | string | no | no | Body (unused by alarm dispatch) (`:75`) |
| `link` | string | no | no | Deep link — set to `${FRONTEND_URL}/events-feed/<eventId>` (`:84`) |
| `metadata` | Mixed (JSON) | no | no | Arbitrary blob — alarm dispatch stores `{ eventId, senderName }` (`:92`) |
| `read` | boolean | no (default `false`) | no | Read flag (`:100`) |
| `readAt` | Date | no | no | Read timestamp (`:109`) |
| `createdAt` / `updatedAt` | Date | auto | no | Timestamps (`:119`/`:128`) |

`NotificationType` enum (`:7-20`): `MENTION, ADMIN, TICKET, MAINTENANCE, CRITICAL, HIGH, ROUTINE, LESSONS_LEARNED, MALFUNCTION, SITE_DIAGNOSTICS, DATA_CURATION, NOTES`.

### Company.notificationSettings (read by `processAlarm`) — `denowatts-backend/src/companies/schemas/company.schema.ts`
Sub-document array `notificationSettings: NotificationSettings[]` (`company.schema.ts:189`). `NotificationSettings` (`@Schema({ _id: false })`, `:41-90`):

| Field | Type | Required | Default | Purpose |
|---|---|---|---|---|
| `id` | number | no | — | UI row id (`:48`) |
| `type` | enum `NotificationEventType` | **yes** | — | Which event/alarm type this rule applies to (`:54`) |
| `siteManagers` | boolean | no | `false` | If true, notify all of the site's managers (`:61`) |
| `inAppNotifications` | boolean | no | `false` | Enable in-app notification creation (`:68`) |
| `emailNotifications` | boolean | no | `false` | Enable email send (`:75`) |
| `otherUsers` | [ObjectId → `User`] | no | `[]` | Extra specific recipients (`:82`) |
| `isActive` | boolean | no | `true` | Whether this rule is enabled (`:89`) |

`NotificationEventType` enum (`:17-29`): `CRITICAL, HIGH, ROUTINE, TICKET, ADMIN, MAINTENANCE, LESSONS_LEARNED, MALFUNCTION, SITE_DIAGNOSTICS, DATA_CURATION, NOTES`. **Alarm events carry `severity ∈ {CRITICAL, HIGH, ROUTINE}`** (`EventSeverity`, `event.schema.ts:76-80`), and matching is done by `severity === notificationSettings.type`.

### Event (read by `processAlarm`) — `denowatts-backend/src/events/schemas/event.schema.ts`
Fields consumed: `_id`, `title`, `description`, `startDate`, `endDate?`, `severity?` (`EventSeverity`), `createdBy` (→ used as notification `sender`), `isAlarm?`, `alarmGroup?`, `alarmConfig?` (→ `AlarmConfig`), `site` (populated), `site.managers` (populated, `email` selected), `site.timezone`.

### AlarmConfig (read via populate) — `denowatts-backend/src/alarm-config/schemas/alarm-config.schema.ts`
Only `notifySupport` (boolean, default `false`, `:135`) is consumed by `processAlarm` (plus `name`, selected but unused in the dispatch body). It decides whether Denowatts support is CC'd in production.

### Site / SiteAccess (read by `processAlarm` + `createSite`) — `site.schema.ts`, `site-access.schema.ts`
From `Site`: `owner?` (Company ref, `:488`), `accesses?: SiteAccess[]` (`:571`), `managers?: [ObjectId → User]` (`:611`), `timezone?` (`:557`, default fallback `"America/New_York"`), `name`, `serviceStatus`. `SiteAccess` (`site-access.schema.ts:10-23`): `company: ObjectId → Company` (required), `companyName: string` (required).

## DTOs

All in `denowatts-backend/src/webhooks/dto/webhook-site.dto.ts`. Validated by the global `ValidationPipe` (class-validator decorators).

### WebhookCreateSiteDto
| Field | Type | Validation | Purpose |
|---|---|---|---|
| `hsObjectId` | number | `@IsNumber()` | HubSpot custom-object id (for write-back) |
| `name` | string? | `@IsString() @IsNotEmpty()` | Site name (logically required; service also re-checks) |
| `city` | string? | `@IsString() @IsOptional()` | Location city |
| `state` | string? | `@IsString() @IsOptional()` | Location state |
| `address` | string? | `@IsString() @IsOptional()` | Street address (geocoded) |
| `zipCode` | string? | `@IsString() @IsOptional()` `@Transform(value?.toString())` | Zip, coerced to string |
| `serviceStatus` | `SiteServiceStatus`? | `@IsEnum() @IsOptional()` `@Transform(value.toUpperCase().replace(/ /g,'_'))` | Normalizes e.g. `"In Service"`→`IN_SERVICE` |

### WebhookUpdateSiteDto
| Field | Type | Validation | Purpose |
|---|---|---|---|
| `siteId` | ObjectId | `@IsMongoId()` | Target site |
| `owner` | ObjectId? | `@IsMongoId() @IsOptional()` | New owner company |

### WebhookUpdateCompanyDto
| Field | Type | Validation | Purpose |
|---|---|---|---|
| `companyId` | ObjectId | `@IsMongoId()` | Target company (stripped off by controller) |
| `name` | string? | `@IsString() @IsOptional()` | New company name |
| `address`/`city`/`state`/`zipCode`/`email`/`phone` | string? | `@IsString() @IsOptional()` | Billing fields, merged into `billingInfo` |

### WebhookCreateCompanyDto
| Field | Type | Validation | Purpose |
|---|---|---|---|
| `hsObjectId` | number | `@IsNumber()` | HubSpot company id (write-back) |
| `name` | string | `@IsString()` | Company name |
| `domain` | string? | `@IsString() @IsOptional()` | Becomes `verifiedDomains:[domain]` |
| `billingInfoAddress`/`...City`/`...State` | string? | `@IsString() @IsOptional()` | Billing fields |
| `billingInfoZipCode` | number? | `@IsNumber() @IsOptional()` | Zip (coerced to string on create) |
| `billingInfoEmail`/`billingInfoPhone` | string? | `@IsString() @IsOptional()` | Billing contact |

### EventProcessAlarmDto
| Field | Type | Validation | Purpose |
|---|---|---|---|
| `_id` | ObjectId | `@IsMongoId()` | The triggered `Event` id |
| `description` | string? | `@IsString() @IsOptional()` | Override description used in the email (`dto.description || event.description`) |

### EmailQuoteDto
| Field | Type | Validation | Purpose |
|---|---|---|---|
| `dealId` | number | `@IsNumber()` | HubSpot deal id |

## Alarm dispatch flow (detailed)

End-to-end path for `POST /webhook/event/process-alarm` (`webhook.service.ts:422-581`). Trigger: the internal alarm-detection pipeline `POST`s `{ _id, description? }` for an event it has flagged as an alarm.

1. **Auth** — `WebhookGuard` requires `Authorization: Bearer <WEBHOOK_SECRET>`.
2. **Load event** — `eventsService.findById(dto._id)` populating:
   - `site` → and within it `managers` (selecting only `email`),
   - `alarmConfig` (selecting `name notifySupport`). (`:426-439`)
3. **Validity guards** (caught internally, return error strings):
   - `!event || !event.isAlarm` → `NotFoundException("Event not found")`.
   - `event.alarmGroup` set → `NotFoundException("Event is part of an alarm group")` (grouped alarms are suppressed — only standalone alarms dispatch). (`:441-447`)
4. **Resolve companies** — `loadCompaniesForAlarmNotification(eventSite)`: owner company first, then each unique `accesses[].company`; single `$in` query; preserves order. (`:451`)
5. **Resolve recipient id sets** — `collectAlarmNotificationRecipientIdSets(companies, event.severity, siteManagers)`:
   - For each company, find an **active** `notificationSettings` row whose `type === event.severity` (severity must be one of the `NotificationEventType` values).
   - That row's flags decide recipients: `siteManagers` → all site managers; `otherUsers` → those user ids. The union is de-duped, then partitioned into an **email set** (if `emailNotifications`) and an **in-app set** (if `inAppNotifications`). (`:453-458`)
6. **Load recipient users** — union of both id sets, then `usersService.find({ _id:{$in}, deletedAt:null, status:UserStatus.ACTIVE }, {} as User, true)` — **only ACTIVE, non-deleted users are notified.** (`:464-477`)
7. **Email recipients** — map the email-set users to `user.email`, de-duped, pushed into `siteNotificationEmails`. (`:479-484`)
8. **In-app notifications** — for in-app-set users, build `CreateNotificationInput[]` and call `notificationService.createMany(...)` (fire-and-forget `insertMany`, not awaited). Each record (`:490-501`):
   - `recipient: user._id`
   - `sender: event.createdBy`
   - `type: inAppNotificationType` (the matched severity/type)
   - `title: "New <type> event created: <event.title>"`
   - `link: "${FRONTEND_URL}/events-feed/<event._id>"`
   - `metadata: { eventId: event._id, senderName: "Trinity Trinity" }`
   - **⚠️ Known finding — hardcoded `senderName: "Trinity Trinity"`** (`webhook.service.ts:499`). The string `` `Trinity Trinity` `` is literally hardcoded into every alarm in-app notification's metadata, regardless of the real sender (`event.createdBy`). The actual `sender` ObjectId is set correctly, but the human-readable `metadata.senderName` is this placeholder. This looks like leftover test/seed data and should be flagged for human review — it likely surfaces as the displayed sender name in the in-app notification UI.
9. **Support recipients** — `notifySupport` from the populated `alarmConfig`; `buildSupportEmailRecipientsForAlarm(notifySupport)` returns `["support@denowatts.com"]` (prod: only if `notifySupport`; non-prod: always). (`:506-508`)
10. **Final email recipient list** — `[...new Set([...siteNotificationEmails, ...supportEmailRecipients])]`. If empty → return `"No recipients found"` (no email sent). (`:510-516`)
11. **Build email payload:**
    - Hardcoded `bccMails = "asayeed@denowatts.com"` (`:517`) — every alarm email is BCC'd to this address. **Flag for review** (a personal/specific address hardcoded into dispatch).
    - Timezone from `eventSite.timezone || "America/New_York"`; dates formatted `MM/DD/YYYY HH:mm` via dayjs `.tz()`. (`:519-522`)
    - `severity` = `capitalizeSentence(event.severity)`; `link` points to the analytics chart `siteFunctionalTest` starting one day before the event start: `${FRONTEND_URL}/analytics?site=<siteId>&chart=siteFunctionalTest&startDate=<startDate-1day>`. (`:524-528`)
12. **Send email (SendGrid):** branch on `event.endDate`:
    - **Closed alarm** (`endDate` set): template `ALARMED_EVENT_CLOSED_TEMPLATE_ID` (`d-7d9200c5ac9248d5be644c1ed73cac58`), subject `"Closed Alarm (<Severity>): <site> <title>"`, includes `endTime` and `duration` (`preciseDiff(startDate,endDate)`). (`:532-552`)
    - **New alarm** (no `endDate`): template `ALARMED_EVENT_CREATED_TEMPLATE_ID` (`d-6e3654bdbb33424f82882aa17732aa0b`), subject `"New Alarm (<Severity>): <site> <title>"`. (`:553-570`)
    - Both pass `description: dto.description || event.description` and the analytics `link`. Email send is fire-and-forget (`sendEmailWithTemplate` returns `void`, internally `.catch`es). (`email.service.ts:55-104`)
13. **Return** `"An email has been sent successfully!"`. Any thrown error in the whole method → `this.logger.error(...)` + Sentry + return `"Failed to process alarm notification"`. (`:572-580`)

## Business rules
- Webhook endpoints require a shared-secret bearer token, not JWT — `webhook.guard.ts:26`.
- All handlers return HTTP `200` and never surface exceptions to the caller; failures are swallowed to Sentry and returned as `{success:false}`/error strings — `webhook.service.ts` (every method's catch block).
- Create-site / create-company are **idempotent by name**: an existing match returns `success:true` with an "already exists" message instead of duplicating — `webhook.service.ts:220-225`, `380-385`.
- On site/company creation the portal `_id` is written **back into HubSpot** (`site_portal_id` / `company_portal_id`) so CRM and portal stay cross-linked — `webhook.service.ts:258-263`, `401-407`.
- Site owner is derived from the HubSpot `"site_owner"` association, and only set if the associated HubSpot company already has a `company_portal_id` — `webhook.service.ts:271-289`.
- Alarm dispatch only fires for **standalone alarm events** (`isAlarm === true` and **no** `alarmGroup`) — `webhook.service.ts:441-447`.
- Alarm recipients are gated by per-company `notificationSettings` matching the event **severity**, with the rule `isActive` — `webhook.service.ts:148-155`.
- Only **ACTIVE, non-deleted** users receive alarm notifications — `webhook.service.ts:472-473`.
- Support (`support@denowatts.com`) is CC'd in production only when the alarm's `AlarmConfig.notifySupport` is true; in non-production it is always added — `webhook.service.ts:196-201`.
- In-app alarm notifications hardcode `metadata.senderName = "Trinity Trinity"` — `webhook.service.ts:499` **(bug/placeholder — flag for review).**
- Every alarm email is BCC'd to the hardcoded `asayeed@denowatts.com` — `webhook.service.ts:517` **(flag for review).**

## Data touched
- `sites` (read by name, read by id, **create**, **update owner/coordinates**) — site sync from HubSpot + read in alarm dispatch — `sites.service.ts` via `WebhookService`.
- `sites.location.coordinates` — written as `[lng, lat]` from Google Maps geocoding — `webhook.service.ts:253`.
- `sites.owner` — set from HubSpot `site_owner` association's `company_portal_id` — `webhook.service.ts:280-287`.
- `companies` (read by name/id, **create**, **update name/billingInfo**) — company sync from HubSpot; read in alarm dispatch (owner + accesses) — `companies.service.ts`.
- `companies.billingInfo.*` — merged on update — `webhook.service.ts:341-349`.
- `companies.notificationSettings` — **read** to resolve alarm recipients — `webhook.service.ts:137-187`.
- `events` — **read** (with `site`, `site.managers`, `alarmConfig` populated) in alarm dispatch — `webhook.service.ts:426-439`.
- `users` — **read** to resolve active recipient emails/ids — `webhook.service.ts:465-477`.
- `notifications` — **insertMany** (one per in-app recipient) — `webhook.service.ts:502` → `notification.service.ts:20-22`.
- HubSpot CRM objects `p_sites`, `companies`, `deals`, `contacts` — read + write `site_portal_id`/`company_portal_id` via `HubSpotService`.
- Google Maps geocoding API — read coordinates for new site addresses — `webhook.service.ts:249`.
- SendGrid — outbound alarm + quote emails (templates `d-6e3654…`, `d-7d9200…`, `d-16d32f…`) — `email.service.ts`.

## Edge cases & gotchas
- **`processAlarm` returns the same shape (`string`) on success and on swallowed error** — callers can't reliably distinguish `"No recipients found"` / `"Failed to process alarm notification"` from success without string matching.
- **`inAppNotificationType` last-wins:** if multiple companies match different `type`s (shouldn't normally happen since type = severity), the in-app notification `type` is overwritten per-company — `webhook.service.ts:157`.
- **Fire-and-forget writes:** `notificationService.createMany` (no `await`, no `.catch`) and `emailService.sendEmailWithTemplate` (returns `void`) — failures in these do not affect the returned status string and are only visible via internal logging/Sentry.
- **Severity / type coupling:** alarm recipients only resolve if `event.severity` is one of `CRITICAL/HIGH/ROUTINE` **and** a matching active `notificationSettings.type` exists. An alarm with no severity → **no in-app/email recipients at all**, leaving only the support email (which itself depends on env + `notifySupport`).
- **`createSite` only links owner if HubSpot company has `company_portal_id`** — a brand-new HubSpot company not yet synced to the portal leaves the site owner-less even though the association exists.
- **`HubSpotService` write-backs and reads silently return `undefined` on error** — e.g. if the HubSpot write-back of `site_portal_id` fails, `createSite` still returns `success:true` (the site is created in the portal but un-linked in HubSpot, with the error only in Sentry).
- **No frontend** — there are no portal pages and therefore no `pages.generated.json` entries for this module; the only consumers are HubSpot workflows and the internal alarm pipeline.
- **`WebhookGuard` does constant-time-unsafe string equality** on the bearer token (`!==`) — minor, but worth noting for a secret-comparison path — `webhook.guard.ts:26`.
- **`webhook.service.spec.ts` tests re-implemented helper functions, not the real service.** The spec re-declares local copies (`buildNotificationRecipients`, `validateSiteData`, etc.) that **do not match the current production logic** (e.g. it models a `SiteNotificationMethod.EMAIL_SITE_MANAGERS` channel and a `notification.emails` array that the real `processAlarm` no longer uses — the real code uses per-company `notificationSettings`). These tests give a false sense of coverage; flag for human review.

**Related flows:**
- [notification.md](./notification.md) — in-app + email notification delivery (this module is one of the producers of `Notification` records).
- [events.md](./events.md) — the `Event` model and alarm/event lifecycle that triggers `process-alarm`.
- [site.md](./site.md) — `Site`, `accesses`, `managers`, `owner` consumed here.
- [settings.md](./settings.md) — where per-company `notificationSettings` (the alarm recipient rules) are configured.
- [quote.md](./quote.md) — order/quote flow related to the `email-quote` webhook (`/order/<dealId>`).
- _No `alarm-config.md` exists yet_ — the `AlarmConfig.notifySupport` rule consumed here should be cross-linked once that doc is written.
