# Agenda (Job Scheduler)

**What it does (business):** Agenda is a MongoDB-backed background job scheduler (cron/queue) that runs the platform's deferred and recurring work without blocking GraphQL/REST requests. It is registered once at app boot as a global NestJS provider, persists all jobs as documents in a MongoDB collection (`agendaJobs`), and survives restarts because the schedule lives in the database rather than in memory. As of this codebase the **only** feature wired to Agenda is **scheduled report generation/emailing** — every active report template becomes one repeatable Agenda job that, when it fires, builds a fleet-summary Excel and emails it to recipients.

**Entry point(s):** Background service — no direct UI and no route. `AgendaService` starts on app boot (`OnModuleInit`) and stops on shutdown (`OnModuleDestroy`). Jobs are defined/scheduled indirectly from the report module (template create/update/delete and app bootstrap), never by a user request to an "agenda" endpoint.

> **Scope note:** Agenda is one of **two** schedulers in this backend. The other is `@nestjs/schedule` (`ScheduleModule.forRoot()` in `denowatts-backend/src/app.module.ts:100`), which powers `@Cron`-decorated methods that run in-process and are **not** stored in `agendaJobs`. The single `@Cron` job found is documented under "Other schedulers" below so the job inventory is complete, but it does **not** go through `AgendaService`.

## AgendaService API — `denowatts-backend/src/agenda/agenda.service.ts`

`AgendaService` is a thin wrapper around the `agenda` npm package (`agenda@^6.2.5`) using the `@agendajs/mongo-backend` driver (`@agendajs/mongo-backend@^4.0.2`). It is `@Injectable()` and lives in a `@Global()` module (`denowatts-backend/src/agenda/agenda.module.ts:4`), so any module can inject `AgendaService` without importing `AgendaModule`.

The service intentionally exposes a **minimal** surface — it only owns the singleton lifecycle and hands out the raw `Agenda` instance. All job definition/scheduling is done by callers against that raw instance.

#### `constructor(configService: ConfigService)` — `agenda.service.ts:11-20`
- Builds a single `Agenda` instance and stores it on `this.agenda`.
- Backend: `new MongoBackend({ address: MONGO_URI, collection: "agendaJobs" })` — connects to the same MongoDB as the rest of the app (env `MONGO_URI`, fetched via `getOrThrow`, so a missing value crashes boot) and stores all job docs in the `agendaJobs` collection.
- `processEvery: "30 seconds"` — the worker polls MongoDB for due jobs every 30 s.
- `maxConcurrency: 10` — at most 10 jobs run concurrently across the whole instance.

#### `onModuleInit(): Promise<void>` — `agenda.service.ts:22-25`
- Calls `this.agenda.start()` — begins the polling loop and processing. Logs `"Agenda started"`.
- NestJS calls this automatically once all modules are initialized.

#### `onModuleDestroy(): Promise<void>` — `agenda.service.ts:27-30`
- Calls `this.agenda.stop()` for a graceful shutdown (stops picking up new jobs, lets in-flight ones drain). Logs `"Agenda stopped"`.

#### `getAgenda(): Agenda` — `agenda.service.ts:32-34`
- Returns the raw `Agenda` instance. **This is how every consumer accesses the full Agenda API** (`define`, `every`, `now`, `cancel`, …). There are no convenience methods — callers use the underlying library directly.

### Agenda library methods used by consumers (all via `getAgenda()`)
These are not defined on `AgendaService` but are the Agenda APIs actually exercised in the codebase:
- **`.define(name, handler)`** — registers an in-memory handler for a job name. Required before a job of that name can be processed; idempotent if called again for the same name. — `denowatts-backend/src/report/report.processor.ts:86`
- **`.every(cron, name, data, options)`** — creates/updates a single repeatable job doc that fires on `cron`. Used with `{ skipImmediate: true }` so scheduling doesn't trigger an immediate run. — `denowatts-backend/src/report/report.service.ts:284-291`
- **`.now(name, data)`** — queues a one-off job to run as soon as the worker picks it up (used for immediate/test runs). — `denowatts-backend/src/report/report.service.ts:331-333`
- **`.cancel(query)`** — deletes matching job docs from `agendaJobs` (used to unschedule a template). — `denowatts-backend/src/report/report.service.ts:310-313`

## Configuration
All Agenda config is in the constructor — `denowatts-backend/src/agenda/agenda.service.ts:12-19`:

| Setting | Value | Where |
|---|---|---|
| MongoDB collection | `agendaJobs` | `agenda.service.ts:15` |
| MongoDB connection | env `MONGO_URI` (via `getOrThrow`) | `agenda.service.ts:14` |
| Poll interval (`processEvery`) | `"30 seconds"` | `agenda.service.ts:17` |
| Max concurrency | `10` | `agenda.service.ts:18` |
| Module scope | `@Global()` provider, exported | `agenda.module.ts:4-8` |
| Registration | imported in `AppModule` | `denowatts-backend/src/app.module.ts:101` |

No per-job concurrency/lock/priority overrides are set anywhere — only the global `maxConcurrency: 10`. Default Agenda lock/`lockLifetime` behavior applies (not configured in code).

## Complete job inventory

There is exactly **one Agenda job definition pattern**, instantiated **once per active report template** (the job NAME is the template's `_id`). So the number of live Agenda jobs equals the number of report templates with `notificationSettings.isActive === true`.

| Job name | Schedule | What it does | Defined in | file:line |
|---|---|---|---|---|
| `<reportTemplateId>` (= the template's Mongo `_id`) | Cron built from the template's notification settings (UTC) — see schedule table below | Generates a fleet-summary report for the template and emails it (Excel attachment for FLEET type) to recipients | `ReportProcessor.defineJobForTemplate()` defines handler; `ReportService.addRepeatableReportForTemplate()` schedules it | handler `denowatts-backend/src/report/report.processor.ts:84-102`; schedule `denowatts-backend/src/report/report.service.ts:284-291` |
| `<reportTemplateId>` (one-off) | `.now()` — runs immediately once | Same handler as above; an ad-hoc immediate run (e.g. when a template is created/updated) | `ReportService.queueReportForTemplate()` | `denowatts-backend/src/report/report.service.ts:322-335` |
| `generate-daily-report` (**legacy / cancel-only**) | n/a | A previous single-shared-name scheme. No longer scheduled; only referenced in `.cancel()` to clean up stale docs from before the per-template-name fix | constant in `report.processor.ts`, cancelled in `report.service.ts` | const `denowatts-backend/src/report/report.processor.ts:35`; cancel `denowatts-backend/src/report/report.service.ts:313` |

**Cron schedule derivation** (`ReportService.buildCronFromSettings()` — `denowatts-backend/src/report/report.service.ts:132-169`), where `m`/`h` are the template's `notificationSettings.minute`/`hour` interpreted as **UTC**:

| `ScheduleFrequency` | Cron expression | Notes |
|---|---|---|
| `DAILY` | `m h * * *` | every day at UTC h:m |
| `EVERY_MONDAY` | `m h * * 1` | Mondays |
| `FIRST_DAY_OF_MONTH` | `m h 1 * *` | day 1 |
| `LAST_DAY_OF_MONTH` | `m h 28-31 * *` | over-fires; processor re-checks actual last day |
| `FIRST_DAY_OF_YEAR` | `m h 1 1 *` | Jan 1 |
| `LAST_DAY_OF_YEAR` | `m h 31 12 *` | Dec 31 |
| default | `m h * * *` | falls back to daily |

> No other module in the backend calls `getAgenda()`, `.define()`, `.every()`, `.now()`, or `.schedule()`. Verified by grepping the entire `denowatts-backend/src/` tree. There are **no** rollup jobs, alarm-check jobs, or data-ingestion jobs running through Agenda — those, if scheduled at all, are not in this codebase's Agenda usage.

## Job details

### `<reportTemplateId>` — scheduled report generation (the only real Agenda job)

**Trigger / schedule:**
- A repeatable job is (re)created whenever a report template with active notifications is **created** (`ReportTemplateService.create` → `addRepeatableReportForTemplate`, `report-template.service.ts:132-137`) or **updated** (`report-template.service.ts:314-320` — always removes then re-adds), and removed on **delete** (`report-template.service.ts:335-336`).
- On every **app boot**, `ReportTemplateService.onApplicationBootstrap()` (`denowatts-backend/src/report/services/report-template.service.ts:104-119`) re-registers the in-memory handler (`defineJobForTemplate`) for each active template. It does **not** re-schedule — the `every()` doc already persists in `agendaJobs`, so the cron survives restarts; only the handler is in-memory and must be re-defined so the worker knows how to run existing docs.
- `skipImmediate: true` is passed to `.every()` so scheduling does not fire a run right away (`report.service.ts:290`).
- Scheduling is **skipped entirely when `NODE_ENV === "staging"`** (`addRepeatableReportForTemplate` `report.service.ts:270-275`; `queueReportForTemplate` `report.service.ts:323-328`).

**Step-by-step (handler `ReportProcessor.defineJobForTemplate` → `handleDailyReportGeneration`, `denowatts-backend/src/report/report.processor.ts:84-632`):**
1. Wrapper handler logs start, calls `handleDailyReportGeneration(job)`, logs success, and **re-throws** on error so Agenda marks the job failed (`report.processor.ts:86-101`).
2. Reads `job.attrs.data.reportTemplateId` and loads the `ReportTemplate` with `notificationSettings.otherUsers`, `metrics.metric` (+ nested expression metrics), `createdBy`, and `company` populated (`report.processor.ts:153-187`). Missing template → warn + return (no-op).
3. **Active guard:** if `notificationSettings.isActive` is false, skip (`report.processor.ts:189-193`).
4. **Day guard:** `ReportService.isScheduleDueOnDay(schedule, dayjs.utc())` re-validates the calendar day. This is what makes `LAST_DAY_OF_MONTH` correct even though its cron fires on days 28–31 (`report.processor.ts:195-202`, logic `report.service.ts:86-103`).
5. **Resolve site IDs** via `resolveSiteIdsForTemplate` (`report.processor.ts:109-151`): if `isAllSites`, scope by template creator — `SUPER_ADMIN` creators get all non-deleted sites; others get sites owned by or shared with the creator's company; optional `servicesStatus` filter applies. Otherwise use `template.sites`.
6. **Build recipient list** (`report.processor.ts:207-279`): named `otherUsers` emails, plus — if `isSiteManagers` — emails of all ACTIVE managers of the resolved sites (manager IDs deduped as strings). Dedup to `uniqueEmails`; if empty → warn + return.
7. **Resolve date window** from `template.dateRangeType` only (`getEmailDateWindowFromType`, `report.service.ts:189-264`) and build a "View Report" deep link to `REPORTS_FRONTEND_URL` with `templateId/mode/startDate/endDate` params.
8. **FLEET templates only:** resolve metric names/units/KPI flags (including custom-column helper metrics), call `ReportService.getFleetSummaryNew(...)`, and build an `.xlsx` buffer via `buildFleetExcelBuffer` → base64 email attachment. Excel errors are caught and logged but do **not** abort the email (`report.processor.ts:347-599`).
9. **Staging guard:** if `NODE_ENV === "staging"`, log and return without sending (`report.processor.ts:601-606`).
10. Send via `EmailService.sendEmailWithTemplate(DENOWATTS_HTML_EMAIL_TEMPLATE_ID, uniqueEmails, …)` with the message body and attachment (`report.processor.ts:608-619`).

**Collections read:** `agendaJobs` (job doc), `reporttemplates` (template), `sites`, `users` (managers / otherUsers), `metrics`, `sitedailyrollups` (via `getFleetSummaryNew`).
**Collections written:** `agendaJobs` only (Agenda updates run/lock state). No business collection is written — the side effect is an **email send** (SendGrid).
**Downstream effects:** SendGrid email with optional Excel attachment; deep link into the reports frontend.

### `<reportTemplateId>` — immediate one-off run (`.now()`)
- Same handler as above; scheduled via `ReportService.queueReportForTemplate()` (`report.service.ts:322-335`). Used for immediate generation; calls `defineJobForTemplate` first so the handler exists, then `getAgenda().now(name, { reportTemplateId })`.

## Lifecycle helpers (report module → Agenda)

| Method | Agenda call | Purpose | file:line |
|---|---|---|---|
| `addRepeatableReportForTemplate` | `removeRepeatableReportForTemplate` then `define` + `every(cron, …, {skipImmediate:true})` | Schedule/refresh the recurring job | `report.service.ts:266-302` |
| `removeRepeatableReportForTemplate` | `cancel({name})` + `cancel({name:GENERATE_DAILY_REPORT_JOB, data})` | Unschedule current + legacy docs | `report.service.ts:305-319` |
| `queueReportForTemplate` | `define` + `now(name, data)` | One-off immediate run | `report.service.ts:322-335` |
| `removePendingJobsForTemplate` | delegates to `removeRepeatableReportForTemplate` | Cleanup on delete | `report.service.ts:338-341` |
| `defineJobForTemplate` | `define(name, handler)` | Register handler (idempotent) | `report.processor.ts:84-102` |

## Other schedulers (NOT Agenda — listed for completeness)

| Job | Schedule | What it does | Mechanism | file:line |
|---|---|---|---|---|
| `QuickBooksService.proactiveTokenRefresh` | every 30 minutes | Refreshes the active QuickBooks OAuth token before it expires | `@nestjs/schedule` `@Cron(CronExpression.EVERY_30_MINUTES)` — in-process, **not** in `agendaJobs` | `denowatts-backend/src/shared/quickbooks/quickbook.service.ts:376-386` |

`ScheduleModule` is registered both globally (`denowatts-backend/src/app.module.ts:100`) and in the QuickBooks module (`denowatts-backend/src/shared/quickbooks/quickbook.module.ts:14`). No `@Interval` or `@Timeout` decorators exist in the backend. Despite the backend `CLAUDE.md` mentioning "Redis + BullMQ", **no BullMQ queues, `@Processor`, or workers were found** in `denowatts-backend/src/` — the actual job queue in use is Agenda. (The report types file at `report-service.types.ts:8` still has stale "Bull job payload" / "serializes to Redis" comments left over from a prior Bull implementation; the runtime is Agenda.)

## Business rules
- **Job name = template `_id`.** Each template gets its own Agenda document so cancel/reschedule is per-template and idempotent — `denowatts-backend/src/report/report.processor.ts:38`.
- **Handlers are in-memory; schedules are persisted.** On restart, `onApplicationBootstrap` re-`define`s handlers for active templates but never re-`every`s, relying on the persisted `agendaJobs` docs — `denowatts-backend/src/report/services/report-template.service.ts:104-119`.
- **Staging never schedules or sends.** `NODE_ENV === "staging"` short-circuits scheduling, immediate queueing, and email send — `report.service.ts:270-275`, `report.service.ts:323-328`, `report.processor.ts:601-606`.
- **Schedule fires by cron, but the actual run is re-gated by `isActive` + day check** inside the handler, so disabling a template or a wrong calendar day results in a clean no-op — `report.processor.ts:189-202`.
- **`LAST_DAY_OF_MONTH` deliberately over-fires** (`28-31`) and depends on the in-handler day check to run only on the true last day — `report.service.ts:94-95`, `report.service.ts:152-155`.
- **Update always removes then re-adds** the schedule (no in-place edit) — `report-template.service.ts:314-320`.

## Edge cases & gotchas
- **Concurrency:** global cap is `maxConcurrency: 10` (`agenda.service.ts:18`); there is no per-job concurrency or priority. With many templates due at the same UTC minute, runs are throttled to 10 at a time.
- **Poll latency:** `processEvery: "30 seconds"` means a job can run up to ~30 s after its cron time; sub-minute precision is not guaranteed.
- **Missed runs (downtime):** because schedules live in MongoDB, a job whose cron time passed while the app was down will be picked up on next poll after restart (standard Agenda catch-up). Handlers are re-registered at boot so existing docs are processable.
- **Retries / failure handling:** the handler re-throws on error (`report.processor.ts:99`, `:630`), so Agenda records the failure; **no explicit retry/backoff is configured** in code, so default Agenda behavior applies (the failed run is not auto-retried beyond Agenda's defaults — the next scheduled occurrence runs normally).
- **Excel failures are swallowed:** if Excel generation throws, it is logged and the email is still sent without the attachment (`report.processor.ts:591-598`).
- **Legacy job docs:** the old shared `generate-daily-report` name is only ever cancelled, never created; this exists to purge stale docs from before the per-template-name scheme (`report.service.ts:313`). Don't reintroduce scheduling under that name.
- **No dedicated worker process:** Agenda runs **inside the main NestJS app process** (started in `onModuleInit`). There is no separate worker deployment — scaling the app to multiple instances means each instance runs an Agenda worker against the shared `agendaJobs` collection (Agenda's locking prevents double-processing).
- **`MONGO_URI` is required at boot** (`getOrThrow`) — a missing value crashes the app before Agenda can start (`agenda.service.ts:14`).
- **Stale Bull/Redis comments:** the codebase still carries comments referencing Bull/Redis (`report-service.types.ts:8-10`); the live implementation is Agenda over MongoDB. Trust the code, not those comments.

**Related flows:** [report.md](./report.md) (the sole consumer — template CRUD, scheduling lifecycle, Excel/fleet-summary generation), [data-out.md](./data-out.md) (`sitedailyrollups` and other rollup collections the report job reads), [notification.md](./notification.md) (SendGrid email delivery the job triggers), [webhooks.md](./webhooks.md) (other async/integration entry points).
