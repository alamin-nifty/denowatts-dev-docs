---
title: HubSpot CRM (legacy quote path)
owner: alamin-nifty
status: draft
version: 1
updated_at: 2026-08-28
---

# HubSpot CRM (legacy quote path)

An older version of quoting and ordering ran through HubSpot: deals were the quote record, billing details came from HubSpot, and orders and invoices were created there. **That path has been replaced** by the in-platform Quote module ([[quote]]) with QuickBooks for invoicing and DocuSeal for signing ([[e-signature]]).

The old code is still installed and still switched on. It is not used by anything.

> **Why this doc exists.** It is a signpost, not a business reference. Anyone tracing "how does an order get created?" will find two complete implementations and lose a day deciding which is real. This doc says which. It deliberately does **not** document the legacy internals as business rules — nothing runs them, so those rules are not real rules.

---

## Status: legacy, live, unused

| | Finding |
|---|---|
| Registered? | Yes — `HubspotCrmModule` in `denowatts-backend/src/app.module.ts:184` |
| Called by any backend service? | **No.** `HubspotCrmService` has zero consumers outside its own folder |
| Called by the portal? | **No.** No component uses any of its 9 GraphQL operations |
| Reachable from outside? | **Yes** — via public GraphQL and REST (see below) |

`denowatts-backend/src/quote/quote.module.ts:7,22` imports `HubspotCrmModule`, but `denowatts-backend/src/quote/quote.service.ts` never references it — a vestigial import left from the migration.

## Not to be confused with the live HubSpot sync

There are **two different HubSpot services** in this codebase:

| | Purpose | Status |
|---|---|---|
| `denowatts-backend/src/shared/hubspot/hubspot-crm.service.ts` (963 LOC) | legacy quote / order / invoice path | **unused** |
| `denowatts-backend/src/webhooks/hubspot.service.ts` (207 LOC) | live site & company sync, quote email | **in use** — documented in [[webhooks]] |

HubSpot is still a live integration in this product. It just is not the quoting path any more. The webhook service keeps sites and companies in sync (`denowatts-backend/src/webhooks/webhook.service.ts:254`, `:401`) and sends the quote email that links to `/order/<dealId>` (`:581-611`).

That `dealId` is why the portal's order route is `/settings/quote-management/order/$dealId` — legacy naming. The page itself calls the current `quoteOrder` mutation (`denowatts-portal/src/features/quote-management/order/components/OrderForm.tsx:42`), so **the route parameter is a quote id despite its name**.

---

## What it still exposes {dev}

Both the resolver and the controller are annotated **`@Public()` at class level** (`denowatts-backend/src/shared/hubspot/hubspot-crm.resolver.ts:27`, `denowatts-backend/src/shared/hubspot/hubspot-crm.controller.ts:16`), and neither has a method-level `@Private()` override. `JwtAuthGuard` returns `true` immediately for public handlers (`denowatts-backend/src/common/guards/auth.guard.ts:28-30`), so **none of the following requires authentication**:

**GraphQL** — `denowatts-backend/src/shared/hubspot/hubspot-crm.resolver.ts`

| Operation | Effect |
|---|---|
| `searchHubspotContacts(search)` | reads CRM contacts — returns id, first/last name, **email** |
| `searchHubspotCompanies(search)` | reads CRM companies |
| `createHubspotContact(input)` | **creates** a CRM contact |
| `preQuotationFormData` | reads quoting form reference data |
| `getQuotationBillings(input)` | reads billing records |
| `preOrderFormData(input)` | reads deal/order data |
| `createOrder(input)` | **creates an order** in HubSpot (`hubspot-crm.service.ts:584`) |
| `hubspotProducts` | reads the product catalogue with prices |

**REST** — `denowatts-backend/src/shared/hubspot/hubspot-crm.controller.ts`, base path `hubspot-crm`

| Endpoint | Effect |
|---|---|
| `POST /hubspot-crm/file/upload` | **uploads** a file to HubSpot |
| `POST /hubspot-crm/file/delete/:id` | **deletes** a HubSpot file |
| `POST /hubspot-crm/deal/attachments/upload` | **uploads** attachments onto a deal |

> **Flag for human review — security.** This is unauthenticated read access to CRM contact email addresses and product pricing, plus unauthenticated write access that can create contacts and orders and upload or delete files. The `@Public()` annotations were plausibly deliberate when an external HubSpot form posted into these endpoints, but the path is no longer used by the product. Worth confirming whether the module should be removed from `app.module.ts` or the decorators dropped. This doc records the state of the code; the decision is yours.

---

## Data touched {dev}

Nothing in MongoDB. All reads and writes go to the external HubSpot API. `createInvoice` (`denowatts-backend/src/shared/hubspot/hubspot-crm.service.ts:771`) and `createOrder` (`:584`) mutate CRM records only.

Dependencies: `WebhookModule`, `StorageModule`, `EmailModule`, `HttpModule`, `CompaniesModule`, `QuickBooksModule` (`denowatts-backend/src/shared/hubspot/hubspot-crm.module.ts:13-20`). It sends one email — the order confirmation template at `denowatts-backend/src/shared/hubspot/hubspot-crm.service.ts:670`. See [[email]].

---

## If you are here because you were tracing an order {dev}

The live path is: `quoteOrder` mutation → `QuoteService.quoteOrder` (`denowatts-backend/src/quote/quote.service.ts:920`) → QuickBooks invoice → status `ORDERED`. See [[quote]].

The portal still declares a `CREATE_ORDER` mutation for the legacy path in `denowatts-portal/src/features/quote-management/api/quotationMutaions.ts:175`, and several legacy HubSpot queries in `denowatts-portal/src/graphql/queries/quotationQueries.ts` — **none of them is imported by any component.**

**Related flows:** [[quote]] · [[e-signature]] · [[webhooks]] · [[companies]] · [[email]]
