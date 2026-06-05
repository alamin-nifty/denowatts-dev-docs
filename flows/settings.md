---
title: Settings
owner: alamin-nifty
status: draft
version: 1
updated_at: 2026-06-05
---

# Settings

Settings is a centralized hub for all admin and user configuration. It spans 18 different pages grouped into three tiers: **company-level** (accessible to all users), **account management** (for admins), and **system configuration** (SuperAdmin-only). The feature is organized as a dropdown menu in the header with role-based filtering — non-SuperAdmins see only company-relevant pages, while SuperAdmins see all administrative tools.

In plain terms: the gear icon in the header opens a dropdown menu. Click a settings page to configure your company profile, manage users, API keys, notification rules, assets, devices, or system-wide settings. Different roles see different menu items.

---

## The rules that matter

**Settings menu is role-gated at the UI level, then enforced on the backend.** The header's `settingsMenuItems` array is split into two groups: base items (visible to all users with a company) and SuperAdmin-only items (after a divider). Frontend filtering shows/hides items; backend `@Roles()` decorators enforce access. — `denowatts-portal/src/common/components/Header.tsx:398-693`, `denowatts-backend/src/**/resolvers/*.ts`

**Role constants define who can do what:** `UserType.User` (read-only), `UserType.Admin` (standard admin), `UserType.SuperAdmin` (full access). The backend uses `@Roles(SUPER_ADMIN)`, `@AllRoles()`, etc. to gate mutations and queries. — `denowatts-portal/src/common/components/Header.tsx:518-528`, `denowatts-portal/src/graphql/__generated__/graphql.ts`

**Settings routes require a company assignment (except Metrics and Device Types).** Most settings pages are wrapped in `<CompanyRequiredRoute />`, which redirects users without a company to `/not-found`. Metrics and Device Types are company-agnostic and accessible to all authenticated users. — `denowatts-portal/src/router.tsx:350-351`, `denowatts-portal/src/views/ProtectedRoute/CompanyRequiredRoute.tsx`

**SuperAdmin-only pages are wrapped in `<ProtectedRoute />`.** This route guard checks if the current user is a SuperAdmin. Non-SuperAdmins attempting direct URLs are redirected to `/not-found`. Examples: API Management, Users Management, Activity Logs, Cell Modem Management. — `denowatts-portal/src/router.tsx:416-547`, `denowatts-portal/src/views/ProtectedRoute/ProtectedRoute.tsx`

**Settings menu selection is sticky and context-aware.** The `settingsSelectedKeys` memoized function maps the current pathname to a menu key (e.g., `/settings/company` → key `'1'`). This ensures the correct item is highlighted when navigating. — `denowatts-portal/src/common/components/Header.tsx:398-422`

---

## Where it lives

The settings feature spans 18 routes, organized into three tiers:

### Tier 1: All users (with company)
- **Company** — `/settings/company` — View/edit company profile, see users
- **Services** — `/settings/service-management` — Service contracts and SLAs
- **Quotation Management** — `/settings/quote-management` — Quote templates and renewals
- **Notification Management** — `/settings/notification-management` — Alert rules and thresholds
- **Global Alarm Configuration** — `/settings/global-alarm-configuration` — System-wide alarm settings

### Tier 2: Metrics and Device Types (company-agnostic)
- **Metrics** — `/metrics` — Custom metric definitions
- **Device Types** — `/device-types` — Device type library

### Tier 3: SuperAdmin only (after divider in menu)
- **Company Management** — `/settings/company-management` — Manage multiple companies
- **Users Management** — `/settings/users-management` — User permissions and roles
- **Template Management** — `/settings/template-management` — Modbus register templates
- **Module Management** — `/settings/module-management` — PV module specifications
- **Inverter Management** — `/settings/inverter-management` — Inverter device specs
- **Asset Management** — `/settings/asset-management` — Physical asset inventory (modems, gateways, etc.)
- **Remote Management** — `/settings/remote-management` — Remote access and tunneling
- **Metrics Management** — `/settings/metrics-management` — Custom metric configuration
- **System Notification** — `/settings/system-notification` — Email/SMS system settings
- **Cell Modem Plan Management** — `/settings/cell-modem-management` — Lattigo SIM and data plan management
- **Site Launch** — `/settings/site-launch` — Site go-live configuration
- **Activity Logs** — `/settings/activity-logs` — Audit trail of all user actions

---

## Who can open what

### Frontend guards

- **`CompanyRequiredRoute`** wraps the entire `/settings` path tree (except metrics and device-types). You must have a company assigned; SuperAdmins bypass this check. Users without a company see an empty settings menu (only items 4 and 5). — `denowatts-portal/src/router.tsx:350-351`
- **`ProtectedRoute`** wraps all SuperAdmin-only pages (API Management, Users Management, Template Management, Module Management, Inverter Management, Asset Management, Remote Management, Metrics Management, System Notification, Cell Modem Management, Site Launch, Activity Logs). Non-SuperAdmins attempting these routes are redirected to `/not-found`. — `denowatts-portal/src/router.tsx:416-547`

### Backend role control

Each settings page's resolver/service is decorated with role guards:

| Page | Resolver guard | Details |
|------|---|---|
| Company | `@AllRoles()` or no guard | All users can read/update their own company |
| Service Management | `@AllRoles()` | All users can view services |
| Quotation Management | `@AllRoles()` | All users can create quotes (but may be filtered by company) |
| Notification Management | `@AllRoles()` | All users can manage their company's alerts |
| Global Alarm Configuration | `@AllRoles()` | All users can configure alarms for their company |
| API Management | `@Roles(SUPER_ADMIN)` | SuperAdmin only |
| Users Management | `@Roles(SUPER_ADMIN)` | SuperAdmin only |
| Template Management | `@Roles(SUPER_ADMIN)` | SuperAdmin only |
| Module Management | `@Roles(SUPER_ADMIN)` | SuperAdmin only |
| Inverter Management | `@Roles(SUPER_ADMIN)` | SuperAdmin only |
| Asset Management | `@Roles(SUPER_ADMIN)` | SuperAdmin only |
| Remote Management | `@Roles(SUPER_ADMIN)` | SuperAdmin only |
| Metrics Management | `@Roles(SUPER_ADMIN)` | SuperAdmin only |
| System Notification | `@Roles(SUPER_ADMIN)` | SuperAdmin only |
| Cell Modem Management | `@Roles(SUPER_ADMIN)` | SuperAdmin only |
| Activity Logs | `@Roles(SUPER_ADMIN)` | SuperAdmin only |
| Company Management | `@Roles(SUPER_ADMIN)` | SuperAdmin only |

---

## How it works {dev}

### Opening the settings menu

1. The user clicks the gear icon in the header. — `denowatts-portal/src/common/components/Header.tsx`
2. The header component calculates `settingsMenuItems` using a memoized function. It filters items based on `currentUser?.type === UserType.SuperAdmin`. If the user is SuperAdmin, the array includes all items; if not, it returns only the base items (items 1–6, and item 12). — `denowatts-portal/src/common/components/Header.tsx:424-693`
3. The menu is rendered as an Ant Design `<Dropdown>` with `settingsSelectedKeys` memoized to map the current pathname to the active menu key. This ensures the correct item is highlighted. — `denowatts-portal/src/common/components/Header.tsx:398-422`
4. Clicking a menu item navigates to its route using `<Link to="/settings/...">`. — `denowatts-portal/src/common/components/Header.tsx:429-436`

### Opening a settings page (example: Company)

1. The user navigates to `/settings/company`. The route is protected by `CompanyRequiredRoute`, which checks `currentUser?.company`. If not set, the user is redirected to `/not-found`. — `denowatts-portal/src/router.tsx:354-358`
2. `CompanyPage` renders. It fires the `GET_COMPANY` query with `variables: { id: currentUser?.company }` and the `GET_USERS` query to list all users in the company. — `denowatts-portal/src/pages/dashboard/settings/company-management/CompanyPage.tsx:38-60`
3. The backend's `company` resolver checks the user's role. Non-SuperAdmins are scoped to their own company; SuperAdmins can view any company. — `denowatts-backend/src/company/resolvers/company.resolver.ts`
4. The page renders two sections: a form with editable company fields (name, email, etc.) and a table of users in the company with their roles, email, status, and last login. — `denowatts-portal/src/pages/dashboard/settings/company-management/CompanyPage.tsx:64-350`

### Updating settings (example: Company update)

1. The user edits a field in the Company form and clicks Save. The component fires the `UPDATE_COMPANY` mutation with the updated fields. — `denowatts-portal/src/pages/dashboard/settings/company-management/CompanyPage.tsx:64-83`
2. The backend's `updateCompany` resolver is decorated `@AllRoles()` but is guarded in the service layer. Non-SuperAdmins can only update certain fields (e.g., managers, tags); SuperAdmins can update all fields. — `denowatts-backend/src/company/resolvers/company.resolver.ts`, `denowatts-backend/src/company/services/company.service.ts`
3. After mutation, the component triggers `refetchQueries: [GET_COMPANY, ...]` to refresh the UI with the updated data. — `denowatts-portal/src/pages/dashboard/settings/company-management/CompanyPage.tsx:43-45`

### SuperAdmin-only pages (example: Users Management)

1. The user navigates to `/settings/users-management`. The route is protected by `ProtectedRoute`, which checks `currentUser?.type === UserType.SuperAdmin`. Non-SuperAdmins are redirected to `/not-found`. — `denowatts-portal/src/router.tsx:437-445`
2. `UsersManagementPage` fires a `GET_USERS` query (often with a company filter or global scope for SuperAdmins). — `denowatts-portal/src/pages/dashboard/settings/users-management/UsersManagementPage.tsx`
3. The page renders a table of users with columns: Name, Email, Role, Company, Status, Last Login. SuperAdmins can edit user roles, deactivate users, resend invites, and manage permissions. — `denowatts-portal/src/pages/dashboard/settings/users-management/UsersManagementPage.tsx`
4. Mutations (e.g., `UPDATE_USER`, `DEACTIVATE_USER`) are guarded by `@Roles(SUPER_ADMIN)` on the backend. — `denowatts-backend/src/users/resolvers/users.resolver.ts`

---

## Data it touches {dev}

### Company settings
- **`Company` collection** — name, email, contact info, subscription, billing address — `denowatts-backend/src/company/schemas/company.schema.ts`
- **`User` collection** — roles, company assignment, status, permissions — `denowatts-backend/src/users/schemas/user.schema.ts`

### Service & Quotation management
- **`Service` / `ServiceContract` collection** — service types, pricing, terms, linked to sites — (future doc)
- **`Quote` / `Quotation` collection** — quotation templates, history, linked to sites — (future doc: quotation-management.md)

### Notification & Alarm settings
- **`AlarmRule` / `NotificationRule` collection** — alert thresholds, email/SMS recipients, linked to sites — (future doc: notification-management.md)
- **`SystemSetting` collection** — global alarm thresholds, email templates — `denowatts-backend/src/settings/schemas/setting.schema.ts`

### Admin/SuperAdmin pages

- **`User` collection** — detailed user records, roles, permissions, company assignments — `denowatts-backend/src/users/schemas/user.schema.ts`
- **`Asset` collection** — inventory of modems, gateways, Denos, linked to sites via channels — `denowatts-backend/src/assets/schemas/asset.schema.ts`
- **`ModbusTemplate` collection** — Modbus register definitions for device drivers — (future doc)
- **`Module` collection** — PV module specs (power rating, efficiency, temperature coefficient, etc.) — (future doc)
- **`Inverter` collection** — inverter device specs (power rating, input voltage, model, etc.) — (future doc)
- **`ActivityLog` collection** — audit trail of all mutations (user, timestamp, action, entity, changes) — `denowatts-backend/src/activity-log/schemas/activity-log.schema.ts`
- **`LattigoDevice` (via Lattigo API)** — cell modem state, data usage, plan details; indexed by `Asset.simIccid` — `denowatts-backend/src/lattigo/lattigo.service.ts`

---

## Cross-cutting patterns {dev}

### Menu structure and selection

The settings menu is defined as a single memoized array in the Header component. The array is split into:
1. **Base items** (always visible): Company (1), Services (2), Quotation Management (3), Metrics (4), Device Types (5), Notification Management (6), Global Alarm Config (12)
2. **Divider** (separator)
3. **SuperAdmin-only items** (7–11, 13–19): Company Management, Users Management, Template Management, Module Management, Inverter Management, Asset Management, Remote Management, Metrics Management, Cell Modem Management, System Notification, Site Launch, Activity Logs

The `settingsSelectedKeys` function maps the current pathname to a key, ensuring the correct item is highlighted as the user navigates. — `denowatts-portal/src/common/components/Header.tsx:398-422`

### Role-based access patterns

Settings pages use a consistent pattern:
1. **Frontend route guard** — `CompanyRequiredRoute` or `ProtectedRoute` wraps the route. — `denowatts-portal/src/router.tsx:350-547`
2. **Backend resolver guard** — `@Roles(SUPER_ADMIN)` or `@AllRoles()` decorator. — `denowatts-backend/src/*/resolvers/*.ts`
3. **Service-layer filtering** — Even if a resolver allows all roles, the service may filter results by company or user. — `denowatts-backend/src/*/services/*.service.ts`

Example: Users Management is gated at all three levels:
- **Frontend**: `<ProtectedRoute>` block prevents non-SuperAdmins from reaching the page.
- **Backend resolver**: `@Roles(SUPER_ADMIN)` decorator rejects non-SuperAdmin requests.
- **Service**: `getUsers()` would never reach this level for non-SuperAdmins due to the resolver guard. — `denowatts-portal/src/router.tsx:437-445`, `denowatts-backend/src/users/resolvers/users.resolver.ts`

### Form and table patterns

Settings pages typically follow this layout:
- **Header with title and optional filter/search controls**
- **Form section** (for editable settings) with Save button
- **Table section** (for list views) with columns, pagination, and action buttons (Edit, Delete, Deactivate)
- **Modals or drawers** for detail views and bulk actions

Example: CompanyPage has a form at the top (company name, email, etc.) and a table below (users in the company, with role and status columns). — `denowatts-portal/src/pages/dashboard/settings/company-management/CompanyPage.tsx`

---

## Edge cases & gotchas {dev}

- **Settings menu is split by role but not by company.** A SuperAdmin sees all menu items regardless of which company is selected in the global filter. The individual pages are still company-scoped via `CompanyRequiredRoute`. — `denowatts-portal/src/common/components/Header.tsx:518-528`
- **Non-SuperAdmin users without a company see a filtered menu.** If `currentUser?.company` is null and `currentUser?.type !== SuperAdmin`, the menu returns only items 3, 4, and 5 (Quotation, Metrics, Device Types). Navigating to other settings pages is blocked by `CompanyRequiredRoute`. — `denowatts-portal/src/common/components/Header.tsx:518-526`, `denowatts-portal/src/views/ProtectedRoute/CompanyRequiredRoute.tsx`
- **Metrics and Device Types are global pages, not company-scoped.** Unlike other settings pages, `/metrics` and `/device-types` are accessible to all authenticated users and are not wrapped in `CompanyRequiredRoute`. — `denowatts-portal/src/router.tsx:465-490`
- **Direct URL access bypasses the menu.** A user can navigate directly to `/settings/users-management` without opening the settings dropdown. Frontend `ProtectedRoute` will catch non-SuperAdmins, but the menu won't reflect the current page until the URL maps back to a menu key. — `denowatts-portal/src/common/components/Header.tsx:398-422`
- **Settings pages do not auto-redirect after mutations.** If a user deletes a user or deactivates a company, the page remains open. You need to manually refresh or close/reopen the page to see the update. Some pages use `refetchQueries` to auto-update the table. — `denowatts-portal/src/pages/dashboard/settings/users-management/UsersManagementPage.tsx`
- **Company scoping happens server-side in individual resolvers.** Each settings page resolver is responsible for checking if the user has permission to view/edit that company's data. SuperAdmins bypass all checks; non-SuperAdmins are scoped to their own company. — `denowatts-backend/src/company/services/company.service.ts`, `denowatts-backend/src/users/services/users.service.ts`
- **The settings module in the backend is minimal.** The main `settings.module.ts` only exports a single `currentGatewayFirmware` query for firmware version info. The actual settings pages use domain-specific modules (users, company, assets, etc.), not the settings module. — `denowatts-backend/src/settings/settings.resolver.ts`

---

## Related flows

- [[authentication]] — role definitions and user type checks that gate settings access
- [[company-management]] — (future doc) details on managing multiple companies
- [[users-management]] — (future doc) user creation, role assignment, permissions
- [[asset-management]] — (future doc) physical asset inventory
- [[notification-management]] — (future doc) alert rules and thresholds
- [[quotation-management]] — (future doc) quote templates and renewals
- [[activity-logs]] — (future doc) audit trail and user action logging
