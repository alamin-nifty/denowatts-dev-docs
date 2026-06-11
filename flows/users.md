---
title: Users
owner: alamin-nifty
status: draft
version: 2
updated_at: 2026-06-10
---

# Users

Every person who signs into Denowatts is a **user account** — the identity record everything else hangs off. An account has a role (which decides what it may do), a status (whether it's usable yet), and usually a company (which decides what it may see). This module is the master record of those accounts; signing up, logging in, and password resets are handled by the authentication flow and documented separately.

> **Reading this doc:** use the **Business / Developer** switch at the top. *Business* explains the account types, account states, and who may manage whom. *Developer* adds the full GraphQL surface, the field-by-field authorization logic, schema and DTO shapes, file references, and a terminology primer.

## Why this matters

Permissions across the entire platform start here. Whether a person can see a site, change a setting, or appear in a notification list comes down to three things on their account: role, status, and company. The logic in this module is also the canonical multi-tenancy enforcement — it's what keeps one customer's staff from reading or editing another customer's people.

## The four account types

- **User** — a standard end-user; effectively read-only in the portal. Can manage only their own profile.
- **Admin** — a company administrator. Manages users inside their own company (including their role), but cannot move anyone between companies, change anyone's email, or change account status.
- **SuperAdmin** — platform staff. Sees and manages every account across all companies, with no restrictions; the only role that can create users directly.
- **system** — a reserved type for non-human/service accounts. Currently just a marker with no special behavior.

## Account states

- **Pending** — the state every new account starts in: signed up but email not yet confirmed. Cannot log in.
- **Active** — email confirmed; the account is fully usable.
- **Deleted** — soft-removed. The record is kept, but the account can no longer log in and is hidden from people-pickers.

## Who can do what

- **SuperAdmins** manage all accounts from Settings → Users Management: change roles, statuses, and company assignments across the platform.
- **Admins** can edit users in their own company, but never anyone's email, company, or status.
- **Everyone** can edit their own profile — name, phone, theme — but not their own email, role, or company.
- **New accounts** normally arrive via self-signup followed by email confirmation; creating an account directly is SuperAdmin-only.

## The rules that matter

- **One account per email.** The email address is the unique login identity (stored lowercase).
- **Company scoping is absolute** for non-SuperAdmins: every list, lookup, and edit is confined to the caller's own company.
- **Removal is a soft delete** — the record stays, but the account is blocked and hidden.
- **Email confirmation is what activates an account** (and attaches its company); it is the one path allowed to flip a Pending account to Active.
- **Cross-company probing is blocked quietly**: an edit aimed at a user in another company fails as "not authorized" rather than revealing whether that user exists.
- **Password changes go through the authentication flows** (change/reset password), never through ordinary profile edits.

## Where user accounts show up

Beyond login, two helper lookups feed other features: **manager pickers** (choosing site managers/owners) draw from the owning company *plus* every company granted access to its sites, and **@mention autocomplete** in events and notifications lists the active users in your company.

## Entry points {dev}
- Admin UI — Settings gear -> **Users Management** (SuperAdmin-only), route `/settings/users-management` — `denowatts-portal/src/pages/dashboard/settings/users-management/UsersManagementPage.tsx`. Menu link and search box: `denowatts-portal/src/common/components/Header.tsx:552`, search component `denowatts-portal/src/pages/dashboard/settings/users-management/components/UsersManagementSettings.tsx`.
- Every other page indirectly: the logged-in `User` is resolved from the JWT and injected into resolvers via `@CurrentUser()` — `denowatts-backend/src/common/decorators/current-user.decorator.ts`.

> Note: there is a `CreateUserModal.tsx` in the same folder, but it is a non-wired stub (its title says "Create Event" and it renders a single "Title" field). It is **not** used by the Users Management page — `denowatts-portal/src/pages/dashboard/settings/users-management/components/CreateUserModal.tsx`. New users are created only through self-signup (auth) or the `createUser` GraphQL mutation.

## User roles & types {dev}

`UserType` enum — `denowatts-backend/src/users/schemas/user.schema.ts:6-11`:

| Value | Meaning / what it grants |
|---|---|
| `SUPER_ADMIN` | Platform super-user. Bypasses all role checks and all company scoping. `RolesGuard` short-circuits to `true` for SUPER_ADMIN (`denowatts-backend/src/common/guards/roles.guard.ts:34`). In `UsersService`, SUPER_ADMIN is the only type that can query/update across companies and is the only type allowed to call `createUser` and to set forbidden fields (`type`, `company`, `email`, `status`). |
| `ADMIN` | Company administrator. Scoped to their own `company`. Can update other users **within their company** but not the forbidden fields `company`, `status`, `email`; cannot change their own `type`, `company`, or `email` (`denowatts-backend/src/users/users.service.ts:91-104`). |
| `USER` | Standard end-user (read-only in the frontend per portal convention). May update **only their own** record and not the forbidden fields `type`, `company`, `email` (`denowatts-backend/src/users/users.service.ts:106-116`). |
| `SYSTEM` | Reserved type for non-human/service accounts. Declared in the enum but not referenced by any branch in `UsersService`/auth read here; it has no special grant in the role logic. |

`UserStatus` enum — `user.schema.ts:13-17`:

| Value | Meaning |
|---|---|
| `ACTIVE` | Verified, usable account. Default for `findForMentions` results. |
| `PENDING` | Default on creation (`user.schema.ts:89`). Email not yet confirmed. Login is blocked for non-ACTIVE accounts by the auth flow; email confirmation moves `PENDING -> ACTIVE` (`flows/authentication.md`). |
| `DELETED` | Soft-deleted. Filtered out of manager lists (`users.service.ts:167`) and of JWT validation for normal tokens (`auth.service.ts` `validateUser`, `status: { $ne: DELETED }`). The only status a non-SUPER_ADMIN is allowed to set via `updateUser` (`users.service.ts:78-85`). |

`ThemePreference` enum — `user.schema.ts:19-23`: `SYSTEM` | `LIGHT` | `DARK`. Per-user portal theme; defaults to `LIGHT`.

All three enums are registered with GraphQL via `registerEnumType` (`user.schema.ts:25-27`).

## GraphQL API surface {dev}

Resolver: `denowatts-backend/src/users/users.resolver.ts`. Every operation runs behind the **global** `JwtAuthGuard` then `RolesGuard` (registered as `APP_GUARD` in `denowatts-backend/src/app.module.ts:179-185`), so a valid access-token JWT is required unless a handler is marked public. None of the user operations are public. `@CurrentUser()` is the authenticated `User` resolved by `JwtStrategy.validate` -> `AuthService.validateUser` (`denowatts-backend/src/auth/jwt.strategy.ts:53`).

### Mutation `createUser(createUserInput: CreateUserInput!): User`
- Resolver: `users.resolver.ts:19-23`. **Role required: `@Roles(UserType.SUPER_ADMIN)`** (line 19). (ADMIN/USER are rejected by `RolesGuard`; SUPER_ADMIN passes.)
- Input: `CreateUserInput` (see DTOs). Return: full `User` ObjectType (note: `password` is `select:false`, so it is never returned).
- Calls `usersService.create(createUserInput)`.
- **Caveat (verified — not exploitable via GraphQL):** `User.password` has `@Prop` but **no `@Field`** (`user.schema.ts:43-44`), so the mapped `CreateUserInput`/`UpdateUserInput` do **not** expose a `password` field in the GraphQL schema — a client sending one gets a validation error before any resolver runs. The only production caller passing a password is `AuthService.signUp`, which argon2-hashes first. Residual note: `usersService.create` itself never hashes, so a *future internal caller* passing a raw password would store plaintext (the TypeScript type includes `password` even though GraphQL doesn't).

### Query `users(filter: FilterUserInput): [User!]!`  (GraphQL name: `users`)
- Resolver `findAll` — `users.resolver.ts:25-32`. No `@Roles` -> any authenticated user, but results are **company-scoped** in the service for non-SUPER_ADMIN.
- Input: optional `FilterUserInput` (nullable). Return: array of `User`.
- Calls `usersService.find(filter, currentUser)`.

### Query `user(filter: FilterUserInput!): User`  (GraphQL name: `user`, nullable)
- Resolver `findOne` — `users.resolver.ts:34-40`. `filter` is **required** here (unlike `users`). Return nullable `User`.
- Calls `usersService.findOne(filter, currentUser)`.

### Mutation `updateUser(updateUserInput: UpdateUserInput!): User`
- Resolver — `users.resolver.ts:42-46`. No `@Roles`; authorization is enforced field-by-field inside `usersService.update`.
- Splits `_id` out of the input and calls `usersService.update(_id, input, currentUser)`.
- Input: `UpdateUserInput` (must include `_id`). Return: updated `User`.

### Query `profile: User!`  (GraphQL name: `profile`)
- Resolver `getProfile` — `users.resolver.ts:48-51`. Returns the caller's own record via `usersService.getUserById(currentUser._id)`. No filtering/scoping — it is keyed on the authenticated `_id`.

### Query `getManagers(input: ManagersInput!): [ManagersResponse!]!`  (GraphQL name: `getManagers`)
- Resolver — `users.resolver.ts:53-60`. Calls `usersService.findManagers(input, currentUser)`.
- Input: `ManagersInput` (`siteOwnerAndAccesses?: [ID]`, `company?: ID`). Return: `ManagersResponse` = `{ _id, firstName, lastName, company }` (`dto/user.input.ts:49-50`).
- Used to populate "manager"/owner pickers that must include users from the owning company **and** all companies that have site-access to it.

### Query `getUsersForMentions: [UserMentionResponse!]!`  (GraphQL name: `getUsersForMentions`)
- Resolver — `users.resolver.ts:62-65`. Calls `usersService.findForMentions(currentUser)`.
- No input. Return: `UserMentionResponse` = `{ _id, firstName, lastName }` (`dto/user.input.ts:52-53`).
- Returns only `ACTIVE` users, scoped to the caller's company (unless SUPER_ADMIN). Powers @mention autocomplete in events/notifications.

## Services {dev}

### UsersService — `denowatts-backend/src/users/users.service.ts`

Dependencies (`users.service.ts:19-23`): `userModel` (Mongoose `Model<UserDocument>`) and `SitesService` (injected with `forwardRef` to break the Users<->Sites circular dependency; module wiring at `users.module.ts:15`).

#### `create(createUserInput: CreateUserInput): Promise<UserDocument>` — `users.service.ts:25-27`
- Single step: `this.userModel.create(createUserInput)`.
- DB write: inserts one document into the `users` collection. Mongoose applies schema defaults (`status: PENDING`, `themePreference: LIGHT`, `verificationAttempts: 0`) and the `unique` index on `email`.
- **No password hashing here.** Callers that accept a raw password (auth signup) hash with `argon2` *before* calling this (`auth.service.ts:67-76`).
- Throws: Mongo `E11000` duplicate-key error if `email` already exists (lowercased); validation errors if required fields (`email`, `firstName`, `type`) are missing.

#### `find(filter, user, internal = false): Query<UserDocument[]>` — `users.service.ts:29-56`
- Builds `query = { ...filter }`.
- **Multi-tenancy scoping:** if `!internal` and `user.type !== SUPER_ADMIN`, forces `query.company = user.company`. If that user has no `company`, throws `BadRequestException('Company is required in filter query')` (`users.service.ts:31-36`).
- **Regex name search (for mentions):** if `filter.firstName` is a string, replaces it with `query.$or = [{ firstName: /.../i }, { lastName: /.../i }]` (case-insensitive) and deletes the plain `firstName`/`lastName` keys; same fallback for `filter.lastName` (`users.service.ts:39-53`). So a single typed term matches either first or last name.
- DB read: `userModel.find(query)`. Returns a Mongoose query (resolved by GraphQL). `password` is excluded by the schema (`select:false`).
- The `internal` flag lets backend callers bypass company scoping; it is not reachable from GraphQL (the resolver never passes it).

#### `findOne(filter, user?, select?): Query<UserDocument>` — `users.service.ts:58-66`
- `query = { ...filter }`; if a `user` is passed and is not SUPER_ADMIN, forces `query.company = user.company` (note: does **not** throw if company is undefined here, unlike `find`).
- DB read: `userModel.findOne(query, select)`. `select` lets auth opt password back in (e.g. login fetches `+password`).
- Heavily reused by the auth module to look users up by email/_id/status (`auth.service.ts` lines 62, 97, 182, 294, 313, 320, 332, 358).

#### `update(id, updateUserInput, requestedUser, isConfirmEmail = false): Promise<UserDocument>` — `users.service.ts:68-124`
Authorization is the core of this method. Two forbidden-field sets are defined (`users.service.ts:74-75`):
- `ownProfileUpdateForbiddenTypes = ['type', 'company', 'email']`
- `otherProfileUpdateForbiddenTypes = ['company', 'status', 'email']`

Logic, in order:
1. **Status guard (all non-SUPER_ADMIN):** if `requestedUser.type !== SUPER_ADMIN`, not `isConfirmEmail`, and `updateUserInput.status` is set to anything other than `DELETED`, throw `ForbiddenException(USER_NOT_AUTHORIZED)` (`users.service.ts:78-85`). So a normal admin can soft-delete but cannot flip a user to `ACTIVE`/`PENDING`.
2. Start `query = { _id: id }`.
3. **ADMIN branch** (`users.service.ts:91-104`):
   - If editing **own** record (`requestedUser._id.equals(id)`) and the input touches any of `ownProfileUpdateForbiddenTypes` -> Forbidden.
   - Always add `query.company = requestedUser.company` (can only ever update someone in their own company).
   - If the input touches any of `otherProfileUpdateForbiddenTypes` -> Forbidden. (Combined with the status guard, an ADMIN updating another user cannot change `company`/`status`/`email` at all; the status guard already allowed only `DELETED`, but `otherProfileUpdateForbiddenTypes` blocks `status` entirely for ADMIN.)
4. **USER branch** (`users.service.ts:106-116`):
   - If editing **someone else** (`!requestedUser._id.equals(id)`) -> Forbidden.
   - If editing own record and input touches `ownProfileUpdateForbiddenTypes` (and not `isConfirmEmail`) -> Forbidden.
5. SUPER_ADMIN: no extra guards; `query` stays `{ _id: id }`.
6. DB write: `userModel.findOneAndUpdate(query, updateUserInput, { new: true, runValidators: true })` (`users.service.ts:118-121`). `new:true` returns the post-update doc; `runValidators:true` re-runs schema validators on the changed fields.
7. If no doc matched (wrong id, or company scope excluded it) -> `ForbiddenException(USER_NOT_AUTHORIZED)` (`users.service.ts:122`). Note this surfaces "not found" as "not authorized" — intentional to avoid leaking existence across tenants.
- `isConfirmEmail = true` is passed only by `AuthService.confirmEmail` so the email-confirmation flow can set `company` + `status = ACTIVE` on a PENDING user even though those are otherwise forbidden (`auth.service.ts:371-377`).

#### `updatePassword(id, password): Promise<UserDocument>` — `users.service.ts:126-136`
- Hashes with **argon2**: `hashedPassword = await argon2.hash(password)` (`users.service.ts:127`). This is the only place in this module that hashes a password.
- DB write: `userModel.findByIdAndUpdate(id, { $set: { password: hashedPassword } }, { new: true })`.
- Throws `NotFoundException('User not found')` if no user matches (`users.service.ts:134`).
- Callers: `AuthService.changePassword`, `AuthService.resetPassword`, and the login "rehash MD5 -> argon2" upgrade path (`auth.service.ts:258`, 392). See `flows/authentication.md`.

#### `getUserById(id): Query<UserDocument>` — `users.service.ts:138-140`
- `userModel.findById(id)`. Backs the `profile` query. No scoping (keyed on the caller's own `_id`).

#### `findManagers(filter, currentUser): Query<...>` — `users.service.ts:142-169`
- `query = { ...filter }` where `filter` may carry `company` and `siteOwnerAndAccesses`.
- **Site-access expansion:** if `query.company` is provided, replace it with `{ $in: await sitesService.getSitesAccessCompanies(query.company) }`. Otherwise, if the caller is not SUPER_ADMIN, do the same expansion on `currentUser.company` (throwing `BadRequestException('Company is required')` if absent) (`users.service.ts:147-158`).
  - `getSitesAccessCompanies(company)` returns the company itself plus every company listed in that company's sites' `accesses[].company` (`denowatts-backend/src/sites/services/sites.service.ts:787-802`). This is how managers from companies granted site-access show up.
- **Explicit override:** if `siteOwnerAndAccesses` is a non-empty array, it overrides `query.company` with `{ $in: siteOwnerAndAccesses }` (`users.service.ts:160-164`).
- Removes the non-schema `siteOwnerAndAccesses` key, then forces `query.status = { $ne: DELETED }` (`users.service.ts:166-167`).
- DB read: `userModel.find(query).select('_id firstName lastName company')`.

#### `findForMentions(currentUser): Query<...>` — `users.service.ts:171-182`
- `query = { status: ACTIVE }`. If caller is not SUPER_ADMIN, force `query.company = currentUser.company` (throwing `BadRequestException('Company is required')` if absent).
- DB read: `userModel.find(query).select('_id firstName lastName').lean()` (`.lean()` -> plain objects, faster for read-only autocomplete).

## Schemas {dev}

### User — `denowatts-backend/src/users/schemas/user.schema.ts`
Dual-purpose class: `@ObjectType()` (GraphQL) + `@Schema({ timestamps: true, strict: true })` (Mongoose). `timestamps:true` auto-manages `createdAt`/`updatedAt`. Collection: `users`.

| Field | Type | Required | Indexed | Exposed in GraphQL | Purpose |
|---|---|---|---|---|---|
| `_id` | `ObjectId` (GraphQL `ID`) | auto | yes (primary) | yes | Unique user id. |
| `email` | `String` | **yes** | **unique** | yes | Login identity. Stored `lowercase`. `@IsEmail` (`user.schema.ts:38-41`). |
| `password` | `String` | no | no | **no** (`select:false`) | Argon2 hash (or legacy MD5 pre-upgrade). Never returned by GraphQL or default reads; must be opted in via `select` (`user.schema.ts:43-44`). |
| `firstName` | `String` | **yes** | text index | yes | Given name. `@IsString` (`user.schema.ts:46-49`). |
| `lastName` | `String` | no (Prop has no `required`) | text index | yes (non-null Field) | Family name. **Mismatch:** GraphQL `@Field` is non-nullable but the Mongo `@Prop` is not `required`, so a doc without `lastName` would fail GraphQL serialization for this field (`user.schema.ts:51-54`). |
| `company` | `ObjectId` -> `Company` | no | no | yes (nullable `ID`) | The single company a user belongs to — the tenancy key. `ref: "Company"` (`user.schema.ts:56-62`). |
| `type` | `UserType` enum | **yes** | no | yes | Role (`SUPER_ADMIN`/`ADMIN`/`USER`/`SYSTEM`). `@IsEnum` (`user.schema.ts:64-67`). |
| `phone` | `String` | no | no | yes (nullable) | Contact number. `@MaxLength(20)` (`user.schema.ts:69-74`). |
| `lastLoginAt` | `Date` | no | no | yes (nullable) | Set by auth on successful login (`auth.service.ts`). |
| `lastActiveAt` | `Date` | no | no | yes (nullable) | Set by auth on token refresh / activity. |
| `acceptedTermsOfUseAt` | `Date` | no | no | yes (nullable) | When the user accepted ToU. |
| `status` | `UserStatus` enum | no (default `PENDING`) | no | yes | Account lifecycle. `default: PENDING` (`user.schema.ts:88-91`). |
| `verificationAttempts` | `Number` | no (default `0`) | no | **no** | Internal counter for email-verification resends (rate limiting in auth) (`user.schema.ts:93-94`). |
| `lastVerificationSent` | `Date` | no | no | **no** | Timestamp of last verification email; used for resend throttling (`user.schema.ts:96-97`). |
| `themePreference` | `ThemePreference` enum | no (default `LIGHT`) | no | yes (nullable) | Portal theme. Self-updatable (not in any forbidden set) (`user.schema.ts:99-104`). |
| `createdAt` | `Date` | auto | no | yes (non-null) | Set by `timestamps` (`user.schema.ts:106-107`). |
| `updatedAt` | `Date` | auto | no | **no** (no `@Field`) | Set by `timestamps`; not exposed (`user.schema.ts:108`). |

Indexes:
- `email` unique index (from `@Prop({ unique: true })`).
- Compound **text index** on `firstName` + `lastName`: `UserSchema.index({ firstName: 'text', lastName: 'text' })` (`user.schema.ts:115`). Note the regex name search in `find()` does **not** use this text index (it uses `$regex`); the text index is available but unused by the documented queries here.

Exported types: `UserDocument = HydratedDocument<User>`, `UserSchema`, `UserReference = Types.ObjectId | User` (`user.schema.ts:111-113`).

## DTOs — `denowatts-backend/src/users/dto/user.input.ts` {dev}

All four input/response types are derived from the `User` schema class via GraphQL mapped types (`PickType`/`OmitType`/`PartialType`), so field-level validators (`@IsEmail`, `@IsString`, `@IsEnum`, `@MaxLength(20)`, etc.) are inherited from `user.schema.ts`.

### CreateUserInput — `dto/user.input.ts:12-17`
`OmitType(User, ['_id','status','lastActiveAt','lastLoginAt','themePreference','createdAt','updatedAt'])`.

| Field | Type | Validation (inherited) | Purpose |
|---|---|---|---|
| `email` | String | `@IsEmail`, required, unique, lowercased | New user's login email. |
| `password` | String | none on schema | Plaintext at the DTO level. Hashed by the caller (auth) before `create`; **not** hashed by `createUser` mutation. |
| `firstName` | String | `@IsString`, required | Given name. |
| `lastName` | String | `@IsString` | Family name. |
| `company` | ID (ObjectId) | `@IsMongoId` (optional) | Company assignment. |
| `type` | UserType | `@IsEnum(UserType)`, required | Role to assign. |
| `phone` | String | `@IsOptional @MaxLength(20)` | Contact number. |
| `acceptedTermsOfUseAt` | Date | none | ToU acceptance. |
| `lastVerificationSent` | Date | none | (Included because it is not omitted, though normally set by auth.) |
| `verificationAttempts` | Number | none | (Same — present on the type.) |

(Omitted: `_id`, `status`, `lastActiveAt`, `lastLoginAt`, `themePreference`, `createdAt`, `updatedAt` — these are server-managed.)

### UpdateUserInput — `dto/user.input.ts:19-29`
`PartialType(OmitType(User, ['_id','lastActiveAt','lastLoginAt']))` **plus a re-added required `_id`**.

- Every `User` field except `lastActiveAt`/`lastLoginAt` is optional here.
- `_id: ID` is re-declared as **`nullable: false`** (`dto/user.input.ts:24-28`) — it is the required key identifying which user to update; the resolver strips it before passing the rest to the service.
- Because it derives from `User`, `password` is a settable field on this input. There is **no hashing** in `update()`, so passing `password` via `updateUser` would store it unhashed — password changes must go through auth's `changePassword`/`resetPassword` (which call `updatePassword`). See Edge cases.
- Field-level authorization (which fields each role may change) is enforced in `UsersService.update`, not in the DTO.

### FilterUserInput — `dto/user.input.ts:6-10`
`PartialType(PickType(User, ['_id','email','company','type','status','firstName','lastName']))`. All optional. Used by `users` and `user` queries. `firstName`/`lastName` here trigger the regex name search in `find()`.

| Field | Type | Purpose |
|---|---|---|
| `_id` | ID | Match a specific user. |
| `email` | String | Exact (lowercased) email match. |
| `company` | ID | Filter by company (ignored/overridden by tenancy scoping for non-SUPER_ADMIN). |
| `type` | UserType | Filter by role. |
| `status` | UserStatus | Filter by status. |
| `firstName` | String | Triggers case-insensitive `$or` regex over firstName/lastName. |
| `lastName` | String | Same regex behavior if firstName absent. |

### ManagersInput — `dto/user.input.ts:31-47`
| Field | Type | Validation | Purpose |
|---|---|---|---|
| `siteOwnerAndAccesses` | `[ID]` (ObjectId[]) | `@IsOptional` | Explicit list of company ids to draw managers from (overrides company expansion). |
| `company` | ID | `@IsOptional @IsMongoId` | Company whose site-access companies are expanded into the manager pool. |

### Response object types
- **ManagersResponse** — `PickType(User, ['_id','firstName','lastName','company'])` (`dto/user.input.ts:49-50`). Returned by `getManagers`.
- **UserMentionResponse** — `PickType(User, ['_id','firstName','lastName'])` (`dto/user.input.ts:52-53`). Returned by `getUsersForMentions`.

## Business rules (cited) {dev}
- Only `SUPER_ADMIN` can call `createUser` — `@Roles(UserType.SUPER_ADMIN)` on the resolver, enforced by `RolesGuard` — `users.resolver.ts:19`, `common/guards/roles.guard.ts:34-40`.
- All non-SUPER_ADMIN reads (`users`, and `findManagers`/`findForMentions`) are forced to the caller's own `company`; a non-SUPER_ADMIN with no company is rejected with `BadRequestException` on `find`/`findManagers`/`findForMentions` — `users.service.ts:31-36, 151-157, 174-179`.
- A non-SUPER_ADMIN can set `status` only to `DELETED` (soft delete); any other status value is `Forbidden` — `users.service.ts:78-85`.
- `ADMIN` can update users only within their own company and cannot change `company`/`status`/`email` on others, nor `type`/`company`/`email` on themselves — `users.service.ts:91-104`.
- `USER` can update only their own record and not `type`/`company`/`email` — `users.service.ts:106-116`.
- A failed update match (wrong id or out-of-tenant) returns `Forbidden`, not `NotFound`, to avoid cross-tenant existence leaks — `users.service.ts:122`.
- Email-confirmation is the one path allowed to set `company` + `status=ACTIVE` on a PENDING user, via `isConfirmEmail=true` — `auth.service.ts:371-377`, `users.service.ts:78-116`.
- Passwords are hashed with **argon2** only in `updatePassword`; `create`/`update` do not hash — `users.service.ts:127`. (Auth hashes before calling `create` — `auth.service.ts:67-76`.)
- `email` is globally unique and lowercased; duplicate creates fail at the DB index — `user.schema.ts:38-41`.
- Frontend gate: the Users Management route is wrapped in `ProtectedRoute` which redirects non-SuperAdmin to `/not-found` — `denowatts-portal/src/views/ProtectedRoute/ProtectedRoute.tsx`, `denowatts-portal/src/router.tsx:437-446`. (Backend still enforces scoping independently.)

## Data touched {dev}
- `users` (collection) — created by `create`; updated by `update`/`updatePassword`; read by `find`/`findOne`/`getUserById`/`findManagers`/`findForMentions`.
- `users.email` — unique, lowercased login key; written on create, read on every auth lookup.
- `users.password` — argon2 hash, `select:false`; written only via `updatePassword` (or hashed input to `create` from auth).
- `users.company` — ObjectId ref to `companies`; the tenancy scope applied to nearly every query for non-SUPER_ADMIN.
- `users.type` / `users.status` — role and lifecycle gates used across the service.
- `users.lastLoginAt` / `users.lastActiveAt` — written by the auth module, not by this module's own writes.
- `users.verificationAttempts` / `users.lastVerificationSent` — internal email-verification throttling fields (auth-managed; hidden from GraphQL).
- `sites` (read via `SitesService.getSitesAccessCompanies`) — `accesses[].company` is read to expand the manager company pool in `findManagers` — `sites/services/sites.service.ts:787-802`.

## Edge cases & gotchas {dev}
- **`createUser` and `updateUser` do not hash `password`.** Both accept a `password` field (inherited from the schema) and write it verbatim. Only `updatePassword` (called by auth) hashes. Any new caller setting a password through these GraphQL ops would store plaintext — always route password changes through the auth flows. `users.service.ts:25-27, 118-121` vs `:126-136`.
- **`lastName` nullability mismatch:** GraphQL field is non-nullable but the Mongo prop is not `required`. A user document missing `lastName` will cause a GraphQL non-null serialization error when read. The frontend defensively does `${firstName} ${lastName || ''}` — `UsersManagementPage.tsx:505`. `user.schema.ts:51-54`.
- **`findOne` does not throw when a non-SUPER_ADMIN has no company** (unlike `find`); it silently scopes on `company: undefined`, which can match documents whose `company` is unset. `users.service.ts:58-66`.
- **Regex name search is unanchored and uses `$regex`** with the raw user string — no escaping. Special regex characters in the search term are interpreted (potential ReDoS / unexpected matches). Also it ignores the existing text index. `users.service.ts:39-53`.
- **Frontend role/status editing is optimistic and unscoped client-side.** The Users Management table renders editable Role/Status/Company dropdowns and fires `updateUser` immediately on change (`UsersManagementPage.tsx:85-104, 422-462`). Status options exclude `PENDING` (`:449-451`). Because the page is SuperAdmin-only, the backend forbidden-field guards rarely fire here, but they remain the real enforcement.
- **`CreateUserModal.tsx` is a dead stub** (titled "Create Event", single unrelated field) and is not imported by the Users Management page. No working "create user" UI exists; creation is via signup or the GraphQL mutation. `.../users-management/components/CreateUserModal.tsx`.
- **`SYSTEM` user type** has no behavior branch in this module — treat it as a marker type only.
- **`internal` flag on `find`** bypasses tenancy scoping but is unreachable from GraphQL; only backend-internal callers could use it. `users.service.ts:29-31`.

## Solar & platform terminology {dev}

- **User type / role (`UserType`)** — `SUPER_ADMIN | ADMIN | USER | SYSTEM`; the coarse permission level checked by `RolesGuard` and the service's field-level authorization.
- **Account status (`UserStatus`)** — the lifecycle: `PENDING` (unconfirmed) → `ACTIVE` (confirmed), plus `DELETED` (soft-removed).
- **Company scoping (multi-tenancy)** — forcing `query.company = user.company` on every read/write for non-SuperAdmins. See [[companies]].
- **Soft delete** — setting `status = DELETED` instead of removing the document; filtered out of manager lists and normal-token validation.
- **Forbidden-field sets** — the per-role lists `updateUser` refuses: `type`/`company`/`email` on your own record, `company`/`status`/`email` on someone else's.
- **Managers** — users eligible as site managers/owners; pooled from the owning company plus every company with site access (`getManagers`). See [[site]].
- **Mentions** — the @mention autocomplete (`getUsersForMentions`): ACTIVE users in the caller's company. See [[events]] and [[notification]].
- **argon2** — the password-hashing algorithm used by `updatePassword`; legacy MD5 hashes are upgraded to argon2 at login. See [[authentication]].
- **JWT / `@CurrentUser()`** — the access token resolved by `JwtStrategy` into a `User` document injected into every resolver.
- **Theme preference (`ThemePreference`)** — `SYSTEM | LIGHT | DARK` per-user portal theme; self-editable (not in any forbidden set).

For the full domain vocabulary, see [[solar-glossary]].

---

**Related flows:** [[authentication]] · [[companies]] · [[settings]] · [[events]] · [[notification]] · [[solar-glossary]]
