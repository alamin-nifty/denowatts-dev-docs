# Code-review findings — compiled and verified

Everything the documentation effort flagged "for human review", in one prioritized checklist.
**P1 and P2 have now been adversarially verified against the source code** (read-only, 2026-06-11):
each item carries a verdict — ✅ CONFIRMED · ⚠️ PARTIAL · ❌ REFUTED — with evidence. Four new
findings discovered during verification are listed in P0/P1. P3–P6 are documentation-pass
observations, not yet independently re-verified.

> Priorities: **P1** security, **P2** likely bugs, **P3** placeholders/incomplete features,
> **P4** dead code & cleanup, **P5** performance/indexes, **P6** architecture questions.
> Nothing here has been changed in the code — this is a review queue.

---

## ⚡ New findings discovered during verification

- [ ] ✅ **`updateMetric` has no `@Roles` guard** — unlike `createMetric` (SuperAdmin), any authenticated user of any company can mutate the **global** metric definitions. — `metrics.resolver.ts:43-47` vs `:59-75` · **High**
- [ ] ✅ **`updateChannel` / `removeChannel` / `channel` are fully unscoped** — no `@Roles`, no caller-company check anywhere in `ChannelsService.update/remove/findOne`; any authenticated user (even company-less) can read and rewrite **any channel's configuration** (gateway/Deno/Modbus settings on live installations) by id or serial, including presigned image URLs on read. — `channels.resolver.ts:35-50`, `channels.service.ts:704-829` · **High**
- [ ] ✅ **`channels.findAll` doesn't scope company users to their company** — it blocks company-less users, but for users *with* a company the query is built purely from the client-supplied filter, so any company user can list any site's channels. — `channels.service.ts:263-289` · **Medium-High**
- [ ] ✅ **`prompts` list query is unscoped** — any authenticated user can page through every user's prompt history (with creator name/email populated) by omitting the `createdBy` filter. — `prompts.resolver.ts:27-36`, `prompts.service.ts:50-78` · **Medium**

## P1 — Security (verified)

- [ ] ⚠️ **Refresh tokens: no rotation, no server-side revocation.** CONFIRMED: stateless 7-day JWTs, same token returned on refresh (`auth.service.ts:308`), no store/blacklist anywhere, logout only clears `localStorage`. REFUTED in part: although `refreshToken()` itself skips the status check (`:294`), an access token minted for a DELETED user is **inert** — `JwtStrategy → validateUser` rejects DELETED on every protected request (`:320-323`). **Medium.** Fix: token store or per-user token-version claim; add status filter in `refreshToken()` for depth.
- [ ] ✅ **Sign-up leaks account existence** ("Email already exists", `auth.service.ts:66`) while forgot-password is anti-enumeration (`:336-338`); login additionally distinguishes deleted/pending accounts. **Low-Medium.** Fix: generic signup response + "you already have an account" email.
- [ ] ✅ **`channelRaw`/`channelDataCount` GraphQL queries have no guards and no company scoping** — bare resolver (`device-data.resolver.ts:10-22`); `site` is even optional, fanning out across **all** sites when omitted (`device-data.service.ts:201-203`). Precision: the `internal: true` date-cap bypass lives on the REST path, which **is** ApiGuard-protected (`api.guard.ts:28-56`) — the GraphQL path has no date cap *or* scoping at all; also no result limit (`paginateQuery`'s 1000-cap is REST-only). **High.** Fix: roles + site-access scoping on both resolvers; make `site` required.
- [ ] ⚠️ **Storage: ACL + path traversal.** CONFIRMED (A): `moveDenoboxFile` copies with `ACL: 'public-read'` (`storage.service.ts:454-461`) while denobox uploads set no ACL — moving a private file makes it public. LOW-IMPACT (B): `folder`/paths are unsanitized but S3 keys are flat strings and `site` is `@IsMongoId()`-constrained, so `../` creates junk keys rather than reaching another tenant's real prefix. **Medium / Low.** Fix: drop the ACL on move; reject `..`/`/`-prefixed segments.
- [ ] ✅ **TLS verification disabled** on the capacity-test POST (`rejectUnauthorized: false`, `sites.service.ts:740-744`) — the only such occurrence in the backend (the faults call validates normally). **Medium.** Fix: trusted cert or CA pinning on the Python host.
- [ ] ✅ **`channelFaults`: no role guard, no site-access check, uncapped OpenAI fan-out** — loads any site by raw id (`channels.service.ts:1114-1120`) and fires one gpt-4.1 completion per fault code with no cache or cap (`:1154-1165`; `openai.service.ts:307`). **High** (denial-of-wallet + cross-tenant). Fix: roles + site-access check, cache by inverter+metric+code, cap codes per request.
- [ ] ✅ **No ownership check on event update/delete** — `removeEvent` doesn't even receive the user (`events.resolver.ts:54-57`); `update` uses the user only for email copy (`events.service.ts:512-587,662`); read path *is* company-scoped (`:421-430`), proving the omission. Cross-tenant IDOR with guessable ids from notification links. **High.** Fix: mirror the read-path scoping in update/remove.
- [ ] ✅ **No ownership check on prompt update** — `updatePrompt` takes no current user (`prompts.resolver.ts:22-25`); `createdBy` never re-checked (`prompts.service.ts:31-36`). **Medium-High.** Fix: `findOneAndUpdate({ _id, createdBy: user._id })`.
- [ ] ✅ **Status-logs REST fully public; `/template` spreads a `strict: false` doc** — class-level `@Public()` (`status-logs.controller.ts:7-8`); the settings schema is an empty class with `strict: false` (`settings.schema.ts:4-8`), so the spread leaks any field ever written to the SYSTEM_STATUS doc (today benign). **Low-Medium**, latent. Fix: whitelist the response fields; confirm public-by-design.
- [ ] ✅ **Metrics & Device Types fully public, end-to-end** — both routes are top-level siblings of `<App>` (`router.tsx:561,605-615`; no auth redirect applies), and the backend `deviceTypes` *and* `metrics`/`metricsWithPaginate` queries are all `@Public()` (`device-types.resolver.ts:6-14`, `metrics.resolver.ts:23-35`) — anonymous access to the catalogs. **Medium** (reference data, but see the new `updateMetric` finding above). Fix: move routes inside the shell; drop `@Public()` unless an external consumer needs it.
- [ ] ⚠️ **Field-setup guards.** Frontend PARTIAL: routes lack `ProtectedRoute`/`CompanyRequiredRoute` but sit inside `<App>`, which client-side-redirects unauthenticated visitors (`App.tsx:79-94`) — the missing layer is company/role only, and the `isGuestUser` gate is one disabled button (`FieldSetupDashboard.tsx:34,236`). Backend CONFIRMED **High** — covered by the new `updateChannel` finding above; the route-guard gap is cosmetic by comparison.
- [ ] ⚠️ **Storage upload auth.** Scoped correction: only `POST /storage/denobox/security-camera-upload` is `@Public()` + `SecuritySecretGuard` (static shared header secret, non-constant-time compare — `storage.controller.ts:56-58`, `security-secret.guard.ts:18-30`). The portal's `POST /storage/denobox/upload` and the other two upload endpoints **require JWT** (`storage.controller.ts:26-54`). **Low-Medium.** Fix: per-device credentials (or at least `timingSafeEqual`) for the camera endpoint.

## P2 — Likely bugs (verified)

- [ ] ✅ **`getSitesAccessCompanies` queries sites by a company id** — `findByIds([company])` runs `sites._id IN [companyId]` (`sites.service.ts:138-140,791`), which never matches, so the cross-company expansion is dead code and the function always returns `[company]`. Affects `getAllSites` and `companies.getSiteTags`. Likely intent: `find({ owner: company })`. **Confirmed bug** (under-exposure, not over-exposure).
- [ ] ❌ **REFUTED — site update un-archiving events.** `restoreArchivedSiteEvents` does run on every live-site save, but the only writer of `archivedAt` in the entire backend is site soft-deletion — so on live sites it matches zero events (no-op) and only takes effect on un-delete, which is correct. Optional hardening: gate on the deleted→live transition. *(Doc corrected.)*
- [ ] ❌ **REFUTED — capacity-test manual inputs.** The generated enums' runtime values are uppercase `'MANUAL'` (`graphql.ts:744-747,770-773`), matching the string comparison — the manual TRC/filter inputs render fine. Style-only: use the enum members. *(Doc corrected.)*
- [ ] ✅ **Non-admin notification-settings edits silently no-op, with a false success toast** — `CompaniesService.update` strips non-SuperAdmin payloads to `{ siteTags }` (`companies.service.ts:78-82`); `updateCompany` is `@AllRoles()` (`companies.resolver.ts:43-51`); the Notification Management page has no `ProtectedRoute` (`router.tsx:509-515`) and is in every company user's menu; its `onCompleted` unconditionally toasts "saved" (`NotificationManagementPage.tsx:385-391,419-426`). **Confirmed end-to-end.** Needs a product call: allowlist `notificationSettings` for non-admins, or gate the page.
- [ ] ✅ **Portfolio status summary includes soft-deleted sites** — `getPortfolioStatusSummary` builds its `$match` with no `deletedAt: null` (`sites.service.ts:852-884`), unlike `find` (`:145-148`) and `getAllSites` (`:808`); the input has no opt-in flag, so it can't be intentional. **Confirmed bug.** Fix: one line.
- [ ] ❌ **REFUTED (as a functional bug) — `SiteDailyRollup` `date` query.** Mongoose 8's `strictQuery: false` passes the undeclared `date` path through, and three shipping consumers query this externally-written collection by `date` — the documents have it; the query matches. Real issue is only that the schema is missing `@Prop() date`. *(Doc corrected.)*
- [ ] ⚠️ **Legacy chart `metrics: [metrics]` double-nesting** — wire shape confirmed (`chartApi.ts:46`; `metrics` is `string[]` end-to-end), but the receiving chart service is external and this is its only client, so the service evidently tolerates/expects the nesting. Can't be judged a defect from this repo; document the contract or fix both sides together.
- [ ] ✅ **`formatServiceStatus` blanks COMMISSIONING in HubSpot** — no COMMISSIONING case, `default: ""` (`sites.service.ts:768-785`); the truthy-status guard then **includes** `service_status: ""` in the HubSpot payload (`:508-510`), overwriting the property on every prod save of a commissioning site. **Confirmed bug.**
- [ ] ✅ **`ChannelsService.create` missing GATEWAY case — worse than flagged:** sending a valid `gatewayConfig` at create **throws** `BadRequestException("Invalid config")` (falls to `default`, `channels.service.ts:180-213`) even though the DTO advertises the field (`create-channel.input.ts:13-16`) and update/bulkUpdate both handle GATEWAY. Config-less create works. **Confirmed bug.**
- [ ] ✅ **Race on channel `number`** — non-atomic `MAX+1` (`channels.service.ts:215-216`) onto a global unique index (`channel.schema.ts:198`) with no transaction, retry, or duplicate-key catch (unlike `update`, `:826-849`) — concurrent creates 500 with a raw E11000. **Confirmed bug.**
- [ ] ✅ **`Metric.minRange`/`maxRange` silently dropped** — `@Field` with no `@Prop` (`metric.schema.ts:126-130`), strict-mode Mongoose discards them on create *and* update, while the mapped inputs accept them and the UI sends them (`MetricsUpsertModal.tsx:171-174`). The feature is a silent no-op. **Confirmed bug.** Fix: add the two `@Prop`s.
- [ ] ❌ **REFUTED — plaintext passwords via `createUser`/`updateUser`.** `User.password` has no `@Field` (`user.schema.ts:43-44`), so the mapped GraphQL inputs don't contain a password field at all — a client sending one fails GraphQL validation. Only `signUp` passes a password, argon2-hashed first. Residual: a future *internal* caller of `usersService.create` with a raw password would store plaintext. *(Doc corrected.)*
- [ ] ✅ **`NotificationService.createMany` floats its promise** — `insertMany` not awaited/returned/caught (`notification.service.ts:20-22`); all three callers invoke it bare, and even `comments.service.ts`'s surrounding try/catch can't see the rejection (`:134-137`). Failures silently lose notifications + risk `unhandledRejection`. **Confirmed bug.**
- [ ] ✅ **`PromptsService.create` un-awaited save in try/catch** (`prompts.service.ts:17-29`) — the rejection still reaches the caller, but the method's logger/Sentry capture is bypassed. **Confirmed, minor** (observability only). Fix: `return await`.
- [ ] ⚠️ **`User.lastName` nullability mismatch** — non-nullable GraphQL field over a non-required Mongo prop (`user.schema.ts:51-54`). All create paths require it, **but** `UpdateUserInput`'s `PartialType` accepts an explicit `lastName: null` (passes `@IsOptional()`, not in the forbidden-field list) and writes it — after which every query selecting that user's `lastName` throws a serialization error. Legacy docs also unconstrained. Fix: make the field nullable in GraphQL (or required in Mongo after backfill) and reject explicit null.

### Added 2026-09-30 — quote refresh (read from `main` source; not yet adversarially re-verified)

- [ ] **Customers can re-price a signed renewal / add-on quote** — list Edit is only disabled at PENDING/REQUESTED_FOR_SIGNING for non-super-admins (`QuoteManagementPage.tsx:543-549`), group edits route to the renew/add-products flows (`:273-288`), and `updateGroupQuoteBatch` checks access but not status (`quote.service.ts:1754-1770`). Editing a SIGNED/ORDERED/SHIPPED group rewrites products and parent totals after signature, resets edited children to PENDING, parent status unchanged. **Likely bug, Medium-High** (money after signature). · doc: [quote](quote.md)
- [ ] **Renewal plan type set from the first site for every site** — group SHIPPED uses the parent's `currentServices` (copied from `siteData[0]`) for all children (`quote.service.ts:494-498, 1552`). · doc: [quote](quote.md)
- [ ] **Renewal pre-fill compares two different plan types** — product uses `BASIC` (`quote.service.ts:1397`), tier/term use `ESSENTIAL_WEATHER` (`:1420-1425`); new-site shipping only writes `BASIC`/`ADVANCED` (`:436-438`). An Essential Weather site pre-fills as Energy Accounting / 5 years and becomes `ADVANCED` on renewal shipment. · doc: [quote](quote.md)
- [ ] **Multi-site VPN / outdoor enclosure never saved** — priced in the cart but omitted from the `BulkCreateQuotes` payload (`BulkCreatePage.tsx:1355-1356` vs `:1411-1437`). **Confirmed silent drop.** · doc: [quote](quote.md)
- [ ] **Group edits cannot remove a site** — upsert-only (`quote.service.ts:1829-1901`); stale children still count in parent totals (`:1925-1957`). · doc: [quote](quote.md)
- [ ] **Status guard allows forward skips** (e.g. PENDING → SHIPPED bypassing signature) — `quote.service.ts:310-312` only rejects backward moves. UI never offers it; server allows it for SUPER_ADMIN. · doc: [quote](quote.md)
- [ ] **`quoteOrder` turns every error into a 500** (incl. "not signed") — outer catch at `quote.service.ts:1125-1128`. Minor. · doc: [quote](quote.md)
- [ ] **Dead `/order/:dealId` route; blank `/:id` page** for WITHDRAWN, non-super-admin pre-signing, and `?tab=order` — `order/OrderPage.tsx:3-5`, `quote/QuotePage.tsx:35-83`. Minor. · doc: [quote](quote.md)

## P3 — Placeholders & incomplete features (from the documentation pass; not re-verified)

- [ ] **Alarm in-app notifications hardcode `senderName: "Trinity Trinity"`** — `webhook.service.ts:499` · doc: [webhooks](webhooks.md)
- [ ] **Every alarm email BCCs `asayeed@denowatts.com`** — `webhook.service.ts:517` · doc: [webhooks](webhooks.md)
- [ ] **Verify-installation `%` column hardcoded `'0%'`**; promised pass/fail not implemented — `VerifyInstallationForm.tsx:218-221` · doc: [field-setup](field-setup.md)
- [ ] **Site-status "Tasks" column hardcoded `'-'`** — `SiteStatusView.tsx:299` · doc: [status](status.md)
- [ ] **Deno "Calibration Date" hardcoded `'N/A'`** — `DenoListTable.tsx` · doc: [field-setup](field-setup.md)
- [ ] **Portfolio Energy KPIs / Triage / Irradiation are static S3 screenshots** — doc: [portfolio](portfolio.md)
- [ ] **API Management is an orphaned route** — `router.tsx:414-424` · doc: [settings](settings.md)
- [ ] **Report `LAST_N_DAYS` not implemented** (falls back to YESTERDAY) — `report.service.ts` · doc: [report](report.md)
- [ ] **Quote renewals always assume monofacial modules** — doc: [quote](quote.md)
- [ ] **Site-level notification preferences stored but never consumed** — `site.schema.ts:105-136` · doc: [notification](notification.md)
- [ ] **Phone "8–15 digits" rule is frontend-only** — `auth.input.ts:56-58` · doc: [authentication](authentication.md)

## P4 — Dead code & cleanup (not re-verified)

- [ ] **Delete the dead assets-module metrics trio** (`src/assets/metrics.resolver.ts`/`.service.ts`/`.spec.ts`) — drifting unregistered duplicates · docs: [metrics](metrics.md), [assets](assets.md)
- [ ] **`dto/create-asset.input.ts` superseded** — doc: [assets](assets.md)
- [ ] **`CreateUserModal.tsx` dead stub** — doc: [users](users.md)
- [ ] **`webhook.service.spec.ts` tests re-implemented helpers, not the real service** — doc: [webhooks](webhooks.md)
- [ ] **Stale "Bull/Redis" comments; actual queue is Agenda** — doc: [agenda](agenda.md)
- [ ] **Prompts feature has no frontend consumer** — doc: [prompts](prompts.md)
- [ ] **`JwtModule` default `expiresIn: '5m'` is dead config** — `auth.module.ts:34` · doc: [authentication](authentication.md)
- [ ] **`AlarmConfig.isAcknowledgeable` orphaned** — doc: [alarm-config](alarm-config.md)
- [ ] **OTP flow has no identified caller** — doc: [authentication](authentication.md)

## P5 — Performance & indexes (not re-verified)

- [ ] **`statuslogs` has no indexes** (hot path sorts by `timestamp` desc) — doc: [status-logs](status-logs.md)
- [ ] **`companies` lacks indexes on `apiKey`/`verifiedDomains`/`whitelistedIPs`/`siteTags`** — doc: [companies](companies.md)
- [ ] **`comments` has no index on `event`** — doc: [events](events.md)
- [ ] **User name search: unescaped regex, ignores text index** — doc: [users](users.md)
- [ ] **S3 listing capped at 1,000 keys; per-file `HeadObject` on search** — doc: [storage](storage.md)
- [ ] **`channels.findAll` resolves image URLs sequentially** — `channels.service.ts:657` · doc: [channels](channels.md)
- [ ] **Activity-log plugin: process-global static state race; bulk ops unaudited** — `activity-logs.service.ts:36-38` · doc: [activity-logs](activity-logs.md)

## P6 — Architecture confirmations (outside this repo)

- [ ] **Where is connection status produced?** No backend writer for `connectionStatus`/`lastReportedAt`/`lastConnectedAt`; confirm the ingestion service, thresholds, and PARTIALLY_CONNECTED rollup — docs: [status](status.md), [status-logs](status-logs.md)
- [ ] **Where does alarm threshold evaluation run?** Events arrive pre-flagged — doc: [alarm-config](alarm-config.md)
- [ ] **Do the chart services proxy the report fleet-summary endpoint or compute independently?** — doc: [analytics](analytics.md)
- [ ] **Where do archived capacity-test snapshots persist?** — doc: [tests](tests.md)
- [x] **DocuSeal SIGNED transition** — RESOLVED: not a webhook. The portal's browser posts completion to `POST /api/docuseal/signing/completed` (JWT-guarded, `docuseal.controller.ts:17-33`); a closed tab leaves the quote stuck, with only a one-off repair script (`quote/migrations/fix-stuck-docuseal-signing.migration.ts`). — docs: [quote](quote.md), [e-signature](e-signature.md)
- [ ] **Canonical channel-id taxonomy** (prefix conventions hard-coded in the frontend) — doc: [site-builder](site-builder.md)
- [ ] **`CAPACITY_TEST_PYTHON_SECRET` vs `PYTHON_SERVER_SECRET`** — two secrets, misleading name on the first — doc: [tests](tests.md)
