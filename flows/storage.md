# Storage (File Storage)

**What it does (business):** The storage module manages all file upload, retrieval, organisation, and deletion for the platform using AWS S3 as the sole storage backend. It serves two distinct use cases: the Denobox file browser (per-site structured document store with virtual folders, drag-and-drop moves, note metadata, and optional event/email side-effects on upload) and a set of internal helpers used by other modules (events, channels, quotes, sites) to stage, move, copy, and download files programmatically.

**Entry point(s):**
- Denobox browser UI: `/site/:siteId/denobox` — `denowatts-portal/src/pages/dashboard/site/denobox/DenoboxPage.tsx`
- Field-setup image upload: `denowatts-portal/src/pages/dashboard/field-setup/components/ImageUpload.tsx`
- Event file upload: inside `EditEventForm` / `SimpleEventModal` components
- Security camera capture: device-side POST (machine-to-machine, not user-facing)

---

## Storage provider

**AWS S3** only — no GCS or local disk.

| Config key | Source | Purpose |
|---|---|---|
| `AWS_REGION` | `ConfigService` | S3 client region |
| `AWS_ACCESS_KEY_ID` | `ConfigService` | IAM access key |
| `AWS_SECRET_KEY` | `ConfigService` | IAM secret key |
| `AWS_S3_BUCKET` | `ConfigService` | Bucket name, used in every S3 command |

S3 client is initialised in `StorageService` constructor with `maxAttempts: 3` and `retryMode: 'standard'` — `denowatts-backend/src/storage/storage.service.ts:58-68`.

**S3 key conventions (path layout inside the bucket):**

| Purpose | Key pattern |
|---|---|
| Denobox site files | `denobox/<siteId>/[<folder>/]<filename>` |
| Denobox photos folder | `denobox/<siteId>/Photos/<filename>` |
| Security camera captures | `denobox/<siteId>/Photos/<serialNumber>-SecurityCamera-<timestamp>.<ext>` |
| Event attachments (temp staging) | `events/temp/<timestamp>-<sanitizedFilename>` |
| Event attachments (persisted) | `events/<eventId>/<token>` |
| Generic uploads (temp staging) | `<folder>/temp/<timestamp>-<sanitizedFilename>` |
| Generic uploads (persisted) | `<folder>/<entityId>/<filename>` |
| QuickBooks product images | `quickbooks/products/<sku>.*` |

---

## REST endpoints

All four REST endpoints are on the `StorageController` (`@Controller('storage')`) mounted under the base path configured by the NestJS app. Uploads use `multipart/form-data` with the field name `file`.

### `POST /storage/events/upload`

**Auth:** standard JWT (no `@Public()`) — requires a valid access token.
**Interceptor:** `FileInterceptor('file')` (Multer in-memory).
**Body:** `file` (multipart) — required.
**Returns:** `{ status: 'success', token: string }` where `token` is the S3 key without the `events/temp/` prefix.
**Purpose:** Stage an event attachment to S3. The caller stores the returned token and calls the events service to create the event; the events service then moves the temp file to its permanent path via `moveEventFile`. — `denowatts-backend/src/storage/storage.controller.ts:26-33`

### `POST /storage/upload`

**Auth:** standard JWT.
**Interceptor:** `FileInterceptor('file')`.
**Body:** `file` (multipart) + `folder` (string, required, from `UploadFileDto`).
**Returns:** `{ status: 'success', fileUri: string }` — public S3 URL at `<folder>/temp/<timestamp>-<name>`.
**Purpose:** Generic file upload for any non-denobox context (e.g., quote attachments). Files land in `<folder>/temp/` until a subsequent service call moves them. — `denowatts-backend/src/storage/storage.controller.ts:35-43`

### `POST /storage/denobox/upload`

**Auth:** standard JWT + `@CurrentUser()` user injection.
**Interceptor:** `FileInterceptor('file')`.
**Body:** `file` (multipart) + `UploadDenoboxFileDto` fields.
**Returns:** `{ status: 'success', fileUrl: string }` — public S3 URL at `denobox/<siteId>/[<folder>/]<filename>`.
**Purpose:** Upload a file into the Denobox file system for a given site. Optionally triggers an event log entry and a support email. — `denowatts-backend/src/storage/storage.controller.ts:45-54`

### `POST /storage/denobox/security-camera-upload`

**Auth:** `@Public()` (bypasses JWT) + `SecuritySecretGuard` — requires `x-security-secret` header matching `SECURITY_SECRET` env var.
**Interceptor:** `FileInterceptor('file')`.
**Body:** `file` (multipart) + `site` (MongoId) + `serialNumber` (string) from `UploadSecurityCameraCaptureFileDto`.
**Returns:** `{ status: 'success', key: string, removedOldFiles: number, fileUrl: string }`.
**Purpose:** Machine-to-machine endpoint for security cameras to push a new capture. Old `SecurityCamera` files in the site's `Photos/` folder are deleted before the new file is written, enforcing a single-image-per-device policy. — `denowatts-backend/src/storage/storage.controller.ts:56-66`

---

## GraphQL API surface

Defined in `StorageResolver` — `denowatts-backend/src/storage/storage.resolver.ts`.

### Query: `getDownloadUrl`

```graphql
query GetDownloadUrl($key: String!): String!
```

| Arg | Type | Notes |
|---|---|---|
| `key` | `String!` | Full S3 key (e.g., `denobox/<siteId>/Reports/file.pdf`) |

**Returns:** A presigned S3 download URL valid for 1 hour (default `expiresInSeconds = 3600`). Sets `ResponseContentType` from the file extension and `ResponseCacheControl: no-cache`.

**Frontend usage:** `GET_DOWNLOAD_URL` in `denowatts-portal/src/graphql/queries/storageQueries.ts`.

---

### Query: `denoboxFiles`

```graphql
query DenoboxFiles($filter: FindDenoboxFilesFilter!): [DenoboxResponse!]!
```

**Input: `FindDenoboxFilesFilter`**

| Field | Type | Required | Validation | Purpose |
|---|---|---|---|---|
| `site` | `String` | Yes | `@IsMongoId()` | Site ObjectId — scopes S3 listing to `denobox/<site>/` |
| `folder` | `String` | No | — | Sub-folder path; omit for root listing |
| `query` | `String` | No | — | Full-text search term against filename and S3 object `note` metadata |

**Returns:** `[DenoboxResponse]` — mixed list of folder entries and file entries (see DenoboxResponse schema below). Folders always come first.

**Frontend usage:** `GET_DENOBOX_FILES` in `denowatts-portal/src/graphql/queries/storageQueries.ts`, called from `DenoboxPage.tsx` with `fetchPolicy: 'network-only'`.

---

### Mutation: `updateDenoboxFile`

```graphql
mutation UpdateDenoboxFile($updateDenoboxFileInput: UpdateDenoboxFileInput!): DenoboxResponse!
```

**Input: `UpdateDenoboxFileInput`**

| Field | Type | Required | Validation | Purpose |
|---|---|---|---|---|
| `site` | `String` | Yes | `@IsMongoId()` | Site ObjectId |
| `path` | `String` | Yes | — | Relative path within `denobox/<site>/` (e.g., `Reports/file.pdf`) |
| `note` | `String` | No | — | Free-text annotation stored as S3 user metadata key `note` |

**Returns:** Updated `DenoboxResponse` (file type).

**Mechanism:** S3 does not support in-place metadata updates. The service issues a `CopyObjectCommand` of the object onto itself with `MetadataDirective: 'REPLACE'` — `denowatts-backend/src/storage/storage.service.ts:418-422`.

**Frontend usage:** `UPDATE_DENOBOX_FILE` mutation in `storageMutations.ts`; used in `DenoboxPage.tsx` with optimistic UI rollback on error.

---

### Mutation: `moveDenoboxFile`

```graphql
mutation MoveDenoboxFile($moveDenoboxFileInput: MoveDenoboxFileInput!): String!
```

**Input: `MoveDenoboxFileInput`**

| Field | Type | Required | Validation | Purpose |
|---|---|---|---|---|
| `site` | `String` | Yes | `@IsMongoId()` | Site ObjectId |
| `sourcePath` | `String` | Yes | — | Current relative path within `denobox/<site>/` |
| `destinationPath` | `String` | Yes | — | New relative path within `denobox/<site>/` |

**Returns:** `"Successfully moved file"` on success.

**Mechanism:** `CopyObjectCommand` (with `ACL: 'public-read'`) to the new key, then `DeleteObjectCommand` on the old key. S3 CopySource is URL-encoded. — `denowatts-backend/src/storage/storage.service.ts:445-471`

**Frontend usage:** `MOVE_DENOBOX_FILE` mutation; triggered by drag-and-drop in `DenoboxPage.tsx` (file dragged onto a folder row or breadcrumb target) and via the `DroppableFolder` / `RootFolderCell` / `FloatingFolders` DnD components.

---

### Mutation: `deleteDenoboxFile`

```graphql
mutation DeleteDenoboxFile($deleteDenoboxFileInput: DeleteDenoboxFileInput!): String!
```

**Input: `DeleteDenoboxFileInput`**

| Field | Type | Required | Validation | Purpose |
|---|---|---|---|---|
| `site` | `String` | Yes | `@IsMongoId()` | Site ObjectId |
| `path` | `String` | Yes | — | Relative path within `denobox/<site>/` |

**Returns:** `"Successfully deleted file"` on success.

**Side effects:**
1. `DeleteObjectCommand` issued to S3.
2. If the S3 response HTTP status is 204 AND the file's top-level folder is one of `['Admin', 'Plans', 'Model', 'Reports']`, an `ADMIN` category event is created via `EventsService.create()` (fire-and-forget, errors captured to Sentry). — `denowatts-backend/src/storage/storage.service.ts:492-511`
3. `FileCleanupService.removeChannelImagePaths()` is called to null-out any `Channel.images` fields pointing to this file. — `denowatts-backend/src/storage/storage.service.ts:513-518`

**Frontend usage:** `DELETE_DENOBOX_FILE` mutation; triggered by the trash button in the Denobox table actions column, gated behind an Ant Design `Popconfirm`.

---

## Services

### StorageService — `storage.service.ts`

`denowatts-backend/src/storage/storage.service.ts`

Exported from the module; injected by 7 other modules: `EventsService`, `ChannelsService`, `SitesService`, `QuoteService`, `DocusealService`, `HubspotCrmService`, `HubspotWebhookService`.

---

#### `getFileBuffer(key): Promise<Buffer>`

- Issues `GetObjectCommand` for the given S3 key.
- Reads the response `Body` stream chunk-by-chunk using `for await`.
- Returns a single `Buffer.concat()`.
- Throws `BadRequestException` if the body is not a `Readable` stream.
- **Used by:** `SitesService` (xlsx parsing), `QuoteService` (xlsx/pdf processing).

---

#### `getDownloadUrl(key, expiresInSeconds = 3600): Promise<string>`

- Issues a `GetObjectCommand` presigned URL via `@aws-sdk/s3-request-presigner`.
- Sets `ResponseContentType` based on the file extension.
- Sets `ResponseCacheControl: 'no-cache, no-store, must-revalidate'` to force fresh downloads.
- Default expiry: 1 hour.
- **Used by:** `denoboxFiles` (per-file), `ChannelsService` (photo URLs), `QuoteService`, `SitesService`, GraphQL `getDownloadUrl` query, `uploadSecurityCameraCaptureFile`.

---

#### `uploadDenoboxFile(file, uploadDenoboxFileDto, user?): Promise<{ status, fileUrl }>`

Steps:
1. Build S3 prefix: `denobox/<site>/` or `denobox/<site>/<folder>/` depending on `folder` field.
2. Replace spaces in filename with underscores.
3. `PutObjectCommand` with `ContentType` from Multer MIME detection.
4. Look up site by `_id` in MongoDB (`siteModel.findById`); throws `NotFoundException` if not found.
5. If `user` is present and `shouldSendEmail` is true: call `EmailService.sendEmailWithTemplate` with template ID `UPLOAD_DENOBOX_FILE_TEMPLATE_ID`, sending to `SUPPORT_EMAIL`. Email includes site name, file path, uploader name/email, and upload timestamp (dayjs formatted). Fire-and-forget.
6. If `shouldCreateEvent` is true AND a `folder` is provided AND S3 HTTP status is 200: if the folder name is in `DENOBOX_EVENT_FOLDERS` (`['Admin', 'Plans', 'Model', 'Reports']`), create an `ADMIN` category event via `EventsService.create()`. Fire-and-forget; errors go to Sentry.
7. Returns `{ status: 'success', fileUrl }` where `fileUrl` is the public S3 URL.
- **Throws:** `NotFoundException` (re-thrown), `InternalServerErrorException` for any other error.

---

#### `uploadSecurityCameraCaptureFile(file, site, serialNumber): Promise<{ status, key, removedOldFiles, fileUrl }>`

Steps:
1. Look up site by `_id` (`.select('_id').lean()`); throws `NotFoundException` if not found.
2. Build photo prefix: `denobox/<siteId>/Photos/`.
3. List up to 1,000 existing objects under that prefix via `ListObjectsV2Command`.
4. Collect all existing keys whose filename (last path segment) contains `"SecurityCamera"` (case-insensitive) into `matchedOldKeys`.
5. Generate new filename: `<serialNumber>-SecurityCamera-<Date.now()><ext>`. Extension extracted with regex `(\.[^./\\]+)$`; filename sanitized via `sanitizeFilename()`.
6. `PutObjectCommand` the new file.
7. `DeleteObjectCommand` each old matched key (sequential loop).
8. Generate presigned download URL for the new file via `getDownloadUrl`.
9. Returns `{ status: 'success', key, removedOldFiles, fileUrl }`.

---

#### `findDenoboxFiles({ site, folder, query }): Promise<DenoboxResponse[]>`

The most complex method — emulates a virtual folder browser over flat S3 object keys.

Steps:
1. Build S3 listing prefix from `site` and optional `folder`.
2. **Default folders injection (root level only):** If `folder` is undefined/empty, unconditionally inject five virtual folder entries: `Admin`, `Plans`, `Model`, `Reports`, `Photos`. These always appear at the top even if no S3 objects exist under them. They are filtered by `query` if provided.
3. `ListObjectsV2Command` with `MaxKeys: 1000`.
4. For each S3 object in `Contents`:
   - Skip the prefix key itself.
   - **Explicit folder objects** (key ends in `/`): add to folder list if not already in `folderSet`, if matches `query`.
   - **Infer implicit folders** from nested file keys: take the first path segment of `remainingPath`; if it contains a `/`, that first segment is an implicit sub-folder.
   - **Files** (key does not end in `/`): include only if at the root level of the current prefix (`!remainingPath.includes('/')`) OR if a `query` is active (cross-folder search). For each matched file, fire parallel `HeadObjectCommand` (to fetch `Metadata.note`) + `getDownloadUrl`. Filter by `matchesQuery(fileName, Metadata?.note)`.
5. Await all file promises via `Promise.all`.
6. Return `[...folders, ...files]` — folders first.

**Search behaviour:** `matchesQuery` checks `fileName.toLowerCase().includes(searchTerm)` OR `note?.toLowerCase().includes(searchTerm)` — case-insensitive substring match on both filename and note metadata. — `denowatts-backend/src/storage/storage.service.ts:281-286`

**Performance note:** Each file in the listing results in two parallel S3 API calls (HeadObject + presigned URL). With `MaxKeys: 1000`, this can trigger up to 1,000 parallel HeadObject calls when a query is active. No pagination is implemented.

---

#### `updateDenoboxFile(updateDenoboxFileInput): Promise<DenoboxResponse>`

1. URL-encode `path` for use in `CopySource`.
2. `CopyObjectCommand` copying the S3 object onto itself (same key) with `MetadataDirective: 'REPLACE'` and new `Metadata: { note }` (or `{}` to clear).
3. `GetObjectCommand` to read back the updated object metadata and size.
4. Returns a `DenoboxResponse` assembled from the GetObject response.

---

#### `moveDenoboxFile(moveDenoboxFileInput): Promise<string>`

1. Build full S3 keys: `denobox/<site>/<sourcePath>` and `denobox/<site>/<destinationPath>`.
2. URL-encode the full source key for `CopySource`.
3. `CopyObjectCommand` to destination with `ACL: 'public-read'`.
4. `DeleteObjectCommand` on source.
5. Returns `"Successfully moved file"`.

**Note:** `ACL: 'public-read'` is set on move but not on the original upload. This may result in an ACL change when a file is moved.

---

#### `deleteDenoboxFile(user, deleteDenoboxFileInput): Promise<string>`

1. `DeleteObjectCommand` for `denobox/<site>/<path>`.
2. `siteModel.findById(site)` to verify site exists; throws `NotFoundException`.
3. If S3 HTTP 204 AND top-level folder in `DENOBOX_EVENT_FOLDERS`: fire-and-forget `EventsService.create()` with `EventCategory.ADMIN` — `denowatts-backend/src/storage/storage.service.ts:492-510`.
4. Second `siteModel.findById(site).lean()` to get `siteDoc._id` for cleanup.
5. Call `fileCleanupService.removeChannelImagePaths(path, siteDoc._id)`.
6. Returns `"Successfully deleted file"`.

**Note:** Two separate `siteModel.findById` calls are made for the same document (one without `.lean()` for the first check, one with `.lean()` for cleanup). This is redundant — a single call could serve both purposes.

---

#### `uploadEventFile(file): Promise<{ status, token }>`

1. Build key: `Date.now() + '-' + sanitizeFilename(file.originalname)`.
2. `PutObjectCommand` to `events/temp/<key>`.
3. Returns `{ status: 'success', token: key }`.
- The token is stored by the caller (event form) and passed to `moveEventFile` or `copyFile` after event creation.

---

#### `uploadFile(file, folder, fullPath?): Promise<{ status, fileUri }>`

1. If `fullPath` provided, use it directly as the S3 key.
2. Otherwise: key = `<folder>/temp/<Date.now()>-<sanitizedFilename>`.
3. `PutObjectCommand` with `ACL: 'public-read'`.
4. Returns `{ status: 'success', fileUri }` as public S3 URL.
- **Used by:** `QuoteStepDetails` frontend uploads to `POST /storage/upload`, DocusealService.

---

#### `moveFile(id, fileUrl): Promise<string>`

Internal helper used when an entity (e.g., a quote) is finalised and its temp files need to be persisted.

1. If `fileUrl` does not contain `/temp/`, return `fileUrl` unchanged (file is already in its permanent location).
2. Extract the S3 key from the public URL by stripping the bucket base URL.
3. Replace `/temp/` in the path with `/<id.toString()>/`.
4. `CopyObjectCommand` to new path with `ACL: 'public-read'`.
5. `DeleteObjectCommand` on old temp key.
6. Return new public URL.
- **Throws:** `BadRequestException` if the URL cannot be parsed.

---

#### `copyFile(token, path): Promise<string>`

1. `CopyObjectCommand` from `<bucket><token>` to `path` with `ACL: 'public-read'`.
2. Returns public URL for the new path.
- Note: `token` here is a raw S3 key fragment including the leading `/`. Used by `EventsService` when copying event images.

---

#### `copyFileWithUrl(url, path): Promise<string>`

1. Strips the bucket base URL from `url` to get the source S3 key.
2. `CopyObjectCommand` to `path` with `ACL: 'public-read'`.
3. Returns public URL for the new path.
- **Used by:** `QuoteService`, `DocusealService` when duplicating documents.

---

#### `moveEventFile(token, path): Promise<string>`

1. `CopyObjectCommand` from `events/temp/<token>` to `path` with `ACL: 'public-read'`.
2. `DeleteObjectCommand` on `events/temp/<token>`.
3. Returns public URL.
- **Used by:** `EventsService` after event creation to persist staged attachments.

---

#### `findFilesByNames(folder, fileNames): Promise<Map<string, string>>`

1. Lists up to 1,000 objects under `folder/` prefix.
2. For each `name` in `fileNames`: finds the first S3 object whose filename **starts with** `name` (prefix match, any extension).
3. Returns a `Map<name, publicUrl>`.
- **Throws:** `InternalServerErrorException` on S3 error.
- **Used by:** `QuoteService` for bulk QuickBooks product image lookup.

---

#### `findFile(folder, fileName, options?): Promise<{ found, key?, fileName?, downloadUrl?, size?, lastModified? }>`

1. Lists up to 1,000 objects under `folder/` prefix.
2. Finds first object whose filename starts with `fileName` (extension-agnostic prefix match).
3. If `options.generateDownloadUrl`:
   - `options.publicUrl = true`: returns plain public S3 URL (no expiry).
   - Otherwise: returns presigned URL (1-hour default).
4. Returns `{ found: true/false, ... }` — never throws on "not found", returns `{ found: false }`.
- **Throws:** `InternalServerErrorException` on S3 API error.
- **Used by:** `QuoteService` for single QuickBooks product image lookup.

---

#### `getLatestSecurityCameraImage(siteId): Promise<DenoboxResponse | null>`

1. Calls `findDenoboxFiles({ site: siteId.toString(), folder: 'Photos', query: '-SecurityCamera-' })`.
2. Further filters results with regex `^.+-SecurityCamera-\d+(?:\.[^./\\]+)?$i` to confirm the naming pattern.
3. Returns the first match or `null`.
- **Used by:** `SitesService` to expose the latest security camera snapshot on the site overview.

---

### FileCleanupService — `file-cleanup.service.ts`

`denowatts-backend/src/storage/file-cleanup.service.ts`

Injected into `StorageService`. Provides a single method to keep Channel image references consistent when a file is deleted from S3.

#### `removeChannelImagePaths(filePath, siteId): Promise<void>`

1. Query MongoDB `Channel` collection: all channels for `site: siteId` where `images` field exists AND `source` is `DENO` or `GATEWAY`.
2. For each channel, extract the filename from `filePath` (last path segment).
3. Check all 17 image fields (see table below) against the filename using `.includes(fileName)`.
4. If any field matches, set it to `null` and flag `hasChanges = true`.
5. `findByIdAndUpdate` only if `hasChanges` is true.
6. All channel updates run in parallel via `Promise.all`.
- **Throws:** `InternalServerErrorException` on error; logs stack trace via `Logger`.

**Checked image fields on `Channel.images`:**
`front`, `back`, `horizontal`, `denoFront`, `denoAntenna`, `denoBomTempSensor`, `auxPyranometer`, `denoPOAAlignment`, `denoGHIAlignment`, `denoAlignmentOrLevel`, `denoToGatewayAntennaLineOfSight`, `denowattsGateway`, `dasEnclosure`, `allDasAntennas`, `siteTopoGrade`, `inverter`, `meter`, `racking`

---

## DTOs

### `FindDenoboxFilesFilter` (GraphQL InputType) — `dto/denobox-file.input.ts:7-17`

| Field | Type | Validation | Purpose |
|---|---|---|---|
| `site` | `String` | `@IsMongoId()` | Site ObjectId, required |
| `folder` | `String?` | — | Sub-folder path, nullable |
| `query` | `String?` | — | Search term, nullable |

### `UploadDenoboxFileDto` (REST body) — `dto/denobox-file.input.ts:19-36`

| Field | Type | Validation | Default | Purpose |
|---|---|---|---|---|
| `site` | `Types.ObjectId` | `@IsMongoId()` | — | Site ObjectId |
| `folder` | `string?` | `@IsString()`, `@IsOptional()` | — | Target subfolder |
| `shouldCreateEvent` | `boolean?` | `@IsBoolean()`, transform from string | `true` | Whether to fire an event log on upload |
| `shouldSendEmail` | `boolean?` | `@IsBoolean()`, transform from string | `true` | Whether to send support email on upload |

Note: `shouldCreateEvent` and `shouldSendEmail` use a `@Transform` decorator to coerce the string values `'true'`/`'false'` (sent as multipart form fields) into booleans — `dto/denobox-file.input.ts:29-35`.

### `UploadSecurityCameraCaptureFileDto` (REST body) — `dto/denobox-file.input.ts:38-46`

| Field | Type | Validation | Purpose |
|---|---|---|---|
| `site` | `Types.ObjectId` | `@IsMongoId()`, `@IsNotEmpty()` | Site ObjectId |
| `serialNumber` | `string` | `@IsString()`, `@IsNotEmpty()` | Camera serial, used in filename |

### `UpdateDenoboxFileInput` (GraphQL InputType) — `dto/denobox-file.input.ts:49-59`

| Field | Type | Validation | Purpose |
|---|---|---|---|
| `site` | `String` | `@IsMongoId()` | Site ObjectId |
| `path` | `String` | — | Relative file path within `denobox/<site>/` |
| `note` | `String?` | — | Annotation; pass empty string to clear |

### `MoveDenoboxFileInput` (GraphQL InputType) — `dto/denobox-file.input.ts:62-72`

| Field | Type | Validation | Purpose |
|---|---|---|---|
| `site` | `String` | `@IsMongoId()` | Site ObjectId |
| `sourcePath` | `String` | — | Current relative path |
| `destinationPath` | `String` | — | Target relative path |

### `DeleteDenoboxFileInput` (GraphQL InputType) — `dto/denobox-file.input.ts:75-83`

| Field | Type | Validation | Purpose |
|---|---|---|---|
| `site` | `String` | `@IsMongoId()` | Site ObjectId |
| `path` | `String` | — | Relative file path to delete |

### `UploadFileDto` (REST body) — `dto/denobox-file.input.ts:84-88`

| Field | Type | Validation | Purpose |
|---|---|---|---|
| `folder` | `string` | `@IsString()`, `@IsNotEmpty()` | Root S3 folder for the upload |

---

## GraphQL return type

### `DenoboxResponse` (ObjectType) — `dto/denobox-response.ts`

| Field | Type | Nullable | Purpose |
|---|---|---|---|
| `name` | `String` | No | Filename or folder name |
| `type` | `String` | No | `'file'` or `'folder'` |
| `path` | `String` | No | Relative path within `denobox/<siteId>/` |
| `updatedAt` | `Date` | Yes | S3 `LastModified` timestamp |
| `note` | `String` | Yes | S3 user metadata `note` field |
| `size` | `Number` | Yes | File size in bytes (absent for folders) |
| `downloadUrl` | `String` | Yes | Presigned 1-hour download URL (absent for folders) |

---

## Constants — `constants/index.ts`

```typescript
export const DENOBOX_EVENT_FOLDERS = ['Admin', 'Plans', 'Model', 'Reports'];
```

These are the four folders that trigger automatic event log entries on both upload and delete. The fifth default folder (`Photos`) does not trigger events.

---

## Business rules

- **Spaces in uploaded filenames are replaced with underscores** before building the S3 key on denobox uploads — `storage.service.ts:122`.
- **Filename sanitization (`sanitizeFilename`)** replaces any character not matching `[a-zA-Z0-9.-_\s]` with `-`, then collapses consecutive whitespace to `-` — `common/utils/string.ts:22`. Used for event and generic upload temp keys.
- **Five default folders are always shown at root level** (`Admin`, `Plans`, `Model`, `Reports`, `Photos`) regardless of whether any objects exist in them — `storage.service.ts:270`.
- **Event log entries are fired for uploads to `['Admin', 'Plans', 'Model', 'Reports']` only** (not `Photos`), and only when `shouldCreateEvent` is true — `storage.service.ts:159-177`.
- **Delete also fires event log entries** for files in the same four folders, checking HTTP 204 from S3 — `storage.service.ts:492-510`.
- **Security camera upload enforces single-image policy**: all existing S3 objects in `Photos/` whose filename contains `SecurityCamera` (case-insensitive) are deleted before writing the new file — `storage.service.ts:204-249`.
- **File moves preserve the denobox S3 key namespace** (`denobox/<site>/`); the destination path is built by prepending the folder `path` property to the file `name` — `DenoboxPage.tsx:287-289`.
- **HEIC/HEIF images are converted to WebP before upload** on both the Denobox page and the ImageUpload component — `DenoboxPage.tsx:181-203`, `ImageUpload.tsx:51-83`.
- **Images are compressed to max 1 MB / 1920px** before upload in the field-setup image upload flow — `ImageUpload.tsx:85-97`.
- **Upload token refresh:** If the REST upload returns HTTP 401, the frontend automatically fires a GraphQL `refreshToken` mutation and retries — `uploadWithRefresh.ts:120-155`.
- **Folder deduplication in listings:** A `Set<string>` (`folderSet`) prevents the same folder from appearing twice in the response, including when both an explicit folder object and files inside it are in the S3 listing — `storage.service.ts:291`.
- **`moveDenoboxFile` sets `ACL: 'public-read'`** on the destination copy. The original upload does not set this ACL, so moving a private file makes it public — `storage.service.ts:459`. Flag for review.
- **No folder creation API**: "folders" are virtual — they exist only as path prefixes on S3 objects. Creating a folder is done implicitly by uploading a file into a path that includes the folder name.

---

## Data touched

| Collection | Operation | When | Context |
|---|---|---|---|
| `sites` | `findById` | `uploadDenoboxFile` | Verify site exists; fetch name for email and event description |
| `sites` | `findById` | `uploadSecurityCameraCaptureFile` | Verify site exists; fetch `_id` for S3 prefix |
| `sites` | `findById` | `deleteDenoboxFile` (×2) | Verify site exists; fetch `_id` for `FileCleanupService` |
| `channels` | `find` (by site + source) | `removeChannelImagePaths` | Locate channels with image references to the deleted file |
| `channels` | `findByIdAndUpdate` | `removeChannelImagePaths` | Null-out matching image fields |

No storage-specific MongoDB schema is defined in this module. `Site` and `Channel` schemas are borrowed via `MongooseModule.forFeature` imports — `storage.module.ts:15-18`.

---

## Edge cases & gotchas

- **S3 `ListObjectsV2` max 1,000 keys**: If a site has more than 1,000 files in a folder, the listing is silently truncated. No pagination or `ContinuationToken` handling exists — `storage.service.ts:273`.
- **`updateDenoboxFile` self-copy race**: The S3 CopyObject-onto-self pattern requires the object to exist. If the file was deleted between the UI load and the save, this will silently succeed (S3 will create a new zero-byte object at the key) or fail with a `NoSuchKey` error depending on timing.
- **Double site lookup in `deleteDenoboxFile`**: Two separate `findById` calls are made — `storage.service.ts:487` and `513`. The first verifies existence, the second fetches for cleanup. Only the second uses `.lean()`. These could be merged.
- **Fire-and-forget event creation**: Both `uploadDenoboxFile` and `deleteDenoboxFile` call `EventsService.create()` without `await`, swallowing errors into Sentry only. Failures are invisible to the caller.
- **`moveDenoboxFile` ACL escalation**: Files uploaded via `uploadDenoboxFile` do not have `public-read` ACL set. Moving them via `moveDenoboxFile` silently adds `public-read` — `storage.service.ts:459`.
- **Path injection via `folder` parameter**: The `folder` field in `UploadDenoboxFileDto` is used directly in the S3 key (`denobox/<site>/<folder>/`). No validation prevents path traversal strings like `../../`. The service does not validate or sanitize folder names — `storage.service.ts:120-121`.
- **`shouldCreateEvent` / `shouldSendEmail` only work when a user is provided**: The email branch is guarded by `if (user && shouldSendEmail)`, so anonymous uploads (e.g., camera captures) never send emails regardless of the flag — `storage.service.ts:142`.
- **HEIC file preview in DenoboxPage uses `heic2any` at render time**: Each HEIC file shown in the table triggers a client-side conversion and a presigned URL fetch. This can be slow for large Photo directories — `DenoboxPage.tsx:54-88`.
- **Search with `query` triggers parallel HeadObject calls for all matched files**: In a root-level search with many files, the service may fire hundreds of `HeadObjectCommand` calls concurrently — `storage.service.ts:371-398`.
- **`sanitizeFilename` differs between REST and internal methods**: REST uploads (events, generic) use `sanitizeFilename` which replaces unknown chars with `-`. Denobox uploads simply replace spaces with underscores (`file.originalname.replace(/ /g, '_')`) without stripping other special characters — `storage.service.ts:122` vs `523-524`.

---

**Related flows:**
- [Events](events.md) — uses `uploadEventFile`, `moveEventFile`, `copyFile`
- [Field Setup](field-setup.md) — uses `POST /storage/denobox/upload` for channel photos
- [Site](site.md) — `getLatestSecurityCameraImage` surfaces on site overview
- [Channels](channels.md) — `getDownloadUrl` for photo display; `FileCleanupService` on delete
