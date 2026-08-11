---
title: Activity Logs (superseded)
owner: alamin-nifty
status: superseded
version: 4
updated_at: 2026-08-11
---

# Activity Logs — superseded

**This document is retired.** The `denowatts-backend/src/activity-logs/` module it described **no longer exists**. Its content has been split across two docs, and the previous version of this file cited files that have all been moved or deleted.

## Where it went

| What you were looking for | Now documented in |
|---|---|
| The automatic developer log of every DB write, sign-in, email, job, integration, API call and server error | **[[system-logs]]** |
| The business-readable feed of named actions (who changed what, before → after), readable by company admins | **[[audit-trail]]** |

## What changed in the code

- **The module was renamed** `activity-logs` → `system-logs`. A one-time, idempotent migration renames the Mongo collection `activitylogs` → `systemlogs` — `denowatts-backend/src/system-logs/migrations/rename-collection.migration.ts:1-12`.
- **A genuinely new feature was added**, `denowatts-backend/src/audit-trail/`, which is *not* a rename of the old module. It records ~53 catalogued business actions explicitly at their call sites, rather than blanket-logging every database write — `denowatts-backend/src/audit-trail/audit-trail.module.ts:15-19`.
- **The two are deliberately kept apart**, each excluding the other's collection from its own logging — `denowatts-backend/src/system-logs/events/system-log.events.ts:14-23`.
- **The outcome model changed.** Actions that used to encode their result in the name (`LOGIN_SUCCESS`, `EMAIL_FAILED`, `JOB_RUN`, …) became an operation plus a separate `SUCCESS`/`FAILED` status; legacy rows are normalized by a migration that runs at every boot — `denowatts-backend/src/system-logs/system-logs.service.ts:232-270`.

> **Do not cite this file.** Link to [[system-logs]] or [[audit-trail]] instead. It is kept only so existing links resolve.

---

**Related flows:** [[system-logs]] · [[audit-trail]]
