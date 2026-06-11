---
title: Quote / Proposal
owner: alamin-nifty
status: draft
version: 2
updated_at: 2026-06-10
---

# Quote / Proposal

A **quote** is a formal price proposal for outfitting a solar installation with Denowatts monitoring — the reference sensors, the on-site gateway hardware, optional extras (cellular connectivity, outdoor enclosure, capacity testing, VPN), and a multi-year monitoring subscription. The Quote module is the sales and procurement workflow around that proposal: building it (singly or in bulk), pricing it from the live product catalogue, walking it through review and e-signature, converting it into an order and invoice, and ultimately activating the site's subscription when hardware ships. It also handles subscription **renewals** for existing sites, including bundling many sites into one signable group quote.

> **Reading this doc:** use the **Business / Developer** switch at the top. *Business* explains the quote lifecycle, how pricing works, renewals and group quotes, and who can do what. *Developer* adds the full GraphQL surface, service internals, schemas and enums, the SKU catalogue, frontend wizard details, file references, and a terminology primer.

---

## Why this matters

The quote is where a prospect becomes a monitored site. The numbers on it drive the invoice, the hardware shipment, and the length of the monitoring subscription — so a mispriced or mis-specified quote follows the site for years. The module automates the error-prone parts: it works out which hardware and service products a site needs from a handful of facts (capacity, mounting, module type, service tier), pulls live prices from the accounting system, and enforces a one-way lifecycle so a signed quote can't quietly be edited backwards.

---

## The quote lifecycle

A quote moves forward through fixed stages and never backwards:

1. **Pending** — created and awaiting admin review (customers see this as "Quote in Review").
2. **Requested for signing** — approved; the owner is emailed and can open the e-signature flow ("Waiting for Signing").
3. **Signed** — the e-signature is complete ("Awaiting Order" until billing details arrive).
4. **Ordered** — billing and shipping details are confirmed; an invoice is raised in the accounting system and a confirmation email goes out.
5. **Shipped** — hardware is on its way. For a brand-new site, this is the moment the monitoring subscription is switched on (start date today, end date after the subscribed years).

A quote can also be **withdrawn** (the one status change a customer can make themselves) or **deleted** (soft-delete, super-admin only — the record is kept but hidden). Quotes effectively expire 90 days after their last update; the expiry date shown in the UI is computed, not stored.

---

## What goes into a quote — pricing

- The platform derives the **product list automatically** from the site's profile: capacity (MW AC), mounting types, module types (monofacial/bifacial), chosen service tier, subscription years, and add-ons (cell plan, outdoor enclosure, capacity testing, VPN, data-acquisition source).
- **Quantities scale with site size** — bigger sites get more sensors and gateways, in defined capacity bands (under 1 MW up to 100 MW+).
- **Prices are live**, fetched from the accounting/product system at quoting time rather than stored in the platform.
- Totals are split into **hardware**, **one-time services**, **recurring services over the full term** (with the implied annual rate shown), plus shipping; all amounts are rounded to whole currency units.
- One built-in promotion exists: the **Expert Optimization Guide is free with a 5-year subscription**.
- Super-admins can add a **custom line item** with their own name, description, and price.
- Quotes can carry attached documents; when a quote becomes an order, the order documents are also filed into the site's Denobox Plans folder. See [[storage]].

---

## Renewals and group quotes

- For existing sites coming up on the end of their subscription, the renewal flow pre-fills a quote from what the site actually has — detecting which sensor types are installed and matching the service tier to the current plan.
- Several sites can be renewed together as a **group quote**: one parent document that is signed once, with one child quote per site underneath. The parent carries the combined totals (and the summed capacity); the products live on the children.
- Renewals always have **$0 shipping** (no new hardware by default), and a catalogue of add-on products (extra gateway, modem, data plan…) can be added manually.
- One known blind spot: renewal pre-fill always assumes monofacial modules — bifacial detection for renewals is not implemented, so operators must adjust by hand where needed.

---

## Who can do what

- **Quoting is open to ordinary users — even those not yet attached to a company.** A quote always has an owner; the owner's company (if any) is recorded on the quote, and a missing company is fine.
- **Non-super-admins** see only quotes they own, created, or that belong to their company — and the only status change they can make is withdrawing a quote.
- **Super-admins** see everything, can create quotes on behalf of any owner, manage all status transitions, add custom line items, export the quote list to Excel, and are the only ones who can delete quotes.
- **Signing** is performed by the customer side (admin/user roles) — a super-admin cannot run the signing step on a customer's behalf.
- Editing is locked for non-super-admins while a quote is in review or awaiting signature.

---

## The rules that matter

- **Status moves forward only** — a signed quote can never go back to pending. (The single sanctioned exception: an order can be reverted from shipped back to ordered for a not-yet-existing site.)
- **Ordering requires a signed quote** — the invoice is only raised once the signature exists.
- **Shipping activates the subscription** for new sites — plan start/end dates are written onto the site, including all sites of a group quote at once.
- **Bulk creation is all-or-nothing** — if any row fails validation, nothing is created.
- **Deleted quotes are hidden, not erased**, and excluded from all lists by default.
- **Group children never appear in the quote list** — they are reached through their group parent.
- Every meaningful step **emails the quote owner** (created, approved for signing, withdrawn, ordered, renewed).

---

## Entry points {dev}
- Quote list — `/settings/quote-management` — `denowatts-portal/src/pages/dashboard/quote-management/QuoteManagementPage.tsx`
- Create single quote — `/settings/quote-management/create` — `denowatts-portal/src/pages/dashboard/quote-management/create-quote/CreateQuotePage.tsx`
- Edit / view quote — `/settings/quote-management/:id` — `denowatts-portal/src/pages/dashboard/quote-management/quote/QuotePage.tsx`
- Quote document view — `/settings/quote-management/:id/quote-view` — `denowatts-portal/src/pages/dashboard/quote-management/quote-view/QuoteViewPage.tsx`
- Bulk create — `/settings/quote-management/bulk-create` — `denowatts-portal/src/pages/dashboard/quote-management/bulk-create/BulkCreatePage.tsx`
- Order (shipping info) — `/settings/quote-management/order/:dealId` — `denowatts-portal/src/pages/dashboard/quote-management/order/OrderPage.tsx`
- Renew — `/settings/quote-management/renew` and `/settings/quote-management/renew/:id` — `denowatts-portal/src/pages/dashboard/quote-management/renew/RenewPage.tsx`

---

## GraphQL API surface {dev}

All operations are in `denowatts-backend/src/quote/quote.resolver.ts`.

### Queries

#### `paginateQuotes(filter: QuotePaginateFilterInput!): QuotePaginateResponse`

Returns a paginated list of quotes (never returns group child quotes — `groupId: { $exists: false }` filter is always applied). Populates `owner` (firstName, lastName, email, phone), `company` (name), and `site` (name). Also returns aggregate stats over the entire matching result set (not just the current page).

**Input (`QuotePaginateFilterInput`):**

| Field | Type | Purpose |
|---|---|---|
| `page` | `Int` (default 1) | Page number |
| `limit` | `Int` (default 10) | Items per page |
| `search` | `String` | Full-text search across siteName, projectOwner, owner name, company name, referenceId |
| `sortByAcNameplate` | `Int` | Sort direction (1 asc / -1 desc) by siteAcNameplate |
| `sortByExpireAt` | `Int` | Sort direction by updatedAt |
| `sortByCreatedAt` | `Int` | Sort direction by createdAt |
| `sortByEstimatedShipDate` | `Int` | Sort direction by estimatedShipDate |
| `company` | `ID` | Filter by company ObjectId |
| `status` | `[QuoteStatus]` | Filter by one or more statuses |
| `groupId` | `ID` | Filter child quotes by group parent |

**Return (`QuotePaginateResponse`):** Standard mongoose-paginate fields (docs, totalDocs, limit, totalPages, page, etc.) plus:
- `sumOfTotalAmount: Float` — sum of `totalAmount` across all matching docs
- `avgOfTotalAmount: Float` — average of `totalAmount` across all matching docs

---

#### `getQuoteById(id: ID!): QuoteResponse`

Fetches a single quote by ID. Populates owner (firstName, lastName, email, phone), company (name, billingInfo), site (name). If the quote is a group (`isGroup: true`), fetches all child quotes and merges their products into `quote.products` (each product's `description` is prefixed with the child site name), and also returns the raw child quotes in `groupQuotes`. Attaches S3 product images to every product in the response.

**Return (`QuoteResponse`):** All `Quote` fields plus:
- `owner: QuoteOwnerResponse` — `{ _id, firstName, lastName, email, phone }`
- `company: QuoteCompanyResponse` — `{ _id, name }`
- `site: QuoteSiteResponse` — `{ _id, name }`
- `groupQuotes: [Quote]` — only populated if `isGroup: true`

---

#### `quoteProducts(quoteProductsInput: QuoteProductsInput!): QuoteProductsResponse`

Derives the list of applicable products (with pre-set quantities and discounts) for a given site configuration. Fetches live pricing from QuickBooks. Used by the "Create Quote" wizard's services step to populate the product table.

**Input (`QuoteProductsInput`):**

| Field | Type | Validation | Purpose |
|---|---|---|---|
| `siteAcNameplate` | `Float` | Required, number | Site capacity in MW AC |
| `siteMountingType` | `[SiteMountingType]` | Required, non-empty array | Drives hardware selection |
| `siteModuleType` | `[SiteModuleType]` | Required, non-empty array | Monofacial vs. Bifacial sensor type |
| `currentServices` | `CurrentServices` | Required enum | Monitoring service tier |
| `initialSubscriptionYears` | `Int` | Required, number | Subscription term length |
| `epcAndCapacityTest` | `Boolean` | Optional | Adds testing package |
| `cellPlan` | `SiteCellPlan` | Optional | Adds cellular modem + data plan |
| `outdoorEnclosure` | `Boolean` | Optional | Adds outdoor enclosure |
| `remoteAccessVpn` | `Boolean` | Optional | Adds VPN service |
| `showHorizontal` | `Boolean` | Optional | Adds horizontal sensor |
| `dataAcquisitionSource` | `DataAcquisitionSource` | Optional | Adds DenoHub or OPC setup |

**Return:** `{ products: [QuoteProduct] }` — products with `quantity` and `discount` already computed.

---

#### `renewalData(renewalDataInput: RenewalDataInput!): RenewalDataResponse`

Fetches pre-populated renewal data for either a list of existing site IDs or a group quote ID. Used to prime the renewal form.

**Input (`RenewalDataInput`):**

| Field | Type | Purpose |
|---|---|---|
| `sites` | `[ID]` | ObjectIds of existing Site documents |
| `quoteId` | `ID` | ObjectId of an existing group quote (mutually exclusive with `sites`) |

**Return (`RenewalDataResponse`):**
- `sites: [RenewalSiteData]` — per-site renewal data including pre-calculated products
- `owner: ID` — quote owner (only when loaded via `quoteId`)
- `nextRenewalDate: Date` — stored renewal date (only when loaded via `quoteId`)

---

#### `renewalAddProducts: RenewalAddProductsResponse`

Returns the catalogue of add-on products available when editing a renewal quote (gateway, hub, cellular modem, etc.). Fetches from QuickBooks using `DenoWattsRenewalAddProductSku` values. No input required.

**Return:** `{ products: [QuoteProduct] }` — quantity is always 0 (user must adjust).

---

### Mutations

#### `createQuote(createQuotationInput: CreateQuotationInput!): Quote`

Creates a single new quote. SUPER_ADMIN can set any `owner`; other users are implicitly the owner.

**Input (`CreateQuotationInput`):** All `Quote` fields except `_id`, `createdAt`, `updatedAt`, `status`, `company`, `billingInfo`, `createdBy`, `deletedAt`, `dsEnvelopeId`, `dsSigningUrl`, `orderDocuments`, `referenceId`, `hardwareSubtotal`, `initialOneTimePeriodSubtotal`, `initialRecurringPeriodSubtotal`, `recurringAnnualService`, `totalAmount`. Key fields:

| Field | Type | Required | Notes |
|---|---|---|---|
| `owner` | `ID` | Conditionally | Required in payload; defaults to current user if omitted |
| `isExistingSite` | `Boolean` | Yes | Flags whether site already exists in system |
| `site` | `ID` | Optional | Reference to existing Site document |
| `siteName` | `String` | Yes | Site display name |
| `siteAcNameplate` | `Float` | Yes | Capacity in MW AC |
| `projectOwner` | `String` | Yes | Name of project owner (free text) |
| `siteAddress/City/State/ZipCode` | `String` | Yes | Location |
| `estimatedShipDate` | `String` | Yes | Target ship date |
| `commercialOperationYear` | `String` | Yes | Year site goes commercial |
| `siteMountingType` | `[SiteMountingType]` | Yes | Array of mounting types |
| `siteModuleType` | `[SiteModuleType]` | Yes | Array of module types |
| `siteNewRetrofit` | `SiteNewRetrofit` | Yes | New or Retrofit |
| `currentServices` | `CurrentServices` | Yes | Service tier |
| `initialSubscriptionYears` | `Int` | Yes | Term length |
| `products` | `[QuoteProductInput]` | Yes | Products with quantities/discounts |
| `shipping` | `Float` | Yes | Shipping cost (default 100 on frontend) |
| `quoteDocuments` | `[String]` | Optional | S3 temp URLs, moved to permanent path on save |
| `epcAndCapacityTest` | `Boolean` | Optional | Adds testing package |
| `cellPlan` | `SiteCellPlan` | Optional | Cellular plan |
| `outdoorEnclosure` | `Boolean` | Optional | Outdoor enclosure |
| `remoteAccessVpn` | `Boolean` | Optional | VPN add-on |
| `opcClientSetup` | `Boolean` | Optional | OPC setup flag |
| `showHorizontal` | `Boolean` | Optional | Horizontal sensor flag |
| `dataAcquisitionSource` | `DataAcquisitionSource` | Optional | Modbus TCP+RTU, TCP Only, or OPC Only |

**Return:** Created `Quote` document.

---

#### `bulkCreateQuotes(bulkCreateQuotationInput: BulkCreateQuotationInput!): BulkCreateQuotationResponse`

Creates multiple quotes in a single operation. Products are auto-calculated per site configuration (no manual product list required).

**Input (`BulkCreateQuotationInput`):**
- `owner: ID` — required; owner for all quotes
- `quotes: [BulkCreateQuotationInputQuote]` — array of `CreateQuotationInput` minus `products`

**Return (`BulkCreateQuotationResponse`):**
- `quotes: [Quote]` — all created quotes
- `totalCreated: Int`

---

#### `updateQuote(updateQuoteInput: UpdateQuoteInput!): Quote`

Updates an existing quote. All fields are optional except `_id`.

**Input (`UpdateQuoteInput`):** `_id: ID` (required) plus partial `Quote` fields (excludes `billingInfo`, `shippingInfo`, `deletedAt`).

**Return:** Updated `Quote` document.

---

#### `quoteOrder(quoteOrderInput: QuoteOrderInput!): Quote`

Converts a signed quote into an order. Creates a QuickBooks invoice and marks the quote as `ORDERED`. Only callable on quotes with status `SIGNED`.

**Input (`QuoteOrderInput`):**
- `_id: ID` — required
- `billingInfo: BillingInfoInput` — billing contact and address
- `shippingInfo: ShippingInfoInput` — shipping contact and address
- `estimatedShipDate: String` — confirmed ship date
- `orderDocuments: [String]` — S3 temp URLs for order documents

**Return:** Updated `Quote` document with status `ORDERED`.

---

#### `deleteQuote(deleteQuoteInput: DeleteQuoteInput!): Quote`

**Role guard: SUPER_ADMIN only** (`@Roles(UserType.SUPER_ADMIN)`).

Soft-deletes a quote by setting `status = DELETED` and `deletedAt = now()`.

**Input:** `{ _id: ID }`

---

#### `processQuoteForSigning(quoteSigningInput: QuoteSigningInput!): QuoteResponse`

**Role guard: ADMIN or USER** (`@Roles(UserType.ADMIN, UserType.USER)`).

Initiates DocuSeal e-signature workflow for a quote in `REQUESTED_FOR_SIGNING` status. Creates (or reuses) a DocuSeal submission for the current user as signer, stores `dsEnvelopeId` and `dsSigningUrl` back on the quote.

**Input:** `{ _id: ID }`

**Return:** Updated `QuoteResponse` with DocuSeal URLs populated.

---

#### `renewQuote(renewQuoteInput: RenewQuoteInput!): RenewQuoteResponse`

Creates a renewal group quote plus one child quote per site. The group parent has `isGroup: true` and `products: []`; actual products are on the children. The group `siteAcNameplate` is the sum of all child nameplate values. Shipping is set to 0 for renewals.

**Input (`RenewQuoteInput`):**
- `owner: ID` — required, must exist
- `renewalData: [RenewalDataItemInput]` — per-site renewal items (see below)
- `nextRenewalDate: Date` — required, stored on group and all children

**`RenewalDataItemInput` fields:**

| Field | Type | Validation | Purpose |
|---|---|---|---|
| `_id` | `ID` | Required, MongoId | Site ObjectId |
| `siteName` | `String` | Required | Site name |
| `siteAcNameplate` | `Float` | Required | Capacity in MW AC |
| `siteMountingType` | `[SiteMountingType]` | Required, non-empty | Mounting types |
| `siteModuleType` | `[SiteModuleType]` | Required, non-empty | Module types |
| `initialSubscriptionYears` | `Int` | Required | Renewal term length |
| `currentServices` | `CurrentServices` | Required, enum | Service tier |
| `products` | `[QuoteProduct]` | Required, non-empty | Products with quantities |

**Return (`RenewQuoteResponse`):**
- `quotes: [Quote]` — the created child quotes (not the group parent)
- `totalCreated: Int`

---

#### `updateRenewQuote(updateRenewQuoteInput: UpdateRenewQuoteInput!): UpdateRenewQuoteResponse`

Updates an existing renewal group quote using upsert logic: for each site in `renewalData`, upserts the child quote matching `{ groupId, site }`. Group totals are recalculated from ALL current children after upsert.

**Input (`UpdateRenewQuoteInput`):**
- `_id: ID` — group quote ObjectId
- `renewalData: [RenewalDataItemInput]` — same structure as `renewQuote`
- `nextRenewalDate: Date` — required

**Return (`UpdateRenewQuoteResponse`):**
- `quotes: [Quote]` — the upserted child quotes for the input sites
- `totalUpdated: Int` — sum of modifiedCount + upsertedCount

---

## Services {dev}

### QuoteService — `denowatts-backend/src/quote/quote.service.ts`

Injected dependencies: `quoteModel`, `companyModel`, `DocuSealService`, `QuickBooksService`, `UsersService`, `SitesService`, `StorageService`, `EmailService`, `ChannelsService`.

---

#### `getQuoteStatusLevel(status: QuoteStatus): number`

Maps each status to a numeric level for forward-only transition enforcement:
- `PENDING` → 1, `REQUESTED_FOR_SIGNING` → 2, `SIGNED` → 3, `ORDERED`/`SHIPPED` → 4, `WITHDRAWN`/`DELETED` → 5.

Prevents updating a quote to a lower-level status (e.g., SIGNED → PENDING is blocked).

---

#### `isQuoteActionable(quote: Quote, currentUser: User): true | throws`

Authorization guard called before any destructive operation. Returns `true` if:
1. `currentUser.type === SUPER_ADMIN`, OR
2. `quote.owner` equals `currentUser._id`, OR
3. `quote.company` equals `currentUser.company`.

Throws `ForbiddenException("You are not authorized to access or do any action on this quote")` otherwise.

---

#### `generateReferenceId(): number`

Generates an 8-digit numeric reference ID by concatenating the last 4 digits of the current Unix timestamp (ms) with a 4-digit OTP. The OTP comes from `generateOTP(4)` in `denowatts-backend/src/common/utils/string`. The timestamp component provides ordering; the OTP component reduces collision probability.

---

#### `calculateProducts(initialSubscriptionYears, inputProducts, shipping): Promise<calculations>`

Core pricing engine. Steps:
1. Filter products where `quantity > 0`.
2. Throw `BadRequestException("No products are selected")` if none remain.
3. Extract SKUs and fetch live pricing from QuickBooks via `quickBooksService.getProductsBySku(skus)`.
4. Build final product list: merge QB data onto each product; if SKU is `CustomService` (100920), override `name`, `description`, and `price` from the input (admin-defined custom line items).
5. Compute subtotals:
   - `hardwareSubtotal` = sum of (price × qty − discount) for `Hardware` type products
   - `initialRecurringPeriodSubtotal` = sum of (price × qty − discount) for `Service_Recurring`
   - `recurringAnnualService` = `initialRecurringPeriodSubtotal / initialSubscriptionYears`
   - `initialOneTimePeriodSubtotal` = sum of (price × qty − discount) for `Service_OneTime`
   - `totalAmount` = hardwareSubtotal + recurringSubtotal + oneTimeSubtotal + shipping
6. Round all monetary values to integers using `Math.round()`.

Returns: `{ products, hardwareSubtotal, initialRecurringPeriodSubtotal, initialOneTimePeriodSubtotal, recurringAnnualService, totalAmount }`.

---

#### `createQuote(input: CreateQuotationInput, currentUser: User): Promise<Quote>`

1. Call `calculateProducts` with `input.initialSubscriptionYears`, `input.products`, `input.shipping`.
2. Validate `input.owner` is set (throws `BadRequestException`); look up user via `usersService.getUserById` (throws `NotFoundException` if missing).
3. Resolve `quoteOwner`: if SUPER_ADMIN, use `input.owner`; otherwise use `currentUser._id`.
4. Generate `referenceId` via `generateReferenceId()`.
5. Create quote document in MongoDB with merged calculation fields, `company: owner.company || null`, `createdBy: currentUser._id`.
6. If `quoteDocuments` URLs provided, move each from temp S3 path to `<quoteId>/` via `storageService.moveFile`, update `quote.quoteDocuments`, and save.
7. Send email notification to owner using `QUOTE_TEMPLATE_ID_NEW` SendGrid template. Subject: "Quote is created for {siteName}". Button URL: `${FRONTEND_URL}/settings/quote-management/${quote._id}/quote-view`.

**Side effects:** 1 MongoDB insert, up to N S3 file moves, 1 SendGrid email (fire-and-forget — not awaited).

---

#### `updateQuote(id, input, currentUser): Promise<Quote>`

1. Fetch existing quote via `getQuoteById(id, currentUser)` (authorization check included).
2. Status transition guards:
   - Non-SUPER_ADMIN can only set `status = WITHDRAWN` (all other status changes rejected with `BadRequestException`).
   - Forward-only: if `input.status` would lower the current status level, throws `BadRequestException`.
3. If `input.products` is provided, recalculate pricing via `calculateProducts`.
4. If `input.quoteDocuments` provided, move S3 files to permanent paths.
5. If `input.owner` changed, re-resolve `company` from new owner.
6. Execute `findByIdAndUpdate` with merged changes.
7. **Status-transition side effects:**
   - PENDING → REQUESTED_FOR_SIGNING: Send "approved for signing" email to owner.
   - PENDING → WITHDRAWN (or any → WITHDRAWN): Send "quote withdrawn" email to owner.
   - Not-existing-site AND any → SHIPPED: Call `sitesService.update` to set `serviceStatus = SHIPPED` and activate subscriptions (`plan.startDate = today`, `plan.endDate = today + initialSubscriptionYears years`, `capacityTest` if `epcAndCapacityTest`).
   - `isGroup` AND any → SHIPPED: Same subscription activation for ALL child quotes' sites.
   - Not-existing-site AND SHIPPED → ORDERED (revert): Call `sitesService.update` to set `serviceStatus = ORDERED` and clear subscriptions. (Note: This handles an edge case where an order is placed before shipment is confirmed.)

---

#### `moveDocuments(quoteId, documents): Promise<string[]>`

For each document URL in the input array, calls `storageService.moveFile(quoteId, document)` to move the file from a temporary upload location to the permanent quote folder in S3. Returns the new permanent URLs.

---

#### `paginateQuotes(filter, currentUser): Promise<QuotePaginateResponse>`

1. Builds MongoDB `FilterQuery`:
   - Always excludes group children: `groupId: { $exists: false }`.
   - Status filter: DELETED is always excluded unless explicitly requested. If no status filter, adds `$ne: DELETED`.
   - Non-SUPER_ADMIN: adds `$or` condition limiting results to quotes where `owner = currentUser._id` OR `createdBy = currentUser._id` OR `company = currentUser.company`.
2. If `filter.search` is provided:
   - Fetches matching user IDs via `usersService.find({ $text: { $search: searchText } })`.
   - Fetches matching company IDs via `companyModel.find({ name: { $regex } })`.
   - Applies `$or` across siteName, projectOwner, owner ids, company ids, and (if numeric) referenceId.
3. Builds sort object from filter sort flags; defaults to `createdAt: -1` if none specified.
4. Executes two parallel operations:
   - `quoteModel.paginate(query, { page, limit, sort, populate: [...] })` — paginated results.
   - `quoteModel.aggregate([{ $match: query }, { $group: { sumOfTotalAmount, avgOfTotalAmount } }])` — aggregate stats over all matches.
5. Returns merged result with `sumOfTotalAmount` and `avgOfTotalAmount`.

---

#### `getQuoteById(id, currentUser?): Promise<QuoteResponse>`

1. `findById(id).populate([owner, company, site])`.
2. Throws `NotFoundException` if not found.
3. If `currentUser` provided, calls `isQuoteActionable`.
4. If `quote.isGroup`: fetches child quotes via `quoteModel.find({ groupId: quote._id })`, merges all products into `quote.products` (prefixing description with site name), attaches raw children in `groupQuotes`.
5. Batch-fetches product images from S3 (`findProductImagesBySkus`), attaches to each product.

---

#### `bulkCreateQuotes(input, currentUser): Promise<BulkCreateQuotationResponse>`

1. Look up owner; throw `NotFoundException` if missing.
2. Fetch ALL QuickBooks products up-front (all `DenoWattsSku` values) in one QB call.
3. For each quote in `input.quotes`:
   a. Compute applicable SKU list via `getAllProductsSku`.
   b. Filter QB products to that SKU list.
   c. Call `quoteProducts` to get products with quantities (reuses the QB data, no extra QB call).
   d. If `isExistingSite`, find site by name match `{ name: { $regex } }` — throws `BadRequestException` if not found.
   e. Filter products to `quantity > 0`.
   f. Call `calculateProducts`.
   g. Generate `referenceId`.
   h. Add `insertOne` operation to batch.
   i. If any step throws, push error message and continue (collect all errors).
4. If ANY errors occurred OR no operations were generated, throw `BadRequestException` with all error messages joined.
5. Execute `quoteModel.bulkWrite(operations)`.
6. Fetch created quotes by inserted IDs.
7. Send bulk-creation email to owner listing all site names (fire-and-forget; errors logged to Sentry).

---

#### `quoteOrder(id, input, currentUser): Promise<Quote>`

1. Fetch quote with populated company, site, owner.
2. Throw `BadRequestException` if quote not found or `status !== SIGNED`.
3. Call `isQuoteActionable`.
4. If `orderDocuments` provided, move S3 files.
5. If `isGroup`: fetch child quotes, flatten products with site-name prefixes into `groupQuotesProducts`.
6. Build QuickBooks invoice payload: company name, site name, billing/shipping info, line items (product name, description, SKU, unitPrice, qty, totalAmount, discount).
7. Call `quickBooksService.createInvoice(payload)` — throws `InternalServerErrorException` if invoice creation fails.
8. Update quote: set `status = ORDERED`, apply billingInfo, shippingInfo, estimatedShipDate, orderDocuments.
9. If group: update all child quotes to `status = ORDERED` via `updateMany`.
10. If `orderDocuments` exist: copy each document to `denobox/{site._id}/Plans/{originalFileName}` in S3 (fire-and-forget).
11. Send order confirmation email via `QUOTE_ORDER_CONFIRMATION_TEMPLATE_ID` template to both the quote owner and the QB customer email (deduplicated). Template includes full billing/shipping info, totalAmount, referenceId, requestedShipDate, site Denobox link.
12. Normalise populated fields back to ObjectId references before returning.

---

#### `deleteQuote(id, currentUser): Promise<Quote>`

1. Fetch and authorize via `getQuoteById`.
2. Set `status = DELETED`, `deletedAt = new Date()` via `findByIdAndUpdate`.

---

#### `processQuoteForSigning(input, currentUser): Promise<Quote>`

1. Fetch and authorize via `getQuoteById`.
2. Throw `BadRequestException` if `status !== REQUESTED_FOR_SIGNING`.
3. Call `docuSealService.createSubmission({ submissionId: quote.dsEnvelopeId, quoteId, referenceId, submitter: { email, name, role: 'signer' } })` to create or resume a DocuSeal submission.
4. Store returned `submissionId` → `dsEnvelopeId` and `signingUrl` → `dsSigningUrl` on the quote; save.
5. Copy any `orderDocuments` to `denobox/{quote.site}/Plans/` (fire-and-forget).
6. Return the quote (status remains `REQUESTED_FOR_SIGNING` at this point — DocuSeal webhook presumably updates it to `SIGNED`).

---

#### `getQuantity(productType, productSku, input): number`

Derives the auto-calculated quantity for a product based on site parameters. Rules:
- `CustomService` (100920) → 0 (admin must set manually)
- `OutdoorEnclosure` (100700) → always 1
- Any SKU containing `"100803"` (Expert Optimization Guide) → 1 (with a potential 100% discount if `initialSubscriptionYears === 5`, applied by `getDiscount`)
- `Service_OneTime` type → 1
- `Service_Recurring` type → `initialSubscriptionYears`
- `DenoSensorPOA` (100210), `DenoSensorPOA_rPOA` (100211), `AntennaTrackerAdder` (100303) → `getDenoCount(siteAcNameplate)`
- `DenoGatewayG3` (100100), `CellularModem` (100600), `DenoHubG3` (100102) → `getGatewayCount(siteAcNameplate)`
- All other SKUs → 0

**`getDenoCount` (Deno sensor quantity by AC nameplate in MW):**
- < 1 MW → 1, < 10 MW → 2, < 25 MW → 4, < 100 MW → 6, ≥ 100 MW → 8

**`getGatewayCount` (Gateway/modem quantity by AC nameplate in MW):**
- < 1 MW → 1, < 10 MW → 1, < 25 MW → 2, < 100 MW → 3, ≥ 100 MW → 4

---

#### `getAcSize(siteAcNameplate): number`

Returns a "bucket" used to look up SKU in `DENOWATTS_INVENTORY_BY_AC`:
- < 1 → 1, < 10 → 10, < 25 → 25, < 100 → 100, ≥ 100 → 1000

---

#### `getDiscount(product, input): number`

Returns a per-product discount amount. Currently only one rule: if SKU contains `"100803"` (Expert Optimization Guide) AND `initialSubscriptionYears === 5`, return `product.price` (i.e., 100% discount — effectively free when bundled with a 5-year subscription). Otherwise returns 0.

---

#### `getAllProductsSku(input, currentUser): DenoWattsSku[]`

Builds the full list of applicable SKUs for a site configuration. Always includes: `DenoGatewayG3`, `DenoSensorHorizontal`. SUPER_ADMIN also gets `CustomService`. Then adds conditionally:
- `siteModuleType` includes Monofacial → `DenoSensorPOA` (100210)
- `siteModuleType` includes Bifacial → `DenoSensorPOA_rPOA` (100211)
- `siteMountingType` includes GroundTracker → `AntennaTrackerAdder` (100303)
- `currentServices === BASIC_WEATHER` → `BasicWeather` (100800)
- `currentServices === BASIC_MONITORING` → `BasicMonitoring_{acSize}`
- `currentServices === ADVANCED_ENERGY_ACCOUNTING` → `AdvancedEnergyAccounting_{acSize}` AND `ExpertOptimizationGuide_{acSize}`
- `currentServices === EXPERT_OPTIMIZATION_GUIDE` → `ExpertOptimizationGuide_{acSize}`
- `currentServices === ESSENTIAL_WEATHER` → `EssentialWeather` (100801)
- `epcAndCapacityTest` → `TestingPackage_{acSize}`
- `cellPlan === Cell_1GB_Month` → `CellularModem` (100600) + `CellularData1GB` (100901-1)
- `cellPlan === Cell_10GB_Month` → `CellularModem` (100600) + `CellularData10GB` (100901-10)
- `outdoorEnclosure` → `OutdoorEnclosure` (100700)
- `remoteAccessVpn` → `RemoteAccessVPN` (100904)
- `dataAcquisitionSource === MODBUS_TCP_AND_RTU` → `DenoHubG3` (100102)
- `dataAcquisitionSource === OPC_ONLY` → `OPC_Client_Setup` (100910)

---

#### `quoteProducts(input, currentUser, quickBooksProducts?): Promise<QuoteProductsResponse>`

1. If `quickBooksProducts` provided (from bulk create), skip QB call.
2. Otherwise: compute SKU list via `getAllProductsSku`, fetch from QB.
3. Batch-fetch product images from S3 (skipped when `quickBooksProducts` provided).
4. Map each QB product to a `QuoteProduct` with `quantity` (via `getQuantity`), `discount` (via `getDiscount`), `image`, `type`, `price`, `order`.
5. Return `{ products }`.

---

#### `renewalData(input, currentUser?): Promise<RenewalDataResponse>`

Two branches:

**Branch A — quoteId provided (group quote renewal edit):**
1. Find group quote; throw if not found or not `isGroup`.
2. Authorize if `currentUser` provided.
3. Fetch all child quotes for this group.
4. Batch-fetch all product images in one S3 call.
5. For each child quote, look up the site to get `subscriptions`, map to `RenewalSiteData`.

**Branch B — sites array provided:**
1. Fetch all Site documents by IDs.
2. Fetch renewal SKU products from QB (all `DenoWattsRenewalSku` values).
3. Strip `-R` suffix from renewal SKUs to find images (original product images).
4. For each site:
   - Query Deno channels to detect sensor types: looks for `DenoChannelOrientation.POA` with and without `AuxPyranometerOrientation.RPOA` aux sensor.
   - Compute `acInMw` from site blocks' `acNameplate` sum.
   - Adds `DenoSensorPOA-R` if POA sensor detected, `DenoSensorPOA_rPOA-R` if rPOA detected.
   - Adds service tier product based on `site.subscriptions.plan.type`: BASIC → `EssentialWeather`; others → `AdvancedEnergyAccounting_{acSize}`.
   - Sets `initialSubscriptionYears`: ESSENTIAL_WEATHER plan → 1 year, all others → 5 years.
   - Sets `siteModuleType` to `[Monofacial]` (always — no bifacial detection for renewals currently).
   - Maps `block.info.mountType` → `SiteMountingType` (Rooftop, GroundFixed, Carport, GroundTracker).

---

#### `renewQuote(input, currentUser): Promise<RenewQuoteResponse>`

1. Look up owner.
2. Fetch all QB renewal SKUs (`DenoWattsRenewalSku` + `DenoWattsRenewalAddProductSku`) in one QB call.
3. Get the first site from renewalData to use as "group site" for address population.
4. Create **group quote** immediately via `quoteModel.create` with: `isGroup: true`, `products: []`, `site: null`, `siteName: "Multiple Sites"` (or single site name), `siteAcNameplate` = sum of all, `shipping: 0`, `siteNewRetrofit: Retrofit`, `estimatedShipDate: today + 30 days`, `expiresAt: today + 90 days`, `nextRenewalDate: input.nextRenewalDate`.
5. For each renewal site:
   a. Look up site document.
   b. Resolve products by matching input products' SKUs against fetched QB products.
   c. Set product `quantity` to `Number(item.quantity).toFixed(3)` (3 decimal precision for fractional quantities).
   d. Run `calculateProducts` for this site.
   e. Build child quote payload with `groupId = groupQuote._id`.
   f. Validate against Mongoose schema.
   g. Add `insertOne` to bulk operations.
   h. On error: push error message (rollback: group quote will be deleted if any error).
6. If any errors: delete group quote, throw `BadRequestException` with all error messages.
7. Execute `bulkWrite(operations)`.
8. Fetch created child quotes.
9. Send renewal email to owner (fire-and-forget, Sentry on error).

---

#### `updateRenewQuote(input, currentUser): Promise<UpdateRenewQuoteResponse>`

1. Fetch existing group quote; throw if not found or not `isGroup`.
2. Authorize.
3. Fetch owner.
4. Fetch all QB renewal SKUs.
5. For each renewal site: build child quote payload and add an `updateOne` with `upsert: true` matching `{ groupId: input._id, site: renewalData._id }`.
6. Execute `bulkWrite`.
7. Recalculate group totals by re-fetching ALL current child quotes (existing + upserted), flattening products, calling `calculateProducts`.
8. Update group quote with new totals, `siteAcNameplate` (sum of all children), `nextRenewalDate`.
9. Fetch upserted/updated child quotes for the input sites.
10. Send update email (fire-and-forget).

---

#### `renewalAddProducts(): Promise<RenewalAddProductsResponse>`

1. Fetch all `DenoWattsRenewalAddProductSku` products from QB.
2. Batch-fetch images from S3.
3. Return all with `quantity: 0`.

---

#### `findProductImagesBySkus(skus): Promise<Map<string, string>>`

Normalizes SKUs by stripping the suffix after `-` (e.g., `100210-R` → `100210`), then calls `storageService.findFilesByNames("quickbooks/products", normalizedSkus)` in a single batch call. Returns a `Map<sku, imageUrl>`.

---

## Schemas {dev}

### Quote — `denowatts-backend/src/quote/schema/quote.schema.ts`

The `Quote` class is both a Mongoose `@Schema` and a GraphQL `@ObjectType`. The schema uses `timestamps: true` (auto-creates `createdAt` and `updatedAt`).

| Field | Type | Required | Default | Purpose |
|---|---|---|---|---|
| `_id` | `ObjectId` | auto | — | MongoDB primary key |
| `groupId` | `ObjectId` (ref: Quote) | No | — | Links child renewal quotes to their group parent |
| `isGroup` | `Boolean` | No | `false` | Marks a quote as a group parent |
| `referenceId` | `Number` | Yes | — | Human-readable 8-digit ID |
| `owner` | `ObjectId` (ref: User) | Yes | — | The customer/requestor who owns this quote |
| `company` | `ObjectId` (ref: Company) | No | — | Company the owner belongs to at quote creation time |
| `isExistingSite` | `Boolean` | Yes | — | Whether the site already exists in the system |
| `site` | `ObjectId` (ref: Site) | No | — | Link to existing Site document |
| `siteName` | `String` | Yes | — | Display name of the site |
| `siteAcNameplate` | `Number` | Yes | — | Site AC capacity in MW |
| `projectOwner` | `String` | Yes | — | Name of the project owner (free-text) |
| `siteAddress` | `String` | Yes | — | Street address |
| `siteCity` | `String` | Yes | — | City |
| `siteState` | `String` | Yes | — | State |
| `siteZipCode` | `String` | Yes | — | ZIP code |
| `estimatedShipDate` | `String` | Yes | — | Target equipment ship date |
| `commercialOperationYear` | `String` | Yes | — | Year of commercial operation |
| `siteMountingType` | `[SiteMountingType]` | Yes | — | Array: Rooftop, Ground(Fixed), Ground(Tracker), Carport |
| `siteModuleType` | `[SiteModuleType]` | Yes | — | Array: Monofacial, Bifacial |
| `siteNewRetrofit` | `SiteNewRetrofit` | Yes | — | New or Retrofit |
| `quoteDocuments` | `[String]` | No | — | S3 URLs for quote documents |
| `orderDocuments` | `[String]` | No | — | S3 URLs for order/purchase documents |
| `currentServices` | `CurrentServices` | Yes | — | Service tier enum |
| `initialSubscriptionYears` | `Number` | Yes | — | Subscription term in years |
| `epcAndCapacityTest` | `Boolean` | No | `false` | Whether EPC/capacity testing is included |
| `cellPlan` | `SiteCellPlan` | No | — | Cell data plan: Cell_1GB_Month or Cell_10GB_Month |
| `outdoorEnclosure` | `Boolean` | No | — | Whether outdoor enclosure is included |
| `products` | `[QuoteProduct]` | Yes | — | Embedded array of product line items |
| `hardwareSubtotal` | `Number` | No | — | Computed hardware total |
| `initialRecurringPeriodSubtotal` | `Number` | No | — | Recurring service total for full initial term |
| `initialOneTimePeriodSubtotal` | `Number` | No | — | One-time service total |
| `recurringAnnualService` | `Number` | No | — | Annual recurring rate (recurringSubtotal / years) |
| `shipping` | `Number` | Yes | — | Shipping cost (typically $100) |
| `estimatedTax` | `Number` | No | — | Estimated tax (optional, not computed by service) |
| `totalAmount` | `Number` | No | — | Grand total (all subtotals + shipping) |
| `createdBy` | `ObjectId` (ref: User) | No | — | Admin who created the quote (may differ from owner) |
| `status` | `QuoteStatus` | No | `PENDING` | Lifecycle status |
| `createdAt` | `Date` | auto | — | Timestamp (mongoose timestamps) |
| `updatedAt` | `Date` | auto | — | Last modification (expiry date = updatedAt + 90 days, computed on frontend) |
| `dsEnvelopeId` | `String` | No | — | DocuSeal submission ID |
| `dsSigningUrl` | `String` | No | — | DocuSeal signing URL for signer |
| `dsSignImage` | `String` | No | — | DocuSeal signature image URL |
| `signedAt` | `Date` | No | — | When the DocuSeal signing completed |
| `billingInfo` | `BillingInfo` | No | — | Billing contact embedded sub-document |
| `shippingInfo` | `ShippingInfo` | No | — | Shipping contact embedded sub-document |
| `remoteAccessVpn` | `Boolean` | No | `false` | Whether Remote Access VPN is included |
| `opcClientSetup` | `Boolean` | No | `false` | Whether OPC Client Setup is included |
| `showHorizontal` | `Boolean` | No | `false` | Whether horizontal sensor variant is shown |
| `dataAcquisitionSource` | `DataAcquisitionSource` | No | — | MODBUS_TCP_AND_RTU, MODBUS_TCP_ONLY, or OPC_ONLY |
| `deletedAt` | `Date` | No | — | Soft-delete timestamp |
| `nextRenewalDate` | `Date` | No | — | Scheduled next renewal date (set on renewal quotes) |

### QuoteProduct (embedded sub-document / input type)

| Field | Type | Required | Purpose |
|---|---|---|---|
| `id` | `String` | Yes | QuickBooks item ID |
| `name` | `String` | Yes | Product name |
| `description` | `String` | Yes | Product description |
| `type` | `QuoteProductType` | No | Hardware, Service_Recurring, Service_OneTime |
| `price` | `Float` | Yes | Unit price |
| `quantity` | `Float` | Yes (default 0) | Quantity ordered |
| `sku` | `String` | No | QuickBooks SKU |
| `image` | `String` | No | S3 image URL (fetched at query time, not stored long-term) |
| `order` | `Int` | No | Display sort order |
| `term` | `String` | No | Subscription term description |
| `billingFrequency` | `String` | No | Billing frequency description |
| `discount` | `SafeFloat` | No | Per-line discount amount |

### BillingInfo / ShippingInfo (embedded sub-documents)

Both have identical fields, all optional strings: `contactFirstName`, `contactLastName`, `contactEmail`, `contactPhone`, `address`, `city`, `state`, `zipCode`.

---

## Enums {dev}

### `QuoteStatus`
`PENDING` | `REQUESTED_FOR_SIGNING` | `SIGNED` | `ORDERED` | `SHIPPED` | `WITHDRAWN` | `DELETED`

### `SiteMountingType`
`Rooftop` | `Ground (Fixed)` | `Ground (Tracker)` | `Carport`

### `SiteModuleType`
`Monofacial` | `Bifacial`

### `SiteNewRetrofit`
`New` | `Retrofit`

### `SiteCellPlan`
`Cell_1GB_Month` | `Cell_10GB_Month`

### `CurrentServices`
`BASIC_WEATHER` | `ESSENTIAL_WEATHER` | `BASIC_MONITORING` | `ADVANCED_ENERGY_ACCOUNTING` | `EXPERT_OPTIMIZATION_GUIDE`

### `QuoteProductType`
`Hardware` | `Service_Recurring` | `Service_OneTime`

### `DataAcquisitionSource`
`MODBUS_TCP_AND_RTU` | `MODBUS_TCP_ONLY` | `OPC_ONLY`

---

## SKU Reference {dev}

Defined in `denowatts-backend/src/quote/constants/index.ts`.

### `DenoWattsSku` (new quotes)
| SKU | Code | Category |
|---|---|---|
| DenoGatewayG3 | 100100 | Hardware |
| DenoHubG3 | 100102 | Hardware |
| AntennaTrackerAdder | 100303 | Hardware |
| DenoSensorPOA | 100210 | Hardware |
| DenoSensorPOA_rPOA | 100211 | Hardware |
| DenoSensorPOA_Horizontal | 100212 | Hardware |
| DenoSensorHorizontal | 100213 | Hardware |
| CellularModem | 100600 | Hardware |
| OutdoorEnclosure | 100700 | Hardware |
| CellularData1GB | 100901-1 | Service_Recurring |
| CellularData10GB | 100901-10 | Service_Recurring |
| BasicMonitoring_{1,10,25,100,1000} | 100801-{n} | Service_Recurring |
| AdvancedEnergyAccounting_{1,10,25,100,1000} | 100802-{n} | Service_Recurring |
| ExpertOptimizationGuide_{1,10,25,100,1000} | 100803-{n} | Service_Recurring |
| RemoteAccessVPN | 100904 | Service_Recurring |
| BasicWeather | 100800 | Service_Recurring |
| EssentialWeather | 100801 | Service_Recurring |
| TestingPackage_{1,10,25,100,1000} | 100820-{n} | Service_OneTime |
| OPC_Client_Setup | 100910 | Service_OneTime |
| CustomService | 100920 | Service_OneTime |

### `DenoWattsRenewalSku` (renewal hardware/service)
| SKU | Code |
|---|---|
| DenoSensorPOA | 100210-R |
| DenoSensorPOA_rPOA | 100211-R |
| EssentialWeather | 100801 |
| AdvancedEnergyAccounting_{1,10,25,100,1000} | 100802-{n} |

### `DenoWattsRenewalAddProductSku` (renewal add-ons)
| SKU | Code |
|---|---|
| DenoGatewayG3 | 100100 |
| DenoHubG3 | 100102 |
| DenoSensorHorizontal | 100213 |
| DenoSensorPOA_Horizontal | 100212-R |
| CellularModem | 100600 |
| CellularData1GB | 100901-1 |
| CellularData10GB | 100901-10 |
| RemoteAccessVPN | 100904 |

---

## Business rules (cited) {dev}

- **Status is forward-only.** Updating a quote to a lower-level status is blocked for all users. Non-SUPER_ADMIN users can only change status to `WITHDRAWN`. — `denowatts-backend/src/quote/quote.service.ts:296–309`
- **Expiry is computed, not stored.** The expiration date shown in the UI is `updatedAt + 90 days`. The field is not stored in MongoDB. — `denowatts-portal/src/pages/dashboard/quote-management/QuoteManagementPage.tsx:430`
- **Quotes are never hard-deleted.** `deleteQuote` sets `status = DELETED` and `deletedAt`. DELETED quotes are filtered out of all paginate queries by default. — `quote.service.ts:1061–1072`
- **deleteQuote is SUPER_ADMIN only.** — `quote.resolver.ts:75–79`
- **processQuoteForSigning is ADMIN or USER only.** SUPER_ADMIN cannot sign their own quotes via this endpoint. — `quote.resolver.ts:81–88`
- **paginateQuotes never returns group children.** The `groupId: { $exists: false }` filter is hardcoded. Children are accessible only via `getQuoteById` on the group parent. — `quote.service.ts:524–526`
- **Expert Optimization Guide is free with 5-year subscription.** SKU `100803-*` gets a 100% discount when `initialSubscriptionYears === 5`. — `quote.service.ts:1204–1208`
- **CustomService is SUPER_ADMIN only.** The `DenoWattsSku.CustomService` SKU is only added to the product list when `currentUser.type === SUPER_ADMIN`. — `quote.service.ts:1253–1255`
- **Subscription activation happens on SHIPPED status.** When status transitions to SHIPPED for a new (not existing) site, the linked Site document gets `serviceStatus = SHIPPED`, a subscription plan with start/end dates is written, and optionally a capacity test subscription. — `quote.service.ts:403–484`
- **Renewal quotes have $0 shipping.** All renewal quote creation hardcodes `shipping: 0`. — `quote.service.ts:1560, 1669`
- **Group quote products are always empty.** The group parent stores aggregate financial totals but `products: []`. Product details live on child quotes only. — `quote.service.ts:1572`
- **Renewal quoting requires AC in MW.** The `renewalData` branch B derives `acInMw` from site blocks in kW (`acNameplate`) divided by 1000. — `quote.service.ts:1454–1455`
- **Bulk create is all-or-nothing.** If any quote in a bulk create fails validation, the entire operation is aborted (no partial inserts). — `quote.service.ts:800–803`
- **Authorization: owner OR company member.** A non-SUPER_ADMIN user can act on a quote if they are the owner OR if the quote belongs to their company. — `quote.service.ts:122–140`

---

## Data touched {dev}

- `quotes` collection — primary table for all quote documents. Created on `createQuote` / `bulkCreateQuotes` / `renewQuote`. Updated on `updateQuote` / `quoteOrder` / `deleteQuote` / `processQuoteForSigning` / `updateRenewQuote`. Read on all queries.
- `users` collection — read to resolve owner details on quote creation/update; read to populate `owner` field in paginate and getById responses.
- `companies` collection — read in `paginateQuotes` search (company name regex search); written indirectly when `owner.company` is denormalized onto the quote at creation time.
- `sites` collection — read to validate existing sites in bulk create; **written** when a quote transitions to `SHIPPED` (updates `serviceStatus` and `subscriptions`). Also read in `renewalData` to build renewal product recommendations.
- `channels` collection — read in `renewalData` (Branch B) to detect Deno sensor orientation for renewal product selection.
- S3 (via `StorageService`) — files moved from temp paths on quote/order document upload; product images read from `quickbooks/products/` prefix; order documents copied to `denobox/{site._id}/Plans/`.
- QuickBooks (via `QuickBooksService`) — product catalog read on every `quoteProducts`, `calculateProducts`, and `bulkCreateQuotes` call; invoice created on `quoteOrder`.
- DocuSeal (via `DocuSealService`) — submission created/resumed on `processQuoteForSigning`.
- SendGrid (via `EmailService`) — emails sent on: quote created, status → REQUESTED_FOR_SIGNING, status → WITHDRAWN, bulk quotes created, order placed, renewal created, renewal updated.

---

## Create Quote wizard (frontend) {dev}

The create/edit quote form is a 5-step wizard in `denowatts-portal/src/pages/dashboard/quote-management/create-quote/components/QuoteForm.tsx`:

1. **Step 1 — Project** (`QuoteStepProject`) — owner selection, isExistingSite toggle, site selector or new site name
2. **Step 2 — Location** (`QuoteStepLocation`) — address fields, project owner, commercial operation year
3. **Step 3 — Details** (`QuoteStepDetails`) — mounting type, module type, new/retrofit, ship date, data acquisition source
4. **Step 4 — Services** (`QuoteStepServices`) — service tier, subscription years, options (cell plan, EPC test, outdoor enclosure, VPN, OPC). Triggers `quoteProducts` query to show live product list with prices and auto-calculated quantities.
5. **Step 5 — Review** (`QuoteStepReview`) — product table with editable quantities/discounts. Final submit calls `createQuote` or `updateQuote`.

Default values: `isExistingSite: false`, `siteNewRetrofit: New`, `currentServices: ADVANCED_ENERGY_ACCOUNTING`, `initialSubscriptionYears: 5`, `shipping: 100`, `dataAcquisitionSource: MODBUS_TCP_AND_RTU`.

---

## Quote list page (frontend) {dev}

Route: `/settings/quote-management` — `QuoteManagementPage.tsx`.

- Default status filter: `[REQUESTED_FOR_SIGNING, PENDING, SIGNED, ORDERED, SHIPPED]` (excludes WITHDRAWN and DELETED).
- Page size: 50 (configurable).
- Sortable columns: siteAcNameplate, estimatedShipDate, createdAt, updatedAt (expiry proxy).
- Status labels shown to non-SUPER_ADMIN users are user-facing aliases: PENDING → "Quote in Review", REQUESTED_FOR_SIGNING → "Waiting for Signing", SIGNED (without billingInfo) → "Awaiting Order".
- Edit button disabled for non-SUPER_ADMIN when status is PENDING or REQUESTED_FOR_SIGNING.
- Delete button visible to SUPER_ADMIN only.
- Export to XLSX (SUPER_ADMIN only) exports currently visible quotes.
- Summary cards show: total count, sum of total amount, average total amount — all from the backend aggregate query.

---

## Edge cases & gotchas {dev}

- **`expiresAt` was removed from the schema.** The frontend calculates expiry as `updatedAt + 90 days`. There is no `expiresAt` field stored in MongoDB despite the `sortByExpireAt` sort option which actually sorts by `updatedAt`. — `quote.service.ts:588–590`
- **Group quote financial totals vs. child products.** When displaying a group quote, `getQuoteById` merges all child products into the parent's `products` array purely for display. The stored `products: []` on the parent is empty. Financial totals on the parent ARE populated (sum of all children). — `quote.service.ts:693–711`
- **Bulk create fails entirely on any error.** A single invalid site name or QB product miss aborts the whole batch. The UI should show per-row validation before submitting. — `quote.service.ts:800–803`
- **Renewal `siteModuleType` is always Monofacial.** The renewal product recommendation engine does not detect bifacial panels from channels; it hardcodes `[Monofacial]`. Operators must manually adjust if bifacial sensors are present. — `quote.service.ts:1516`
- **DocuSeal webhook for SIGNED status.** `processQuoteForSigning` leaves the quote in `REQUESTED_FOR_SIGNING`. The transition to `SIGNED` and the writing of `dsSignImage` / `signedAt` presumably happens via a DocuSeal webhook (not visible in this module). This is a gap in documented flow — flag for human review.
- **S3 image lookup strips suffix after `-`.** Product images are stored without the AC-size suffix (e.g., image for `100802-25` is looked up as `100802`). The `normalizeSku` function does this stripping. — `quote.service.ts:1229–1231`
- **Order-document copy is fire-and-forget.** Both `quoteOrder` and `processQuoteForSigning` copy order documents to the site's Denobox Plans folder asynchronously without awaiting, so errors are silent (no Sentry capture for document copy failures). — `quote.service.ts:970–983`, `1104–1109`
- **Renewal group parent site is null.** Group quotes have `site: null`. Only the child quotes have `site` populated. Code must handle this when reading the group. — `quote.service.ts:1578`
- **SHIPPED → ORDERED status revert.** The service has logic to revert a site's `serviceStatus` from SHIPPED back to ORDERED if the quote transitions from SHIPPED back to ORDERED. This is an unusual backward transition that is allowed only for non-existing-site quotes. — `quote.service.ts:486–508`
- **QB product images are not stored on the Quote.** The `image` field in stored `QuoteProduct` sub-documents is not populated. Images are fetched from S3 on every `getQuoteById` and `paginateQuotes` call. This means product images cannot be served if S3 is unavailable.
- **`QuoteStatus.DELETED` is excluded by default but can be included.** If `filter.status` contains only `DELETED`, the logic produces `$ne: DELETED, $exists: false` which will never match anything — this appears to be a bug. — `quote.service.ts:529–536`

---

## Solar & platform terminology {dev}

- **Quote** — a priced proposal for hardware + monitoring services for one site; the document this module manages, moving through `QuoteStatus` stages.
- **Group quote** — a parent quote (`isGroup: true`) bundling multiple sites' renewal quotes into one signable document; products live on the child quotes (`groupId` → parent).
- **Reference ID** — the human-readable 8-digit number identifying a quote (timestamp tail + 4-digit OTP).
- **SKU** — the QuickBooks stock-keeping unit identifying each product (e.g. `100210` DenoSensorPOA); renewal variants carry an `-R` suffix.
- **AC nameplate** — the site's rated AC capacity in MW; drives sensor/gateway quantities and which capacity-banded service SKU applies (`acSize` buckets 1/10/25/100/1000).
- **Deno sensor (POA / rPOA)** — the Denowatts irradiance reference sensor; plane-of-array, with an optional rear-facing (rPOA) variant for bifacial modules.
- **Gateway / DenoHub** — the on-site data-acquisition hardware; quantity scales with site size, and DenoHub is added for Modbus TCP+RTU acquisition.
- **Service tier (`CurrentServices`)** — the monitoring subscription level: Basic/Essential Weather, Basic Monitoring, Advanced Energy Accounting, Expert Optimization Guide.
- **DocuSeal** — the e-signature provider; a quote's submission ID and signing URL are stored as `dsEnvelopeId` / `dsSigningUrl`.
- **QuickBooks** — the accounting system that is the source of truth for product names/prices and where the order invoice is created.
- **Subscription activation** — on transition to SHIPPED for a new site, the linked Site gets `serviceStatus = SHIPPED` and a plan with start/end dates spanning the subscribed years.
- **Soft delete** — `status = DELETED` + `deletedAt` timestamp; the document remains in MongoDB but is excluded from listings.

For the full domain vocabulary, see [[solar-glossary]].

---

**Related flows:** [[settings]] · [[site]] · [[channels]] · [[storage]] · [[companies]] · [[authentication]] · [[solar-glossary]]
