# Prompts

**What it does (business):** The `prompts` module is a **CRUD log/feedback store for AI chat interactions** — it persists a record per AI exchange (the user's `input` text, the assistant's `output` text, when each happened) and captures user feedback on that exchange (`rating`, `reaction` of LIKE/DISLIKE/NONE), grouped by an optional `sessionId` and attributed to the authenticated user via `createdBy`. It is a **plain Mongoose-backed GraphQL CRUD module**: it does **not** itself call any LLM/AI provider. The actual LLM work in this backend lives in a completely separate, unrelated module (`src/shared/openai/`, OpenAI GPT-4o/GPT-4.1) used by sites/channels — see "AI integration details" for the distinction. The frontend has no hand-written consumer yet; the GraphQL operations exist only as auto-generated types.

**Entry point(s):** None in the live UI yet. The portal does not contain any hand-written query/mutation, hook, or component that calls these operations. The only frontend artifacts are the **auto-generated** types in `denowatts-portal/src/graphql/__generated__/graphql.ts` (`CreatePromptInput`, `UpdatePromptInput`, `Prompt`, `Reaction`, `MutationCreatePromptArgs`, `MutationUpdatePromptArgs`, ~lines 1475, 4239, 5035, 6852). This means the schema is published to the GraphQL endpoint and codegen picks it up, but no React code invokes it. (Likely an in-progress AI-chat / "ask Denowatts" feedback feature — flag for human confirmation.)

## GraphQL API surface

All three operations are defined in `denowatts-backend/src/prompts/prompts.resolver.ts`. The resolver is `@Resolver(() => Prompt)`.

**Auth model (applies to all three):** Two global guards run (`denowatts-backend/src/app.module.ts:178-185`):
- `JwtAuthGuard` (global `APP_GUARD`) — the prompts resolver has **no `@Public()` decorator**, so **a valid JWT is required** for every operation.
- `RolesGuard` (global `APP_GUARD`) — the prompts resolver has **no `@Roles()` decorator**, and `RolesGuard` returns `true` when no roles are required (`denowatts-backend/src/common/guards/roles.guard.ts:23-25`). So **any authenticated user (any `UserType`) may call all three operations** — there is no per-role restriction.

### Mutation `createPrompt(input: CreatePromptInput!): Prompt!`
- Resolver: `prompts.resolver.ts:17-20` → `promptsService.create(input, user._id)`.
- The creator is taken from `@CurrentUser()` (`denowatts-backend/src/common/decorators/current-user.decorator.ts`), **not** from the input — `createdBy` is omitted from the input type and injected server-side.
- **Input type `CreatePromptInput`** = `OmitType(Prompt, ['_id','createdAt','updatedAt','createdBy'])` (`dto/prompt.input.ts:18-22`). Resulting fields:
  | Field | Type | Required | Notes |
  |---|---|---|---|
  | `input` | String | **yes** | the input/prompt content |
  | `inputAt` | DateTime | **yes** | when the input was recorded |
  | `output` | String | no | the output/response content |
  | `outputAt` | DateTime | no | when the output was recorded |
  | `rating` | Int | no | (GraphQL `Int`; stored as Number) |
  | `sessionId` | String | no | session grouping identifier |
  | `reaction` | `Reaction` enum | no | defaults to `NONE` |
- **Return type `Prompt`** (full object — see Schemas). Returns the saved document.

### Mutation `updatePrompt(input: UpdatePromptInput!): Prompt!`
- Resolver: `prompts.resolver.ts:22-24` → `promptsService.update(input)`.
- Does **not** read `@CurrentUser` — anyone authenticated can update any prompt by `_id`; `createdBy` is never re-set on update (it is omitted from the input).
- **Input type `UpdatePromptInput`** = `IntersectionType(PickType(FindOnePromptInput,['_id']), PartialType(OmitType(Prompt, ['_id','createdAt','updatedAt','createdBy'])))` (`dto/prompt.input.ts:28-31`). Resulting fields:
  | Field | Type | Required | Notes |
  |---|---|---|---|
  | `_id` | ID | **yes** | which prompt to update |
  | `input` | String | no | all other fields optional (PartialType) |
  | `inputAt` | DateTime | no | |
  | `output` | String | no | |
  | `outputAt` | DateTime | no | |
  | `rating` | Int | no | |
  | `sessionId` | String | no | |
  | `reaction` | `Reaction` | no | |
- **Return type `Prompt`** — the updated document (post-update, `{ new: true }`).

### Query `prompts(filter: FilterPromptInput): PaginatedPrompts!`
- Resolver: `prompts.resolver.ts:27-36` → `promptsService.paginate(filter ?? {})`. Name = `prompts`, described as "Paginated list of prompts". `filter` is nullable; null is coerced to `{}`.
- **Input type `FilterPromptInput`** (`dto/prompt.input.ts:33-60`):
  | Field | Type | Required | Validation | Default | Purpose |
  |---|---|---|---|---|---|
  | `page` | Int | no | `@Min(1)` | 1 | page number |
  | `limit` | Int | no | `@Min(1)` | 10 | page size |
  | `createdBy` | ID | no | `@IsMongoId()` | — | filter to one user's prompts |
  | `search` | String | no | `@IsString()` | — | case-insensitive regex over `input` and `output` |
- **Return type `PaginatedPrompts`** = `PaginateType(PromptPaginate)` with an overridden `docs: [PromptPaginate]` (`dto/prompt.input.ts:82-86`). The pagination envelope (from `denowatts-backend/src/common/object-types/paginate-type.ts`) exposes: `docs`, `totalDocs`, `limit`, `totalPages`, `page`, `pagingCounter`, `hasPrevPage`, `hasNextPage`, `prevPage`, `nextPage`.
  - **`PromptPaginate`** = `OmitType(Prompt, ['createdBy'])` + a replaced `createdBy: PromptUserResponse` (`dto/prompt.input.ts:76-80`). So each doc has all `Prompt` scalar fields plus a **populated** `createdBy` user object instead of a raw ObjectId.
  - **`PromptUserResponse`** (`dto/prompt.input.ts:62-75`): `_id: ID`, `firstName?: String`, `lastName?: String`, `email?: String`.

## Services

### PromptsService — `denowatts-backend/src/prompts/prompts.service.ts`
Injects the Mongoose model as `Model<PromptDocument> & PaginateModel<PromptDocument>` (`prompts.service.ts:12-15`). Pagination works because `mongoose-paginate-v2` is registered as a **global connection plugin** in `denowatts-backend/src/app.module.ts:110` — it is not applied per-schema in the prompts module. Has a private `Logger` named `PromptsService`. All three methods wrap their body in try/catch and on error: `logger.error(...)`, `Sentry.captureException(error)`, then rethrow.

#### `create(input: CreatePromptInput, createdBy?: Types.ObjectId): Promise<PromptDocument>`
- `prompts.service.ts:17-29`.
- Logic: `new this.promptModel({ ...input, createdBy: createdBy ?? undefined })`, then `doc.save()`.
- **DB writes:** inserts one document into the `prompts` collection. `createdAt`/`updatedAt` auto-set by Mongoose `timestamps: true`. `reaction` defaults to `NONE` if not provided (schema default). `_id` auto-generated.
- **Side effects:** none beyond the insert (no LLM call, no events, no notifications).
- **Throws:** any Mongoose validation/persistence error (e.g. missing required `input`/`inputAt`). Note: the try/catch around `new this.promptModel({...})` does **not** await `doc.save()` inside the `try` (it `return`s the promise), so a rejected save promise propagates to the caller but is **not** caught by this method's catch block — async errors here are not logged/sent to Sentry by this method. (Implementation gotcha — flag for human review.)

#### `update(input: UpdatePromptInput): Promise<PromptDocument>`
- `prompts.service.ts:31-48`.
- Logic: destructures `{ _id, ...updateData }`, then `promptModel.findByIdAndUpdate(_id, { $set: updateData }, { new: true, runValidators: true }).exec()`.
- **DB reads/writes:** updates the matched `prompts` doc by `_id`; `runValidators: true` re-runs schema validators on the `$set` fields; `new: true` returns the post-update document. `updatedAt` auto-bumped by timestamps.
- **Branches/Throws:** if `findByIdAndUpdate` returns null (no doc with that `_id`), throws `NotFoundException("Prompt with ID <_id> not found")`. The catch block re-throws `NotFoundException` as-is (no Sentry); any other error is logged + sent to Sentry + rethrown.
- **Side effects:** none beyond the update.

#### `paginate(filter: FilterPromptInput)`
- `prompts.service.ts:50-84`.
- Logic / query build:
  - `query = {}`.
  - If `filter.createdBy` is truthy → `query.createdBy = filter.createdBy`.
  - If `filter.search?.trim()` is non-empty → `query.$or = [{ input: { $regex: search, $options: 'i' } }, { output: { $regex: search, $options: 'i' } }]` (case-insensitive substring match on either field; **unindexed regex scan**).
  - `page = filter.page ?? 1`, `limit = filter.limit ?? 10`, `sort = { inputAt: -1 }` (newest input first).
- **DB reads:** `promptModel.paginate(query, { page, limit, sort, populate: { path: 'createdBy', select: '_id firstName lastName email' } })`. Populates the creating user (subset of fields only).
- **Side effects:** none.
- **Throws:** logs + Sentry + rethrow on any error.

## Schemas

### Prompt — `denowatts-backend/src/prompts/schemas/prompt.schema.ts`
Dual-purpose class: `@ObjectType()` (GraphQL) + `@Schema({ timestamps: true })` (Mongo). Collection: `prompts` (Mongoose default pluralization). `PromptDocument = HydratedDocument<Prompt>`.

| Field | GraphQL type | Mongo `@Prop` type | Required (DB) | Nullable (GQL) | Indexed | Validation | Purpose |
|---|---|---|---|---|---|---|---|
| `_id` | ID | (auto) | — | no | yes (`_id`) | — | unique identifier |
| `input` | String | String | **yes** | no | no | `@IsString()` | the input/prompt content |
| `inputAt` | Date | Date | **yes** | no | **yes** (`{ inputAt: -1 }`, line 95) | — | when the input was recorded; sort key for `paginate` |
| `output` | String | String | no | yes | no | `@IsOptional() @IsString()` | the output/response content |
| `outputAt` | Date | Date | no | yes | no | `@IsOptional()` | when the output was recorded |
| `rating` | Number | Number | no | yes | no | `@IsOptional() @IsNumber()` | numeric rating |
| `sessionId` | String | String | no | yes | no | `@IsOptional() @IsString()` | session grouping identifier |
| `reaction` | `Reaction` enum | String (enum `Reaction`) | no | yes (default `NONE`) | no | `@IsOptional() @IsEnum(Reaction)` | LIKE / DISLIKE / NONE; DB default `NONE` |
| `createdBy` | ID | `ObjectId` (ref `User`) | no | yes | **yes** (`{ createdBy: 1 }`, line 94) | `@IsOptional() @IsMongoId()` | the creating user; ref to `users` collection |
| `createdAt` | Date | (timestamps) | auto | yes | no | — | auto-managed |
| `updatedAt` | Date | (timestamps) | auto | yes | no | — | auto-managed |

**Indexes** (`prompt.schema.ts:94-95`): `{ createdBy: 1 }` (supports the `createdBy` filter) and `{ inputAt: -1 }` (supports the default sort). There is **no index** backing the `search` regex on `input`/`output`.

### Reaction enum — `prompt.schema.ts:7-13`
GraphQL enum (registered via `registerEnumType`, name `Reaction`). Values: `LIKE = 'LIKE'`, `DISLIKE = 'DISLIKE'`, `NONE = 'NONE'`. Schema/DB default = `NONE`.

## DTOs

All in `denowatts-backend/src/prompts/dto/prompt.input.ts`. Most are derived from `Prompt` via NestJS mapped-type helpers (`OmitType`/`PickType`/`PartialType`/`IntersectionType`), so field types/validation are inherited from the schema unless noted.

### CreatePromptInput — `prompt.input.ts:18-22`
`@InputType` = `OmitType(Prompt, ['_id','createdAt','updatedAt','createdBy'])`. Fields & validation inherited from `Prompt`: `input` (required, `@IsString`), `inputAt` (required), `output?`, `outputAt?`, `rating?` (`@IsNumber`), `sessionId?`, `reaction?` (`@IsEnum(Reaction)`, default `NONE`).

### FindOnePromptInput — `prompt.input.ts:25`
`@InputType` = `PickType(Prompt, ['_id'])`. Single field `_id: ID`. Used only as a building block for `UpdatePromptInput`.

### UpdatePromptInput — `prompt.input.ts:28-31`
`@InputType` = `IntersectionType(PickType(FindOnePromptInput,['_id']), PartialType(OmitType(Prompt,['_id','createdAt','updatedAt','createdBy'])))`. `_id` required; every other prompt field optional. Validators run on supplied fields via `runValidators: true` in the service update.

### FilterPromptInput — `prompt.input.ts:33-60`
Standalone `@InputType` (not derived).
| Field | Type | Validation | Default | Purpose |
|---|---|---|---|---|
| `page` | Int (nullable) | `@IsOptional()` `@Min(1)` | 1 | page number |
| `limit` | Int (nullable) | `@IsOptional()` `@Min(1)` | 10 | page size |
| `createdBy` | ID (nullable) | `@IsOptional()` `@IsMongoId()` | — | filter by creating user |
| `search` | String (nullable) | `@IsOptional()` `@IsString()` | — | case-insensitive search over `input`/`output` |

### PromptUserResponse — `prompt.input.ts:62-75`
`@ObjectType` for the populated creator. `_id: ID` (required), `firstName?`, `lastName?`, `email?` (all nullable strings).

### PromptPaginate — `prompt.input.ts:76-80`
`@ObjectType` = `OmitType(Prompt, ['createdBy'])` plus `createdBy?: PromptUserResponse`. The shape of each `docs[]` entry returned by the `prompts` query.

### PaginatedPrompts — `prompt.input.ts:82-86`
`@ObjectType` = `PaginateType(PromptPaginate)` with `docs: [PromptPaginate]` re-declared. Return type of the `prompts` query.

## Module wiring

### PromptsModule — `denowatts-backend/src/prompts/prompts.module.ts`
- `imports`: `MongooseModule.forFeature([{ Prompt → PromptSchema }, { User → UserSchema }])`. (User schema imported so the `createdBy` populate/ref resolves.)
- `providers`: `PromptsService`, `PromptsResolver`.
- `exports`: `PromptsService` (so other modules could reuse it; no current consumer was found importing it).

## AI integration details

**This module makes no LLM/AI calls.** Confirmed: no `openai`/`anthropic`/`claude`/`gpt`/`langchain` import or usage anywhere under `src/prompts/`. The schema's `input`/`output`/`reaction`/`rating` fields strongly imply it is meant to **log and collect feedback on** AI chat exchanges, but the generation itself is not done here.

The backend's actual LLM integration is **separate and unrelated to this module**:
- **Provider: OpenAI** (`openai` npm package `^4.47.1`, `denowatts-backend/package.json`). API key from env `OPENAI_API_KEY` (validated in `denowatts-backend/src/config/env.validation.ts:18`).
- Implemented in `denowatts-backend/src/shared/openai/openai.service.ts` (`OpenAIService`, instantiates `new OpenAI({ apiKey })` at line 36).
- **Models used there:** `gpt-4o` (`openai.service.ts:134,156,237,251`) and `gpt-4.1` (`openai.service.ts:308`); also uses the OpenAI Assistants beta API (`beta.assistants.create`, `beta.threads.runs.stream`, lines 150-177).
- **Consumers of `OpenAIService`:** `denowatts-backend/src/sites/services/sites.service.ts` (`extractMonthlyEnergyModel`, line 697) and `denowatts-backend/src/channels/services/channels.service.ts` (`generateChannelStatusDescription`, line 1157). These are PDF/energy-model extraction and channel-status description generation — **not** wired to the `prompts` collection.

**Note for verification:** the LLM provider here is **OpenAI (GPT-4o / GPT-4.1), not Claude/Anthropic.** The `prompts` module documented here does not call any provider at all.

## Business rules
- Authentication required for all operations; no role restriction (any authenticated `UserType`) — global `JwtAuthGuard` + `RolesGuard` with no `@Public()`/`@Roles()` on the resolver — `denowatts-backend/src/prompts/prompts.resolver.ts`, `denowatts-backend/src/app.module.ts:178-185`, `denowatts-backend/src/common/guards/roles.guard.ts:23-25`.
- `createdBy` is server-assigned from the JWT user on create, never from client input, and is never changed on update — `prompts.resolver.ts:18-19`, `prompts.service.ts:17-23`.
- `reaction` defaults to `NONE` when omitted — `prompt.schema.ts:64,69`.
- `input` and `inputAt` are mandatory on create; all other content fields optional — `prompt.schema.ts:24,29`.
- Update of a non-existent `_id` throws `NotFoundException` — `prompts.service.ts:38-40`.
- List is always sorted newest-input-first (`inputAt: -1`); `search` matches `input` OR `output` case-insensitively; `createdBy` filters to one user — `prompts.service.ts:54-68`.
- Listed prompts return the creator as a trimmed user object (`_id, firstName, lastName, email`) via populate — `prompts.service.ts:74-77`.

## Data touched
- `prompts` collection (created by this module) — full lifecycle (insert on create, `$set` on update, paginated reads). Fields: `input`, `inputAt`, `output`, `outputAt`, `rating`, `sessionId`, `reaction`, `createdBy`, `createdAt`, `updatedAt` — `prompt.schema.ts`.
- `prompts.createdBy` → ref to `users` collection; read-only join via populate selecting `_id firstName lastName email` — `prompts.service.ts:74-77`, `prompts.module.ts:12`.
- Indexes maintained: `{ createdBy: 1 }`, `{ inputAt: -1 }` — `prompt.schema.ts:94-95`.

## Edge cases & gotchas
- **No frontend consumer.** Nothing in the portal calls these operations (only auto-generated types exist). The feature is plumbed end-to-end on the backend and published in the GraphQL schema but appears unused / in-progress. Flag for human confirmation of intended UI.
- **Misnomer risk vs. AI prompts.** Despite the name, this is a generic input/output/feedback log; the real LLM (OpenAI) lives in `src/shared/openai/` and does not touch this collection.
- **`create` does not await `save()` inside its try/catch** (`prompts.service.ts:23` returns the promise), so a rejected save is propagated to the caller but bypasses this method's Sentry/logger handling. Synchronous constructor/validation errors are caught; async persistence errors are not. (Flag for human review.)
- **`updatePrompt` has no ownership check** — any authenticated user can edit any prompt by `_id`. If this should be owner-only, that rule is not implemented.
- **`search` is an unindexed case-insensitive `$regex` scan** over `input` and `output` — fine at small scale, a full-collection scan as the table grows; no text index exists.
- **`rating` is GraphQL `Int` in the generated types but stored/validated as `Number`** (`@IsNumber`, Mongo `Number`) — non-integer ratings would pass DB validation but the published GraphQL `Int` field constrains client input to integers.
- **`createPrompt` does not validate that `outputAt >= inputAt`** or that `output`/`outputAt` are set together — no cross-field validation exists.

**Related flows:** [users.md](users.md) (`createdBy` ref + `PromptUserResponse` shape, JWT `@CurrentUser`), [authentication.md](authentication.md) (global `JwtAuthGuard`/`RolesGuard` behavior). No AI-feature flow doc currently exists for the OpenAI integration in `src/shared/openai/` (sites PDF extraction / channel status description) — candidate for a future doc.
