---
title: Quote / Proposal
owner: alamin-nifty
status: draft
version: 4
updated_at: 2026-09-30
---

# Quote / Proposal

**What it does (business):** A quote is a priced offer for Denowatts monitoring. It lists the sensors, the gateway hardware, any extras, and the monitoring subscription. It gets signed, turned into an order, and shipped. Shipping it switches on the site's subscription.

**Entry point(s):** Settings → **Quotation** in the left menu (`/settings/quote-management`). The **Renew** button on Service Management also opens the renewal flow.

> **Reading this doc:** use the **Business / Developer** switch at the top. *Business* explains the kinds of quote, the steps a quote goes through, how the price is worked out, and who can do what. *Developer* adds the GraphQL operations, service internals, schema, SKU list, and file references.

> **What changed in September 2026.** The quote screens were rebuilt. There are now **three kinds of quote** (New site, Renewal, Add-on). The old 5-step wizard is gone: a new-site quote is **one page**. Shipping is a **fixed $100** on every quote. **Discounts can no longer be typed in.** The setup fee is waived automatically on a 5-year term. If you learned the old screens, read "Where to find it" and "How the price is worked out" again.

---

## Why this matters

The quote is where a prospect becomes a monitored site. The numbers on it become the invoice. The hardware on it is what ships. The term on it decides when the subscription ends. A wrong quote follows the site for years.

The portal does the error-prone parts for you. It picks the products from a few answers about the site. It takes live prices from QuickBooks. When the customer signs, it creates their company and site if they are new.

---

## Where to find it

Open **Settings → Quotation**. The list shows every quote you are allowed to see. Click **Create Quote** to start a new one. You then pick one of four starting points:

| Card on screen | Group | Use it when | Makes a quote of type |
|---|---|---|---|
| **New Site** | New sites | One project that is not in the portal yet | New site |
| **Multiple Sites** | New sites | Several new projects at once, from a spreadsheet or typed into a grid. Each row becomes its own quote. | New site (one per row) |
| **Add Products** | Existing sites | A customer wants more hardware or services for sites they already have. **This does not extend their subscription.** | Add-on |
| **Renew Sites** | Existing sites | A site's plan has ended, or ends within 90 days | Renewal |

The **Add Products** and **Renew Sites** cards each make **one quote that covers every site you pick**. The customer signs once for all of them.

---

## The three kinds of quote

| | New site | Renewal | Add-on |
|---|---|---|---|
| For | A project not in the portal yet | Existing sites whose plan is ending | Existing sites that need more |
| Sites per quote | One | One or more | One or more |
| Products come from | Your answers about the site | What the site already has installed, plus anything you add | Only what you add |
| Customer signs | Once | Once for all sites | Once for all sites |
| Shipping | $100 | $100 for the whole quote | $100 for the whole quote |
| Creates the company and site when signed | Yes, if they do not exist yet | No, the sites already exist | No |
| When marked **Shipped** | Starts the subscription and sets up the site | Starts a new subscription period on every site | **Changes nothing on the sites** |
| Sets a renewal date | No | Yes: **Renew Date** in the header | No |

---

## The steps a quote goes through

A quote moves through these steps. Super admins and customers see different names for the same step.

| Step | Super admin sees | Customer sees | What moves it on | What happens |
|---|---|---|---|---|
| 1 | Pending | **Quote in Review** | A super admin clicks **Request for Signing** | The owner gets a "Quote approved for signing" email. |
| 2 | Requested for Signing / Signature Pending | **Waiting for Signing** | The customer clicks **Accept and Sign** and signs | See [[e-signature]]. |
| 3 | Signed | **Awaiting Order** (Complete Shipping) | The customer fills in the **Shipping** tab and clicks **Confirm Order** | On signing: the company and site are created if new, the signed PDF is filed in the site's Denobox, and signer and owner get an email. |
| 4 | Ordered | Ordered | A super admin clicks **Confirm Shipment** | A QuickBooks invoice is created, and the owner and the invoice contact get an order confirmation email. |
| 5 | Shipped | Shipped | — | The subscription starts (see "What shipping switches on"). |

Two other endings:

- **Withdrawn.** Anyone who can see the quote can click **Withdraw** while it is Pending or Waiting for Signing. The owner gets an email. **This is the only step a customer can take on their own.**
- **Deleted.** Only a super admin can delete, from the list. The quote is hidden, not erased.

A super admin can also click **Cancel Shipment** to move a quote from Shipped back to Ordered. For a new-site quote, this also turns the site's subscription back off.

**The steps do not have to be taken in order.** The server only refuses to move a quote *backwards*. A super admin could, in principle, move a quote straight from Pending to Shipped, skipping the signature. The screens do not offer that button, but the server allows it.

---

## How the price is worked out

**For a new-site quote, you do not pick products. You answer questions, and the portal picks them.** The **Order Summary** panel on the right re-prices as you answer.

The questions are: AC capacity (in MW), mounting type, module type, service level, contract length, data acquisition source, cellular, VPN, capacity test, and outdoor enclosure.

**Prices always come from QuickBooks.** They are not stored in the portal, so a price change in QuickBooks shows up on the next quote. A quote that is already saved keeps the prices it was saved with.

The total has four parts:

- **Hardware:** sensors, gateway, modem, enclosure.
- **Recurring services:** the monitoring subscription and data plan, for the whole term. The panel also shows the **Annual service** cost (per year).
- **One-time services:** setup fee, capacity test, OPC setup.
- **Shipping:** always **$100**. It cannot be changed.

All amounts are rounded to whole dollars.

### Which products your answers add

| If you answer | The quote gets |
|---|---|
| Anything (every quote) | A Deno gateway and a horizontal sensor |
| Module type includes **Monofacial** | POA Deno sensors |
| Module type includes **Bifacial** | POA + rear-POA Deno sensors |
| Mounting includes **Ground (Tracker)** | A tracker antenna adder for each sensor |
| Service level **Essential Weather** | Essential Weather subscription |
| Service level **Energy Accounting** | Energy Accounting subscription **and** the setup fee |
| Capacity test ticked | Testing package |
| Cellular = Yes | A cell modem and a data plan (1 GB or 10 GB a month) |
| VPN = Yes | Remote-access VPN |
| Outdoor enclosure ticked | One outdoor enclosure |
| Data acquisition **Modbus TCP and RTU** | A DenoHub for each gateway |
| Data acquisition **OPC Only** | OPC client setup |
| Data acquisition **Modbus TCP Only** | Nothing extra |

### How many sensors and gateways

The count depends on the site's AC capacity:

| AC capacity | Deno sensors | Gateways (and modems, DenoHubs) |
|---|---|---|
| Under 1 MW | 1 | 1 |
| 1 to under 10 MW | 2 | 1 |
| 10 to under 25 MW | 4 | 2 |
| 25 to under 100 MW | 6 | 3 |
| 100 MW and up | 8 | 4 |

The subscription, setup fee and testing package are also priced by these same size bands.

### How service level and contract length work together

| Service level | Contract length | Setup fee | Capacity test allowed? |
|---|---|---|---|
| Essential Weather | **Always 5 years** (the box is locked) | Not on the quote | No |
| Energy Accounting | 5 years | **Waived** (shown as "setup fee waived") | Yes |
| Energy Accounting | 1 year | **Charged in full** | Yes |

**The setup fee is free only on a 5-year term.** On the quote it appears as "Site Configuration and Data Validation" with a yellow note: "discount — setup fee waived because a 5-year or longer term was selected". Switching back to 1 year puts the full fee back.

**Discounts cannot be typed in any more.** The only discount a user will normally see is the setup-fee waiver. If a line ever has a discount larger than its own price, the panel shows "discount is more than the line total" and will not let you submit.

### Custom line item

Super admins get a **Custom Service** line on new-site quotes. Anyone can edit its name and description, but **only a super admin can set its price**. It is only added to the quote if the price is above $0.

---

## Renewals

**A renewal extends the subscription on sites that already exist.** The **Renew Sites** screen lists every site whose plan has **already ended, or ends within the next 90 days**. You can filter it to **Expired** or **Expiring soon**.

1. Pick the sites. Click **Build renewal quote**.
2. Pick the **Renew Date** in the header. The choices are June 30 or December 31, starting at least one year out.
3. Each site starts with its renewal products already filled in, based on what is installed:
   - POA sensors if the site has POA Denos, and rear-POA sensors if it has rear-POA Denos.
   - The site's current service (Essential Weather or Energy Accounting), sized to the site's capacity.
4. The number of years charged is **the time from the plan's current end date to the Renew Date**. For example, a plan ending 31 Dec 2026 renewed to 31 Dec 2027 is charged 1 year.
5. Expand a site to add or remove products. Click **Create renewal quote**.

When the renewal is marked **Shipped**, every site on it gets a new plan. **The plan starts on the day it is marked shipped, and ends on the Renew Date.** A site that is not yet active is also moved to "Shipped".

## Add-on quotes

**An add-on sells more hardware or services to existing sites, without touching their subscription.** On **Add Products**, pick the sites, then expand each one to add products. Each site starts empty. Every site must have at least one product.

**Marking an add-on quote as Shipped does not change the sites.** No plan is started or extended. If the customer also needs more time on their plan, use a renewal.

## Build from answers

On both **Add Products** and **Renew Sites**, each site has a **Build from answers** button. It asks the same questions as a new-site quote (service level, contract length, modules, mounting, and so on), then adds the matching products to that site. It **adds** to what is already there. It does not replace it.

Only questions that would add a product are shown. For example, "Rooftop" and "Modbus TCP Only" never appear, because they add nothing.

---

## Who can do what

| | Customer (Admin or User) | Super admin |
|---|---|---|
| See quotes | Their own, ones they created, and their company's | All |
| Create a quote | Yes, for themselves. **They do not need a company yet.** | Yes, for any customer (pick them under **Customer Name** or **Owner**) |
| Edit a new-site quote | No. The Edit button is greyed out while Pending or Waiting for Signing. After that, only the Shipping tab opens. | While Pending or Requested for Signing |
| Edit a renewal or add-on quote | **Yes, at any step after review** (see gotchas) | Yes, at any step |
| Request for Signing | No | Yes |
| Accept and Sign | Yes | **No.** A super admin cannot sign on the customer's behalf. |
| Withdraw | Yes, while Pending or Waiting for Signing | Yes |
| Fill in billing and shipping (Confirm Order) | Yes | Yes |
| Confirm Shipment / Cancel Shipment | No | Yes |
| Delete | No | Yes |
| Export to Excel | No | Yes |

Admins and Users are treated exactly the same on every quote screen.

---

## The quote list

- **Summary cards:** total quote count, total amount, and average amount. They follow the filters you have set.
- **Filters:** Status, Quote type, and the company chosen in the page header.
- **By default the list hides Shipped and Withdrawn quotes.** Tick them in the Status filter to see them. Deleted quotes are never shown.
- **Search** covers project name, project owner, requestor name, company name, and reference number.
- **Expiration date** is 90 days after the quote was **last changed**. Any change, including a step change, pushes it out again. Nothing stops an "expired" quote from being signed.
- **Export** (super admins) saves only **the rows on the current page** to Excel. It leaves out Quote type, Company and Project Owner.

---

## What shipping switches on

| Kind of quote | What happens to the site when marked **Shipped** |
|---|---|
| New site | Site status becomes **Shipped**. Plan starts today. Plan ends today + the contract years. Service is Basic for Essential Weather, Advanced otherwise. The **Commercial operation year** becomes the site's commercial operation date (1 January of that year). A capacity-test subscription runs for 1 year if the test was bought. |
| Renewal | Each site's plan starts today and ends on the Renew Date. Sites not already active become **Shipped**. |
| Add-on | Nothing. |

---

## What produces nothing

These look right on screen but do not save, send, or change anything:

- **Marking an add-on quote Shipped.** No subscription starts or extends on any site.
- **Remote Access VPN and Outdoor Enclosure on Multiple Sites.** The grid shows them, and the Order Summary prices them. **But they are not sent when the quotes are created, so the saved quotes do not include them.** Add them to each quote afterwards.
- **Typing a shipping amount.** Shipping is always $100, whatever is sent.
- **Removing a site from a renewal or add-on while editing.** The site's part of the quote is **not** removed and still counts in the total.
- **Contract length inside Build from answers.** It only decides which products get added. The quote's own term comes from the site.
- **Picking "Modbus TCP Only".** Adds no product.
- **A product that is inactive in QuickBooks, or has no SKU there.** It is silently left off the quote and the price.
- **The Company filter when renewing.** Only the company part of the header filter applies to the renewal list. Site manager and tag filters are ignored.
- **The phone and ZIP "valid" checks on the Shipping tab.** They never reject anything.
- **Closing the signing window too early.** The quote only becomes Signed if the customer's browser tells the server the signature is done. Close the tab first, and the quote stays "Waiting for Signing". Nothing fixes it automatically. See [[e-signature]].
- **The Quote tab on a Withdrawn quote.** The page opens blank.

---

## The rules that matter

- **The server refuses to move a quote backwards**, except Shipped → Ordered. It does not force steps to be taken in order.
- **Only a Signed quote can be ordered.** Ordering creates the QuickBooks invoice.
- **Customers can only withdraw.** Every other step change is a super admin's.
- **Creating many quotes at once is all or nothing.** If one row fails, none are created, and the error lists every failing row.
- **Renewal and add-on quotes are all or nothing too.** If one site fails (for example, a missing address), the whole quote is rejected.
- **Sites need a full address before they can go on a renewal or add-on quote.** The screen shows "This site is missing details" and lists what is missing.
- **When a new customer signs, the company is matched by name.** If a company with exactly the project owner's name exists, the quote joins it. Otherwise a new company is created. The same goes for sites: a site with exactly the same name is reused.
- **Every important step emails the quote owner:** created, approved for signing, withdrawn, signed, ordered, and renewal or add-on created or updated.
- **Every create, change, order and delete is recorded in the audit trail.** See [[audit-trail]].

---

## Flow {dev}

1. List page loads `PaginateQuotes` — `denowatts-portal/src/features/quote-management/QuoteManagementPage.tsx:165-187` → `denowatts-backend/src/quote/quote.resolver.ts:68-74` → `quote.service.ts:559-697`.
2. **Create Quote** → chooser (no API) — `denowatts-portal/src/features/quote-management/create/QuoteCreateChooserPage.tsx:38-111`.
3. New site: one-page `QuoteForm variant='merged'` — `create-quote/CreateQuotePage.tsx:8`. Products via `QuoteProducts` (`create-quote/components/QuoteStepReview.tsx:137-159`) → `quote.service.ts:1248-1278` → `utils/quote-product-sku.util.ts:122-182` (SKU choice) + `:14-91` (quantities) → QuickBooks `shared/quickbooks/quickbook.service.ts:481-503`.
4. Order Summary re-prices via `QuotePricingPreview` — `shared/components/QuoteCartPanel.tsx:134-161` → `quote.service.ts:2030-2093`.
5. Submit → `CreateQuote` — `QuoteForm.tsx:299-301` → `quote.service.ts:223-289` (price, owner resolve, `quoteType: NEW`, move docs, audit, email).
6. Multiple sites → `BulkCreateQuotes` — `bulk-create/BulkCreatePage.tsx:1411-1444` → `quote.service.ts:776-910`.
7. Renew → `RenewableSites` + `RenewalData` + `AddOnProducts` → `RenewQuote` / `UpdateRenewQuote` — `create/renew/RenewFlowPage.tsx:140-150,361-385` → `quote.service.ts:2095-2145, 1280-1451, 1453-1470, 1712-1726`.
8. Add products → `RenewalData` + `AddOnProducts` → `CreateAddOnQuote` / `UpdateAddOnQuote` — `create/add-products/AddProductsFlowPage.tsx:89-104,272-290` → `quote.service.ts:1472-1491, 1728-1741`. Both group flows share `createGroupQuoteBatch` (`:1493-1710`) and `updateGroupQuoteBatch` (`:1743-2006`).
9. Super admin **Request for Signing** → `UpdateQuote {status: REQUESTED_FOR_SIGNING}` — `quote-view/QuoteViewPage.tsx:70-93` → `quote.service.ts:291-389`.
10. Customer **Accept and Sign** → `ProcessQuoteForSigning` — `QuoteViewPage.tsx:152-176` → `quote.service.ts:1157-1218` → DocuSeal submission. Embedded form posts completion from the browser to `POST /api/docuseal/signing/completed` — `denowatts-portal/src/common/utils/docusealApi.ts:11-29` → `denowatts-backend/src/shared/docuseal/docuseal.controller.ts:17-33` → `docuseal.service.ts:476-682` (SIGNED, company/site auto-create, PDF to Denobox, email).
11. **Confirm Order** on the Shipping tab → `QuoteOrder` — `order/components/OrderForm.tsx:191-229` → `quote.service.ts:912-1129` (QuickBooks invoice, ORDERED, children ORDERED, docs to Denobox Plans, email).
12. **Confirm Shipment** / **Cancel Shipment** → `UpdateQuote {status}` — `QuoteViewPage.tsx:209-232` → `quote.service.ts:413-543` (site subscription writes).

---

## Entry points {dev}

| Route | Route file → component | Title |
|---|---|---|
| `/settings/quote-management` | `routes/_dashboard/settings/quote-management/index.tsx` → `QuoteManagementPage.tsx` | Quote Management |
| `/settings/quote-management/create` | `create/index.tsx` → `create/QuoteCreateChooserPage.tsx` | Create Quote |
| `/settings/quote-management/create/new-site` | `create/new-site.tsx` → `create-quote/CreateQuotePage.tsx` | Quote for a New Site |
| `/settings/quote-management/create/multi-site` | `create/multi-site.tsx` → `bulk-create/BulkCreatePage.tsx` | Quote for Multiple Sites |
| `/settings/quote-management/create/add-products` | `create/add-products.tsx` → `create/add-products/AddProductsFlowPage.tsx` (`?id=` edits) | Add Products |
| `/settings/quote-management/create/renew` | `create/renew.tsx` → `create/renew/RenewFlowPage.tsx` | Renew Sites |
| `/settings/quote-management/renew/:id` | `renew/$id.tsx` → `RenewFlowPage.tsx` (edit) | Edit Renewal |
| `/settings/quote-management/:id` | `$id/index.tsx` → `quote/QuotePage.tsx` (Quote / Shipping tabs) | Quote |
| `/settings/quote-management/:id/quote-view` | `$id/quote-view.tsx` → `quote-view/QuoteViewPage.tsx` | Quote |
| `/settings/quote-management/bulk-create` | `bulk-create.tsx` → redirect to `/create/multi-site` | — |
| `/settings/quote-management/renew` | `renew/index.tsx` → redirect to `/create/renew` | — |
| `/settings/quote-management/order/:dealId` | `order/$dealId.tsx` → `order/OrderPage.tsx` — **dead**, see gotchas | Billing Address |

- Route files live under `denowatts-portal/src/routes/_dashboard/settings/quote-management/`; components under `denowatts-portal/src/features/quote-management/`.
- No role gate on any route. `/settings` only runs `requireCompany`, and quote management is exempt — `denowatts-portal/src/common/utils/authGuards.ts:32,101`. Sidebar item "Quotation" for USER/ADMIN/SUPER_ADMIN, and in the reduced no-company sidebar — `common/components/AppSidebar/AppSidebar.tsx:43-47,450-475`.
- Header controls by route: `RenewSettings` (Owner + Renew Date) on renew routes, `AddProductsSettings` (Owner) on add-products, `QuoteSettings` (search) on the list — `common/components/Header.tsx:660-704`.
- External entry: Service Management "Renew (n)" → `/create/renew?site=…` — `features/settings/service-management/ServiceManagementPage.tsx:664-687`.

---

## GraphQL API surface {dev}

All in `denowatts-backend/src/quote/quote.resolver.ts`. Every operation needs a JWT (global `JwtAuthGuard`).

| Operation | Kind | Role | Line | Service |
|---|---|---|---|---|
| `createQuote(createQuotationInput)` | Mutation | any | 42 | `quote.service.ts:223` |
| `bulkCreateQuotes(bulkCreateQuotationInput)` | Mutation | any | 50 | `:776` |
| `updateQuote(updateQuoteInput)` | Mutation | any (status guarded in service) | 58 | `:291` |
| `paginateQuotes(filter)` | Query | any (scoped in service) | 68 | `:559` |
| `getQuoteById(id)` | Query | any (`isQuoteActionable`) | 76 | `:718` |
| `quoteOrder(quoteOrderInput)` | Mutation | any (`isQuoteActionable`) | 84 | `:912` |
| `deleteQuote(deleteQuoteInput)` | Mutation | **SUPER_ADMIN** | 94 | `:1131` |
| `processQuoteForSigning(quoteSigningInput)` | Mutation | **ADMIN, USER** | 103 | `:1157` |
| `quoteProducts(quoteProductsInput)` | Query | any | 112 | `:1248` |
| `renewalData(renewalDataInput)` | Query | any | 120 | `:1280` |
| `renewQuote(renewQuoteInput)` | Mutation | any | 128 | `:1453` |
| `createAddOnQuote(createAddOnQuoteInput)` | Mutation | any | 136 | `:1472` |
| `quotePricingPreview(input)` | Query | any | 144 | `:2030` |
| `renewableSites(filter)` | Query | any (site access scope) | 152 | `:2095` |
| `renewalAddProducts` | Query | any | 160 | `:2147` (alias of `addOnProducts`) |
| `addOnProducts` | Query | any | 165 | `:2151` |
| `updateRenewQuote(updateRenewQuoteInput)` | Mutation | any (`isQuoteActionable`) | 170 | `:1712` |
| `updateAddOnQuote(updateAddOnQuoteInput)` | Mutation | any (`isQuoteActionable`) | 178 | `:1728` |

Note `RolesGuard` lets SUPER_ADMIN bypass role lists, but the portal never shows **Accept and Sign** to a super admin (`QuoteViewPage.tsx:234-400`).

**Key inputs** (`denowatts-backend/src/quote/dto/quote.dto.ts`):

- `QuotePaginateFilterInput` (153-200): `page`, `limit`, `search`, four `sortBy*` ints, `company`, `status[]`, `quoteType[]`, `groupId`.
- `RenewalDataItemInput` (384-422): `_id` (site), `siteName`, `siteAcNameplate`, `siteMountingType[]`, `siteModuleType[]`, `initialSubscriptionYears`, `currentServices`, `products[]` (non-empty). Used by renew **and** add-on (`CreateAddOnQuoteInput.siteData`, 442-453).
- `RenewQuoteInput` (424-440): `owner`, `renewalData[]`, `nextRenewalDate` (required). Add-on has no `nextRenewalDate`.
- `RenewableSitesFilterInput` (519-545): `company`, `withinDays` (default 90), `includeExpired` (default true), `search`.
- `QuotePricingPreviewInput` (613-629): `quoteType`, `shipping`, `sites[]` of `{siteId, siteName, initialSubscriptionYears, products?, config?}` (586-611). **`quoteType` and `shipping` are ignored** — `quote.service.ts:2034`.

**Portal operation definitions:** `graphql/queries/quotationQueries.ts` (`QuoteProducts` 3, `PaginateQuotes` 40, `GetQuoteById` 156), `graphql/queries/renewalQueries.ts` (`RenewalData` 3), `features/quote-management/api/pricingQueries.ts` (`QuotePricingPreview` 8, `RenewableSites` 45, `AddOnProducts` 72), `api/quotationMutaions.ts` (`CreateQuote` 3, `BulkCreateQuotes` 87, `DeleteQuote` 181, `UpdateQuote` 189, `QuoteOrder` 273, `ProcessQuoteForSigning` 281), `api/renewalMutations.ts` (`RenewQuote` 3, `UpdateRenewQuote` 91, `CreateAddOnQuote` 179, `UpdateAddOnQuote` 195).

**Defined but never called in the portal:** `CREATE_ORDER`, `PRE_ORDER_FORM_DATA`, `HUBSPOT_PRODUCTS`, `SEARCH_HUBSPOT_CONTACTS`, `SEARCH_HUBSPOT_COMPANIES` (HubSpot path is legacy — see [[hubspot-crm-legacy]]). `RENEWAL_ADD_PRODUCTS` is only a fallback in `features/settings/service-management/components/ProductList.tsx:102-105`, always skipped because both callers pass a catalog.

---

## Service internals {dev}

`QuoteService` — `denowatts-backend/src/quote/quote.service.ts`. Injects `quoteModel`, `companyModel`, `DocuSealService` (forwardRef), `QuickBooksService`, `UsersService`, `SitesService`, `StorageService`, `EmailService`, `ChannelsService`, `AuditTrailService` (125-139).

### Pricing — `calculateProducts` (141-221)

1. Keep lines with `quantity > 0`; throw `"No products are selected"` if none.
2. Re-fetch those SKUs from QuickBooks (`getProductsBySku`, 60 s in-memory cache — `quickbook.service.ts:479-503`). **Lines whose SKU is not returned (inactive or missing) are dropped silently** (162-180).
3. Server price wins over client price, except `CustomService` (100920), where client `name`/`description`/`price` are kept (168-172). Client `discount` is trusted as sent — **no server-side cap**.
4. Bucket by QuickBooks parent category: "Service Recurring" → recurring; "Setup Fee" or "Service One Time" → one-time; anything else → hardware (`quickbook.service.ts:539-556`).
5. Each line = `price × quantity − discount`. `recurringAnnualService = recurring / years`. `totalAmount = hardware + one-time + recurring + shipping`. All `Math.round` (207-211).

### Shipping

`FIXED_SHIPPING_CHARGE = 100` (`constants/index.ts:1`). Applied on `createQuote` (227, 249), `updateQuote` when products change (320, 338), `bulkCreateQuotes` (834, 844), group parents (1518, 1934), and the pricing preview group total (2034, 2090). Group **children** always get `shipping: 0` (1606, 1634, 1824, 1852). `quoteOrder` sends `quote.shipping ?? 100` to QuickBooks (984).

### Product selection — `utils/quote-product-sku.util.ts`

- `getAllProductsSku` (122-182): always `DenoGatewayG3` + `DenoSensorHorizontal`; `CustomService` for SUPER_ADMIN only (127-129); then conditional SKUs per the business table above. `ADVANCED_ENERGY_ACCOUNTING` pushes both `advanced[acSize]` **and** `expert[acSize]` (146-148) — the `expert` SKUs (100803-*) are the QuickBooks "Site Configuration and Data Validation" setup fee (`denowatts-portal/src/features/quote-management/shared/setupFeeWaiver.ts:3-8`).
- `getQuantity` (14-91): Custom 0; Outdoor enclosure 1; `100803*` 1; one-time 1; recurring = `initialSubscriptionYears`; POA/rPOA/tracker adder = Deno count; gateway/modem/DenoHub = gateway count; else 0.
- `getAcSize` (93-105): buckets 1/10/25/100/1000.
- `getDiscount` (107-112): `100803*` **and** `initialSubscriptionYears === 5` → full price (one unit). The portal's `applySetupFeeWaiver` uses `>= 5` and `price × quantity` (`shared/setupFeeWaiver.ts:34-45`), and is what actually reaches `calculateProducts`.

### Status guard — `updateQuote` (291-546)

- Non-SUPER_ADMIN may only send `status: WITHDRAWN` (302-308).
- Backward check: reject if `level(current) > level(new)` (310-312). Levels — `utils/quote-status.util.ts:7-26`: PENDING 1, REQUESTED_FOR_SIGNING 2, SIGNED 3, ORDERED 4, SHIPPED 4, WITHDRAWN 5, DELETED 5. So ORDERED ↔ SHIPPED is allowed both ways, forward skips are allowed, and WITHDRAWN/DELETED are terminal.
- **No status check on product edits.** `updateQuote` re-prices whenever `products` is sent, at any status (316-322).
- If `owner` changes, `company` is re-derived from the new owner (329-332).
- Side effects on transition:
  - → REQUESTED_FOR_SIGNING: "Quote approved for signing" email (366-389).
  - → WITHDRAWN: "Quote withdrawn" email (391-411).
  - NEW → SHIPPED: `sitesService.update(quote.site, {serviceStatus: SHIPPED, commercialOperationDate: Jan 1 of commercialOperationYear, energyAccounting: BASIC|ADVANCED, subscriptions.plan {type BASIC|ADVANCED, start today, end nextRenewalDate ?? today + years}, capacityTest 1 year if epcAndCapacityTest})` (413-461). Errors are caught and sent to Sentry only — **the status change still succeeds**.
  - group RENEWAL → SHIPPED: for every child with a site, set plan (type from the **parent's** `currentServices`, end = child's `nextRenewalDate` ?? today + child years) and `serviceStatus: SHIPPED` unless already ACTIVE_* (462-520).
  - NEW SHIPPED → ORDERED: `serviceStatus: ORDERED`, `subscriptions: undefined` (522-543).
  - ADD_ON → SHIPPED: no branch.

### Access — `utils/quote-status.util.ts:28-46`

`isQuoteActionable`: SUPER_ADMIN, or `owner == user`, or `company == user.company`. Else `ForbiddenException`. List scope adds `createdBy == user` (`quote.service.ts:584-591`), so a creator can **list** a quote they cannot **open** if they are neither owner nor in its company.

### List — `paginateQuotes` (559-697)

- Always `groupId: {$exists: false}` (children never listed).
- Status: explicit list minus DELETED; empty/absent → `$ne: DELETED`; only DELETED → `{$ne: DELETED, $exists: false}` (matches nothing) (567-576).
- `quoteType` filter: NEW also matches `null` for legacy quotes (578-582).
- Search: `$text` on users, regex on company name, regex on `siteName`/`projectOwner`, exact `referenceId` if numeric (593-622).
- `sortByExpireAt` sorts by `updatedAt` (631-633). Default sort `createdAt: -1`.
- Stats via parallel `$group` aggregate over the whole match (675-684).

### Bulk create — `bulkCreateQuotes` (776-910)

One QuickBooks call for all `DenoWattsSku`. Per row: derive SKUs → `quoteProducts` with the cached catalog → if `isExistingSite`, find site by **case-insensitive regex on name** (806-821) → price → `insertOne` with `quoteType: NEW`. Any error aborts all (858-860). One summary email.

### Order — `quoteOrder` (912-1129)

Rejects unless SIGNED (925-927). For groups, flattens child products with `(site) -` prefixes (938-957). Invoice email = `createdBy.email` → billing contact → owner (966). `createInvoice` failure throws (996-1000). Sets ORDERED, bulk-sets children ORDERED (1032-1037), copies `orderDocuments` to `denobox/{site}/Plans/` (1039-1052), emails owner + QuickBooks `BillEmail` (1054-1103), audits parent and each child. **Whole method is wrapped in a catch that rethrows as `InternalServerErrorException`** (1125-1128), so "not signed" reaches the client as a 500.

### Signing — `processQuoteForSigning` (1157-1218)

Requires REQUESTED_FOR_SIGNING. Creates or resumes the DocuSeal submission with the **current user** as signer. Stores `dsEnvelopeId`, `dsSigningUrl`. Status is unchanged. Completion — `docuseal.service.ts:476-682`: verifies `status === "completed"`, re-fetches the submission, requires REQUESTED_FOR_SIGNING, sets SIGNED, `dsSignImage`, `signedAt`; creates the company by **exact name = `projectOwner`** if the quote has none (545-565, 684-707), and sets it on the owner if they have none; creates the site by **exact name** if `!isExistingSite` (567-581, 709-746; new site gets `serviceStatus: ORDERED`, geocoded, "Capacity Test" tag if bought); copies `quoteDocuments` to Plans; stores the signed PDF at `denobox/{site}/Admin/quote-{ref}-signed.pdf` on a later tick (601-634). Full detail in [[e-signature]].

### Renewal pre-fill — `renewalData` (1280-1451)

- `quoteId` branch (edit): returns each child's stored products + the site's live `subscriptions`.
- `sites` branch: fetch `DenoWattsRenewalSku` from QuickBooks; for each site, read Deno channels — POA without rPOA aux → `100210-R`, POA with rPOA aux → `100211-R` (1357-1395); service product: plan type `BASIC` → Essential Weather, else `advanced[acSize]` (1397-1413); `siteAcNameplate` = sum of block `acNameplate` / 1000; `initialSubscriptionYears` = 1 if plan type `ESSENTIAL_WEATHER` else 5; `currentServices` = ESSENTIAL_WEATHER if plan type `ESSENTIAL_WEATHER` else ADVANCED_ENERGY_ACCOUNTING (1420-1425); module type hard-coded `[Monofacial]` (1438).

### Group create — `createGroupQuoteBatch` (1493-1710)

Parent is created **first** (validated, then saved) using `siteData[0]` for address, mounting, module, service and years; `siteName` "Multiple Sites" if more than one; `siteAcNameplate` = sum; `isExistingSite: true`, `site: undefined`, `products: []`, `shipping: 100`, `status: PENDING`, `estimatedShipDate` today + 30, `nextRenewalDate` (renewal only) (1525-1571). A missing-detail validation error says `Add the missing details to "<site>"` (1563-1570). Children: each product must exist in the QuickBooks list or the site fails; quantity rounded to 3 decimals; `shipping: 0` (1573-1653). Any child error → parent deleted, all errors thrown (1660-1663). Audit per child, one email.

### Group edit — `updateGroupQuoteBatch` (1743-2006)

Checks `isGroup`, matching `quoteType`, `isQuoteActionable` — **no status check**. For each input site: `updateOne` with `upsert` on `{groupId, site}`, which resets that child to **PENDING**, regenerates its `referenceId`, and resets `estimatedShipDate`/`expiresAt` (1829-1901). **Children for sites no longer in the input are left untouched.** Then recompute parent totals from **all** children with `shipping: 100` and years from the first child (1925-1957). Parent `status` is not touched. Non-HTTP errors become `"Failed to update renewal quotes"` (2004), including for add-ons.

### Pricing preview — `quotePricingPreview` (2008-2093)

Per site: use sent `products`, or derive from `config` via the same SKU rules; price with shipping 0. Group total adds one $100.

### Renewable sites — `renewableSites` (2095-2145)

`sitesService.find` with `packageExpiresAt` = today + `withinDays`, which becomes `subscriptions.plan.endDate <= horizon` (`sites/services/sites.service.ts:1125-1129`), under the user's normal site access. Sites without a plan end date are skipped. Sorted by days until expiry.

### Add-on catalog — `addOnProducts` (2151-2160)

Every `DenoWattsSku` + `DenoWattsRenewalSku` + `DenoWattsRenewalAddProductSku`, minus `CustomService`, quantity 0.

---

## Frontend behaviour {dev}

**New-site form** — `create-quote/components/QuoteForm.tsx`, `variant='merged'` (sections Project / Location / Site Details / Services / Products, 37-63). The old `'wizard'` branch (444-470, `QuoteProgressIndicator.tsx`) is unreachable: both callers pass `'merged'` (`CreateQuotePage.tsx:8`, `quote/QuotePage.tsx:65`).

- Defaults (390-403): owner = current user, New construction, Energy Accounting, 5 years, shipping 100, COD year = this year, Modbus TCP and RTU.
- Service options: only "Essential Weather" and "Energy Accounting" (`types/quote.types.tsx:43-54`). Basic Weather, Basic Monitoring and Expert Optimization Guide exist in the enum but are not offered.
- Essential Weather forces 5 years and disables the term select; Essential Weather/Basic Monitoring untick capacity test (`QuoteStepServices.tsx:89-121`). Capacity test disabled unless Energy Accounting (217-239).
- Cellular Yes → 1 GB + VPN Yes; No → clears both (153-162); on submit, cellular off forces `cellPlan: null`, `remoteAccessVpn: false` (`QuoteForm.tsx:261-264`).
- Only Hardware rows have a quantity stepper (`QuoteStepReview.tsx:389-444`). Custom Service: name/description editable by anyone, price by SUPER_ADMIN; price > 0 sets qty 1 (236-264, 346-366).
- Setup-fee waiver applied on load and submit (`QuoteStepReview.tsx:210-224`, `QuoteForm.tsx:240-243`).
- Validation on submit only (`validateTrigger={[]}`, 361).

**Order Summary** — `shared/components/QuoteCartPanel.tsx`: `QuotePricingPreview`, no-cache, 400 ms debounce (78, 134-161). Blocks submit on over-line discount (109-137, `shared/discount.ts:27-83`).

**Multiple sites** — `bulk-create/BulkCreatePage.tsx`: spreadsheet parse falls back to Essential Weather for unknown service text (71-92) and Modbus TCP and RTU for unknown acquisition (298-331). Payload (1411-1437) omits `remoteAccessVpn` and `outdoorEnclosure`, though the cart prices them (1355-1356). Stays on page after success (1446-1454).

**Renew** — `create/renew/RenewFlowPage.tsx`: recurring quantity = days(renew date − plan end) / 365 (47-73, 194-215); setup fee not scaled. Renew Date slots: June 30 / Dec 31, ≥ 1 year out, 6 years (`features/settings/service-management/components/RenewSettings.tsx:48-93`). `RenewSettings` skips its users query for a SUPER_ADMIN with no company (27).

**Add products** — `create/add-products/AddProductsFlowPage.tsx`: sites start empty (134-142); zero-qty lines dropped (254-255). Owner locked once sites are chosen or when editing (`components/AddProductsSettings.tsx:40,71-76`).

**Build from answers** — `shared/components/SiteConfigureModal.tsx`: hides questions whose SKUs the catalog lacks (`shared/quoteConfigQuestions.ts:63-147`); uses the site's AC (200-202); merges by SKU, adding (`shared/mergeQuoteProducts.ts:10-28`).

**Quote page tabs** — `quote/QuotePage.tsx:54-83`: "Quote" for SUPER_ADMIN at level < 3; "Shipping" (`OrderForm`) at level 3–4. Both keyed `'1'`; `?tab=order` sets `'2'`.

**Shipping tab** — `order/components/OrderForm.tsx`: billing prefill from quote → company → owner/site (134-189); "Same as Billing Info"; ship date required, no past dates, default stored or today + 30; one "Purchase Order" upload; read-only at ORDERED/SHIPPED (258-260).

**Quote view** — `quote-view/QuoteViewPage.tsx`: buttons per status (234-400); totals are stored server fields (557-700); Shipping shows "TBD" when `nextRenewalDate` is set and shipping is 0 (656-671); signature image if `dsSignImage` (938-949). Cover page falls back to "OneEnergy, Inc." for an empty project owner (`QuoteCoverPage.tsx:179`). `GET_QUOTE` does not request `quoteType`.

---

## Schema {dev}

`Quote` — `denowatts-backend/src/quote/schemas/quote.schema.ts` (Mongoose + GraphQL, `timestamps: true`). Changes since v3:

| Field | Type | Notes |
|---|---|---|
| `quoteType` | `QuoteType` (NEW / RENEWAL / ADD_ON), default NEW | 56-60, 417-418. Legacy quotes may be `null`. |
| `expiresAt` | Date | 488-489. Written as created + 90 days (`quote.service.ts:240`, 1555); **never read by the portal**. |
| `groupId`, `isGroup` | ObjectId / Boolean | Group parent/child link, used by RENEWAL and ADD_ON. |
| `nextRenewalDate` | Date | RENEWAL parent and children only. |
| `shipping` | Number, required | Always 100 on NEW and group parents; 0 on children. |

Other fields as before: owner, company, createdBy, referenceId (8 digits: last 4 of ms timestamp + 4-digit OTP, `utils/quote-status.util.ts:48-53`), site fields, `siteMountingType[]`, `siteModuleType[]`, `siteNewRetrofit`, `commercialOperationYear`, `currentServices`, `initialSubscriptionYears`, options (`epcAndCapacityTest`, `cellPlan`, `outdoorEnclosure`, `remoteAccessVpn`, `opcClientSetup`, `showHorizontal`, `dataAcquisitionSource`), `products[]` (`QuoteProduct`: id, name, description, type, price, quantity, sku, image, order, term, billingFrequency, discount), subtotals, `totalAmount`, `estimatedTax` (unused), `status`, DocuSeal fields (`dsEnvelopeId`, `dsSigningUrl`, `dsSignImage`, `signedAt`), `billingInfo`, `shippingInfo`, `quoteDocuments`, `orderDocuments`, `deletedAt`.

Indexes (494-502): `groupId` (sparse), `status + createdAt`, `owner`, `createdBy` (sparse), `company` (sparse), `quoteType + createdAt`.

### SKU reference

`denowatts-backend/src/quote/constants/index.ts`. Renewal hardware carries an `-R` suffix; images are looked up without the suffix (`utils/quote-product-sku.util.ts:114-120`).

| SKU | Code | Notes |
|---|---|---|
| DenoGatewayG3 | 100100 | Every new quote |
| DenoHubG3 | 100102 | Modbus TCP and RTU |
| AntennaTrackerAdder | 100303 | Ground (Tracker) |
| DenoSensorPOA | 100210 (renewal 100210-R) | Monofacial |
| DenoSensorPOA_rPOA | 100211 (renewal 100211-R) | Bifacial |
| DenoSensorPOA_Horizontal | 100212 (renewal 100212-R) | Add-on catalog |
| DenoSensorHorizontal | 100213 | Every new quote |
| CellularModem | 100600 | Cellular |
| OutdoorEnclosure | 100700 | Option |
| CellularData1GB / 10GB | 100901-1 / 100901-10 | Recurring |
| BasicWeather | 100800 | Not offered in UI |
| EssentialWeather / BasicMonitoring_{n} | 100801 / 100801-{n} | **Share the 100801 prefix** |
| AdvancedEnergyAccounting_{n} | 100802-{n} | Energy Accounting |
| ExpertOptimizationGuide_{n} | 100803-{n} | QuickBooks name "Site Configuration and Data Validation" — the setup fee |
| TestingPackage_{n} | 100820-{n} | Capacity test |
| RemoteAccessVPN | 100904 | Recurring |
| OPC_Client_Setup | 100910 | OPC Only |
| CustomService | 100920 | SUPER_ADMIN only |

`{n}` ∈ 1, 10, 25, 100, 1000 (the `acSize` band).

---

## Data touched {dev}

- `quotes` — created by `createQuote`, `bulkCreateQuotes`, `createGroupQuoteBatch`; updated by `updateQuote`, `quoteOrder`, `deleteQuote` (soft), `processQuoteForSigning`, `updateGroupQuoteBatch` (upsert children, recompute parent), DocuSeal completion — `denowatts-backend/src/quote/quote.service.ts`, `denowatts-backend/src/shared/docuseal/docuseal.service.ts:476-682`.
- `sites.serviceStatus`, `sites.subscriptions.plan`, `sites.subscriptions.capacityTest`, `sites.commercialOperationDate`, `sites.energyAccounting` — written on → SHIPPED / SHIPPED → ORDERED — `quote.service.ts:413-543`. New `sites` documents created on signing — `docuseal.service.ts:709-746`.
- `companies` — read for list search; created on signing — `docuseal.service.ts:684-707`.
- `users.company` — set on signing if the owner had none — `docuseal.service.ts:559-562`.
- `channels` — read in renewal pre-fill to detect POA / rPOA — `quote.service.ts:1357-1374`.
- Audit trail — `quote.created`, `quote.updated` (with field diff), `quote.ordered`, `quote.deleted`, `quote.renewed`, `quote.add_on_created` — `quote.service.ts:264, 358, 1111, 1143, 1671`. See [[audit-trail]].
- S3 — quote/order documents moved to `<quoteId>/`; copied to `denobox/{site}/Plans/`; signed PDF to `denobox/{site}/Admin/`; product images from `quickbooks/products/`. See [[storage]].
- QuickBooks — catalog read (60 s cache); invoice on order. SendGrid — emails listed above. See [[email]].

---

## Business rules (cited) {dev}

- Non-super-admins can only set WITHDRAWN — `denowatts-backend/src/quote/quote.service.ts:302-308`.
- Backward moves refused; ORDERED/SHIPPED share level 4 — `quote.service.ts:310-312`, `utils/quote-status.util.ts:7-26`.
- Shipping fixed at $100 — `constants/index.ts:1`, `quote.service.ts:249`.
- Order requires SIGNED — `quote.service.ts:925-927`.
- Delete is SUPER_ADMIN only and soft — `quote.resolver.ts:94`, `quote.service.ts:1138-1141`.
- Signing is ADMIN/USER — `quote.resolver.ts:103`.
- Custom Service line is SUPER_ADMIN only — `utils/quote-product-sku.util.ts:127-129`.
- Setup fee waived on 5-year term — `utils/quote-product-sku.util.ts:107-112`; portal `denowatts-portal/src/features/quote-management/shared/setupFeeWaiver.ts:34-45`.
- Group children never listed — `quote.service.ts:563-565`.
- Bulk and group creates are all-or-nothing — `quote.service.ts:858-860, 1660-1663`.
- Add-on quotes do nothing on SHIPPED — `quote.service.ts:413-520` (no ADD_ON branch).

---

## Edge cases & gotchas {dev}

- **Signed renewal/add-on quotes can be re-priced by customers.** The list's Edit is only disabled at PENDING/REQUESTED_FOR_SIGNING for non-super-admins (`denowatts-portal/src/features/quote-management/QuoteManagementPage.tsx:543-549`), group edits route to `/renew/:id` or `/create/add-products?id=` (273-288), and `updateGroupQuoteBatch` has no status check (`quote.service.ts:1754-1770`). Editing a SIGNED/ORDERED/SHIPPED group re-prices the parent and resets edited children to PENDING while the parent keeps its status. **Flag for human review.**
- **Renewal plan type comes from the parent.** On group SHIPPED, every child's plan `type` uses the parent's `currentServices`, which is copied from the first site (`quote.service.ts:494-498, 1552`). A mixed Essential Weather / Energy Accounting renewal gives every site the first site's plan type.
- **Renewal pre-fill checks two different plan types.** The product check uses `BASIC` (1397), the tier/years check uses `ESSENTIAL_WEATHER` (1420-1425). New-site shipping only ever writes `BASIC` or `ADVANCED` (436-438). So a site that came from an Essential Weather quote pre-fills with the Essential Weather product **but** `currentServices: ADVANCED_ENERGY_ACCOUNTING` and 5 years — and on renewal shipment its plan becomes `ADVANCED`. **Flag for human review.**
- **Renewal module type is always Monofacial** (1438). Sensor products are right (detected from channels); only the stored module field is wrong.
- **Group edits never remove sites** — upsert only (1829-1901); stale children keep counting in parent totals (1925-1957).
- **Bulk VPN/enclosure dropped** — payload `denowatts-portal/src/features/quote-management/bulk-create/BulkCreatePage.tsx:1411-1437`.
- **Quote-view Edit ignores type.** Super admin "Edit" on the view page always goes to `/:id` (the new-site form), even for groups — `QuoteViewPage.tsx:130-132`.
- **Blank `/:id` page** for WITHDRAWN, for non-super-admins at level < 3, and with `?tab=order` — `quote/QuotePage.tsx:35-83`.
- **`/order/:dealId` is dead** — `OrderPage` renders `OrderForm initialData={null}` and ignores the param; a submit would send `_id: undefined` — `order/OrderPage.tsx:3-5`.
- **`quoteOrder` errors are all 500s** — outer catch (`quote.service.ts:1125-1128`).
- **Site status update failures on SHIPPED are swallowed** — Sentry only (455-461, 540-542); the quote still shows Shipped.
- **Expiry display vs stored.** UI shows `updatedAt + 90d` (`QuoteManagementPage.tsx:515`, `QuoteViewPage.tsx:409-413`); `expiresAt` is stored but unread; nothing enforces expiry.
- **Status filter "Deleted only" matches nothing** — `quote.service.ts:571-573`.
- **Creator can list but not open.** List scope includes `createdBy` (588) but `isQuoteActionable` does not.
- **Name-matching on signing.** Company by exact `projectOwner` (`docuseal.service.ts:685-691`); site by exact `siteName` (713-721). Two customers with the same project-owner text share a company.
- **Edit toast says "Failed to create quote"** on an update failure — `create-quote/components/QuoteForm.tsx:315`.
- **Orphans:** `components/RejectionModal.tsx` (no `REJECTED` status exists), `quote-view/components/GroupQuotesTable.tsx`, the wizard pieces of `QuoteForm`.
- **Stuck signatures** — one-off repair script `denowatts-backend/src/quote/migrations/fix-stuck-docuseal-signing.migration.ts` (dry run by default, `APPLY=1` to write; defaults to one specific quote id). There is still no automatic reconciliation.

---

## Solar & platform terminology {dev}

- **Quote** — a priced proposal for hardware and monitoring for one or more sites.
- **Quote type** — NEW (new site), RENEWAL (extends subscription), ADD_ON (more products, no subscription change).
- **Group quote** — a parent quote (`isGroup`) signed once, with one child quote per site (`groupId`). All renewal and add-on quotes are groups.
- **Reference ID** — the 8-digit number customers see.
- **AC nameplate** — the site's rated AC capacity in MW; decides sensor/gateway counts and the size band of priced services.
- **POA / rPOA** — plane-of-array irradiance, front and rear. Bifacial modules need the rear (rPOA) sensor.
- **Gateway / DenoHub** — on-site data-collection hardware. DenoHub is added for Modbus TCP and RTU.
- **Essential Weather / Energy Accounting** — the two service levels offered. Essential Weather is sensor data only; Energy Accounting analyses all site equipment.
- **Setup fee** — "Site Configuration and Data Validation" (SKU 100803-*), waived on a 5-year term.
- **Commercial operation year** — the year the site starts producing; becomes the site's commercial operation date on shipment.
- **DocuSeal** — the e-signature provider. **QuickBooks** — source of product prices and where invoices are created.

For the full vocabulary, see [[solar-glossary]].

---

**Related flows:** [[e-signature]] · [[settings]] · [[site]] · [[channels]] · [[storage]] · [[companies]] · [[authentication]] · [[audit-trail]] · [[email]] · [[hubspot-crm-legacy]] · [[solar-glossary]]
