# Code-review findings — compiled from the documentation passes

Everything the documentation effort flagged "for human review", in one prioritized checklist.
Each item cites the code location and the flow doc that explains it in context.
Documentation-only artifact — nothing here has been changed in the code.

> Compiled 2026-06-11 from all 27 flow docs. Priorities: **P1** security, **P2** likely bugs,
> **P3** placeholders/incomplete features, **P4** dead code & cleanup, **P5** performance/indexes,
> **P6** architecture questions to confirm.

---

## P1 — Security

- [ ] **No refresh-token rotation or server-side revocation.** Refresh tokens are stateless 7-day JWTs; logout only clears `localStorage`; a leaked token stays valid for its full life. `refreshToken()` also doesn't re-check user status, so a soft-deleted user can keep minting access tokens briefly. — `auth.service.ts:285-309` · doc: [authentication](authentication.md)
- [ ] **Sign-up leaks account existence** ("Email already exists") while forgot-password is carefully anti-enumeration. Inconsistent. — `auth.service.ts:66` · doc: [authentication](authentication.md)
- [ ] **`channelRaw` / `channelDataCount` GraphQL queries have no role guards** — any authenticated user can query any site's raw data by ObjectId; and the `internal: true` flag bypasses all date-range limits with no secondary check. — `device-data.resolver.ts:14-22`, `device-data.service.ts` · doc: [data-out](data-out.md)
- [ ] **`moveDenoboxFile` silently sets `ACL: 'public-read'`** on the destination copy — moving a private file makes it public. — `storage.service.ts:459` · doc: [storage](storage.md)
- [ ] **No `folder` parameter sanitization on Denobox uploads** — path-traversal strings (`../../`) pass straight into S3 keys. — `storage.service.ts:120-121` · doc: [storage](storage.md)
- [ ] **TLS verification disabled** on the capacity-test POST to the Matrix Python service (`rejectUnauthorized: false`). — `sites.service.ts:740-743` · docs: [tests](tests.md), [site](site.md)
- [ ] **`channelFaults` has no role guard** and triggers one paid OpenAI call per fault code — a cost/abuse vector for any authenticated user. — `channels.resolver.ts:64`, `channels.service.ts:1106` · docs: [tests](tests.md), [channels](channels.md)
- [ ] **No server-side ownership check on `updateEvent` / `removeEvent`** — any signed-in user who knows an event id can modify or delete it. — `events.service.ts` · doc: [events](events.md)
- [ ] **`updatePrompt` has no ownership check** — any authenticated user can edit any prompt by `_id`. — `prompts.service.ts` · doc: [prompts](prompts.md)
- [ ] **Status-logs REST endpoints are fully public** (`@Public()`, no role guard) and `/status-logs/template` spreads the raw settings doc, leaking any extra stored fields. — `status-logs` controller · doc: [status-logs](status-logs.md)
- [ ] **`/metrics` and `/device-types` routes render outside the guarded app shell**, and the `deviceTypes` GraphQL query is `@Public()` (no token needed) while the page sits behind sign-in — confirm intentional. — `router.tsx:605-615` · docs: [settings](settings.md), [device-types](device-types.md)
- [ ] **Field-setup routes carry no `ProtectedRoute`/`CompanyRequiredRoute`** — only in-component guest gating + backend company scoping. Confirm intentional. — `router.tsx:293-348` · doc: [field-setup](field-setup.md)

## P2 — Likely bugs

- [ ] **`getSitesAccessCompanies` queries sites by a company id** (`findByIds([company])` → `sites._id IN [companyId]`), which essentially never matches — cross-company access expansion for the site dropdown almost certainly doesn't work as intended. — `sites.service.ts:787-802` · doc: [site](site.md)
- [ ] **`SitesService.update` un-archives the site's events on every save** — `restoreArchivedSiteEvents` runs whenever `deletedAt === null`, true for all live sites, not just on un-delete. — `sites.service.ts:426-428` · doc: [site](site.md)
- [ ] **Capacity-test wizard manual inputs may never render** — radios set enum values but the conditional render compares the string `'MANUAL'`; if the generated enum's runtime value is lowercase, manual TRC/filter fields never appear. — `CapacityTestStep2.tsx:229,288` · doc: [tests](tests.md)
- [ ] **Non-SuperAdmin notification-settings edits silently don't persist** — `CompaniesService.update` strips non-admin payloads to `{ siteTags }`, but the Notification Management page (reachable by any company user) submits `{ _id, notificationSettings }` through that same mutation. — `companies.service.ts:78-82` · docs: [companies](companies.md), [notification](notification.md)
- [ ] **`getPortfolioStatusSummary` doesn't exclude soft-deleted sites** (no `deletedAt: null` match, unlike `find`) — possible count discrepancy between the map/list and the rollup. — `sites.service.ts:883` vs `:146-148` · doc: [portfolio](portfolio.md)
- [ ] **`SiteDailyRollup` schema declares `timestamp` but the query filters on `date`** — separate fields or a bug. — `device-data.service.ts:93` · doc: [data-out](data-out.md)
- [ ] **Legacy chart request double-nests metrics** (`metrics: [metrics]` wraps an already-array). Dormant path (beta charts default on), but verify before ever re-enabling. — `chartApi.ts:46` · doc: [analytics](analytics.md)
- [ ] **`formatServiceStatus` returns `""` for COMMISSIONING** — commissioning sites sync a blank status to HubSpot. — `sites.service.ts:768-785` · doc: [site](site.md)
- [ ] **`ChannelsService.create` has no `GATEWAY` config case** — gateway channels are created config-less and must be patched via update; confirm intended. — `channels.service.ts:181` · doc: [channels](channels.md)
- [ ] **Race condition on channel `number` auto-increment** — `MAX(number)+1` is not atomic; concurrent creates collide on the unique index with no retry. — `channels.service.ts:215` · doc: [channels](channels.md)
- [ ] **`Metric.minRange`/`maxRange` are not persisted** — GraphQL fields with no `@Prop`; the admin UI sends them, Mongoose drops them. — `metrics` schema · doc: [metrics](metrics.md)
- [ ] **`createUser`/`updateUser` accept a `password` field but never hash it** — only the auth flow's `updatePassword` hashes; the open field on these inputs is a latent footgun. — `users.service.ts` · doc: [users](users.md)
- [ ] **`NotificationService.createMany` is fire-and-forget** — `insertMany` un-awaited with no error handling; bulk insert failures are silently swallowed. — `notification.service.ts` · doc: [notification](notification.md)
- [ ] **`PromptsService.create` returns `doc.save()` un-awaited inside its try/catch** — async persistence rejections bypass the method's Sentry/logging. — `prompts.service.ts:23` · doc: [prompts](prompts.md)
- [ ] **`User.lastName` nullability mismatch** — GraphQL non-nullable but Mongo not required; a doc without it throws on serialization (frontend works around with `|| ''`). — `user.schema.ts` · doc: [users](users.md)

## P3 — Placeholders & incomplete features (visible to users)

- [ ] **Alarm in-app notifications hardcode `senderName: "Trinity Trinity"`** — development placeholder in every alarm notification's metadata. — `webhook.service.ts:499` · doc: [webhooks](webhooks.md)
- [ ] **Every alarm email BCCs `asayeed@denowatts.com`** — a personal address hardcoded into dispatch. — `webhook.service.ts:517` · doc: [webhooks](webhooks.md)
- [ ] **Verify-installation `%` column is hardcoded `'0%'`** and the promised "red %" pass/fail is not implemented — the only real signal is a non-zero data count. — `VerifyInstallationForm.tsx:218-221` · doc: [field-setup](field-setup.md)
- [ ] **Site-status "Tasks" column is hardcoded `'-'`** — not wired to ticket counts (Portfolio view has the real number). — `SiteStatusView.tsx:299` · doc: [status](status.md)
- [ ] **Deno "Calibration Date" column is hardcoded `'N/A'`.** — `DenoListTable.tsx` · doc: [field-setup](field-setup.md)
- [ ] **Portfolio Energy KPIs / Triage / Irradiation sub-pages are static S3 screenshots**, not live charts. — `EnergyKPIsPage.tsx` etc. · doc: [portfolio](portfolio.md)
- [ ] **API Management is an orphaned route** — registered + guarded but absent from every menu and unlinked; reachable only by typed URL. Superseded or unfinished? — `router.tsx:414-424` · doc: [settings](settings.md)
- [ ] **Report `LAST_N_DAYS` range not implemented** — logs a warning and falls back to YESTERDAY. — `report.service.ts` · doc: [report](report.md)
- [ ] **Quote renewals always assume monofacial modules** — bifacial detection for renewals not implemented; operators adjust by hand. — doc: [quote](quote.md)
- [ ] **Site-level notification preferences are stored but never consumed** — `SiteNotificationSetting.channels`/`delay` saved but dispatch reads only company settings. Future feature or dead structure? — `site.schema.ts:105-136` · doc: [notification](notification.md)
- [ ] **Phone "8–15 digits" rule is frontend-only** — backend accepts any string ≤20 chars. — `auth.input.ts:56-58` · doc: [authentication](authentication.md)

## P4 — Dead code & cleanup

- [ ] **Delete the dead assets-module metrics trio** — `src/assets/metrics.resolver.ts`, `metrics.service.ts`, `metrics.service.spec.ts` are unregistered duplicates that have drifted from the active `src/metrics/` versions. (Keep the schema/DTO re-exports — still imported.) — docs: [metrics](metrics.md), [assets](assets.md)
- [ ] **`dto/create-asset.input.ts` superseded** — the resolver uses the class from `dto/asset.input.ts`. — doc: [assets](assets.md)
- [ ] **`CreateUserModal.tsx` is a dead stub** (titled "Create Event", unimported) — there is no working create-user UI. — doc: [users](users.md)
- [ ] **`webhook.service.spec.ts` doesn't test the real service** — re-implements local helper copies that no longer match production logic; false coverage. — doc: [webhooks](webhooks.md)
- [ ] **Stale "Bull/Redis" comments** — `report-service.types.ts` and backend CLAUDE.md claim BullMQ, but the live queue is Agenda over MongoDB; no Bull code exists. — doc: [agenda](agenda.md)
- [ ] **Prompts feature has no frontend consumer** — backend plumbed end-to-end and published in the schema, but nothing calls it. In-progress or abandoned? — doc: [prompts](prompts.md)
- [ ] **`JwtModule` default `expiresIn: '5m'` is dead config** — every sign() passes an explicit TTL. — `auth.module.ts:34` · doc: [authentication](authentication.md)
- [ ] **`AlarmConfig.isAcknowledgeable` is orphaned** — on the schema and test mocks, exposed by no operation, rendered nowhere. — doc: [alarm-config](alarm-config.md)
- [ ] **OTP flow has no identified caller** — `requestForOtp`/`verifyOtp` exist and are public, but no UI component invokes them. — doc: [authentication](authentication.md)

## P5 — Performance & indexes

- [ ] **`statuslogs` has no indexes** — every read sorts by `timestamp` desc and matches `metadata.service`/`subService`; needs a compound index at volume. — doc: [status-logs](status-logs.md)
- [ ] **`companies` lacks indexes on query targets** — `apiKey` (auth lookup on every public-API request), `verifiedDomains`, `whitelistedIPs`, `siteTags`. — doc: [companies](companies.md)
- [ ] **`comments` has no index on `event`** — the email-cycle query `find({ event })` slows on high-volume events. — doc: [events](events.md)
- [ ] **User name search is an unescaped regex** on raw input and ignores the existing text index — minor ReDoS/correctness smell. — doc: [users](users.md)
- [ ] **S3 listing hard-capped at 1,000 keys with no pagination** — large Denobox folders silently truncate; and search with `query` fires one `HeadObject` per matching file. — doc: [storage](storage.md)
- [ ] **`channels.findAll` resolves image URLs sequentially per channel** (awaited in a loop) — slow on image-heavy sites. — `channels.service.ts:657` · doc: [channels](channels.md)
- [ ] **Activity-log plugin uses process-global static state** (`previousData`/`updatedObject`) — concurrent writes can cross-attribute a log's before/changes. Also: **bulk operations are not audited at all.** — `activity-logs.service.ts:36-38` · doc: [activity-logs](activity-logs.md)

## P6 — Architecture confirmations (logic that lives outside this repo)

- [ ] **Where is connection status produced?** Nothing in the backend writes `Site/Channel.connectionStatus`, `lastReportedAt`, or `lastConnectedAt`. Confirm the external ingestion service, its staleness thresholds, and the channel→site PARTIALLY_CONNECTED rollup rule. — docs: [status](status.md), [status-logs](status-logs.md)
- [ ] **Where is alarm threshold evaluation run?** Alarm-config stores rules but nothing evaluates them here; events arrive pre-flagged. Confirm the upstream pipeline. — doc: [alarm-config](alarm-config.md)
- [ ] **Where do the chart services get their data?** Confirm whether `VITE_CHART_URL`/`VITE_PLOTLY_URL` proxy the NestJS report fleet-summary endpoint or compute independently from the rollups. — doc: [analytics](analytics.md)
- [ ] **Where do archived capacity-test report snapshots persist?** Not visible in this repo. — doc: [tests](tests.md)
- [ ] **DocuSeal SIGNED transition** — `processQuoteForSigning` leaves quotes in REQUESTED_FOR_SIGNING; the move to SIGNED presumably happens via an external webhook not found here. — doc: [quote](quote.md)
- [ ] **Channel-id taxonomy** — the prefix conventions (`1.1.1` POA, `1.1.2` GHI, `3.1` inverter, `5.2.1` AC meter…) are hard-coded in the frontend; confirm the canonical definition. — doc: [site-builder](site-builder.md)
- [ ] **`CAPACITY_TEST_PYTHON_SECRET` vs `PYTHON_SERVER_SECRET`** — two secrets for two Matrix endpoints, with a misleading name on the first (it gates *faults*, not run-test). Confirm both are set everywhere. — doc: [tests](tests.md)
