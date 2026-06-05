# Settings — Coverage Tracker

Coverage status for the Settings feature documentation (`/settings/*` routes).

## Frontend routes & files

All under `denowatts-portal/src/pages/dashboard/settings/`:

| Route | Component | Entry | Entry file | Status |
|-------|-----------|-------|-----------|--------|
| `/settings/company` | CompanyPage | Profile/company info | company-management/CompanyPage.tsx | [x] |
| `/settings/company-management` | CompanyManagementPage | Manage multiple companies | company-management/CompanyManagementPage.tsx | [x] |
| `/settings/service-management` | ServiceManagementPage | Service contracts | service-management/ServiceManagementPage.tsx | [x] |
| `/settings/quote-management` | QuoteManagementPage | Quote templates | quote-management/QuoteManagementPage.tsx | [x] |
| `/settings/quote-management/renew` | RenewPage | Site renewal quotes | quote-management/renew/RenewPage.tsx | [x] |
| `/settings/quote-management/:id` | QuotePage | Edit quote | quote-management/quote/QuotePage.tsx | [x] |
| `/settings/api-management` | APIManagementPage | API keys (SuperAdmin) | api-management/APIManagementPage.tsx | [x] |
| `/settings/users-management` | UsersManagementPage | User permissions (SuperAdmin) | users-management/UsersManagementPage.tsx | [x] |
| `/settings/template-management` | ModbusTemplatePage | Modbus templates (SuperAdmin) | modbus-template/ModbusTemplatePage.tsx | [x] |
| `/settings/global-alarm-configuration` | GlobalAlarmPage | Alarm settings | global-alarm/GlobalAlarmPage.tsx | [x] |
| `/settings/asset-management` | AssetManagementPage | Asset inventory (SuperAdmin) | asset-management/AssetManagementPage.tsx | [x] |
| `/settings/remote-management` | RemoteManagementPage | Remote access (SuperAdmin) | remote-management/RemoteManagementPage.tsx | [x] |
| `/settings/system-notification` | SystemNotificationPage | Email/SMS (SuperAdmin) | system-notification/SystemNotificationPage.tsx | [x] |
| `/settings/inverter-management` | InverterManagementPage | Inverter config (SuperAdmin) | inverter-management/InverterManagementPage.tsx | [x] |
| `/settings/notification-management` | NotificationManagementPage | Alerts & rules | notification-management/NotificationManagementPage.tsx | [x] |
| `/settings/module-management` | ModuleManagementPage | Module types (SuperAdmin) | module-management/ModuleManagementPage.tsx | [x] |
| `/settings/activity-logs` | ActivityLogsPage | Audit log (SuperAdmin) | activity-logs/ActivityLogsPage.tsx | [x] |
| `/settings/cell-modem-management` | CellModemManagementPage | Lattigo SIM mgmt (SuperAdmin) | cell-modem-management/CellModemManagementPage.tsx | [x] |
| `/settings/metrics-management` | MetricsManagementPage | Custom metrics (SuperAdmin) | metrics-management/MetricsManagementPage.tsx | [x] |

## Backend files

`denowatts-backend/src/`:

- `settings/` module:
  - `settings.module.ts` — [ ]
  - `settings.resolver.ts` — [ ]
  - `settings.service.ts` — [ ]
  - `dto/` — [ ]
  - `schemas/` — [ ]

- Shared resolvers/services used by settings pages:
  - `users/` — user mgmt (UsersManagementPage)
  - `assets/` — asset mgmt (AssetManagementPage)
  - `company/` — company info (CompanyPage, CompanyManagementPage)
  - `api-keys/` — API mgmt (APIManagementPage)
  - `notifications/` — alert rules (NotificationManagementPage)
  - `lattigo/` — SIM mgmt (CellModemManagementPage)

## Coverage checklist

- [ ] Route guards (frontend / backend)
- [ ] Entry point component (renders the page structure)
- [ ] Core mutations (create, update, delete for main entity)
- [ ] Core queries (list, detail, filters)
- [ ] Business rules per page
- [ ] Data touched (which collections/fields)
- [ ] SuperAdmin-only access patterns
- [ ] Edge cases & error handling

## Notes

- **Scope decision**: Since Settings has 18 sub-pages from different domains (users, assets, API keys, etc.), document will focus on:
  1. The settings menu structure and routing architecture
  2. The company/profile settings (primary user-facing entry point)
  3. Key admin-only pages (users, API keys, activity logs)
  4. Cross-cutting patterns (role guards, form patterns)
  5. Don't deep-dive each sub-page's business logic — link to future per-domain docs
