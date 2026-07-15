# Stateless Session and Backend Authorization Design

## Status

Historical approved design, implemented through Batches 3–5 and subsequently refined. It is retained as a decision record, not as the current operational specification. In particular, guest health reads are now denied, anonymous-message reads/writes use a same-origin API, direct anon access is being reduced to three display columns, and the offline diary backup has been removed. Current behavior and pending production work are authoritative in `README.md`, `AGENTS.md`, `docs/DATABASE.md`, and `docs/DEPLOY.md`.

## Goal

Replace browser-trusted `localStorage` authentication and direct anon access to sensitive Supabase data with:

- stateless server-signed HttpOnly Cookie sessions;
- server-side role enforcement for every protected API;
- a server-only Supabase privileged client;
- private Storage buckets served on demand through authorized media proxy APIs;
- tightened RLS, Data API grants, Storage policies, and Supabase Advisor findings;
- no Session table, user center, device management, logout UI, or multi-user SaaS features.

## Non-goals

- Supabase Auth accounts.
- Database-backed sessions.
- Logout/logout-all-devices buttons.
- User management pages.
- Changing the existing password-entry experience.
- Generating signed URLs for every image while loading diary lists.

## Roles and permissions

The latest five diaries by `date DESC` remain public. The server, never the client, determines that set.

| Capability | guest | viewer | admin |
|---|---:|---:|---:|
| Latest five diaries | Read | Read | Read |
| Older diaries | Denied | Read | Read |
| Diary create/update/delete | Denied | Denied | Allowed |
| Translation | Denied | Allowed | Allowed |
| AI analysis | Denied | Denied; button hidden | Allowed |
| CSV export | Denied | Denied; control hidden | Allowed |
| Health read | Read | Read | Read |
| Health write | Denied | Denied | Allowed |
| Yearly summary read/images | Read | Read | Read |
| Yearly summary write | Denied | Denied | Allowed |
| Anonymous message read/insert | Allowed | Allowed | Allowed |
| Anonymous message update/delete | Denied | Denied | Denied |
| Audio read/write/media | Denied | Denied | Allowed |

Frontend role checks are presentation only. Every API repeats authorization on the server.

## Session architecture

Login flow:

```text
Password entry
→ POST /api/auth
→ server verifies viewer/admin password
→ server signs session payload
→ HttpOnly cookie is written
→ later requests authenticate from the cookie
```

Minimum payload:

```ts
type SessionPayload = {
  role: "viewer" | "admin"
  sessionVersion: string
  expiresAt: number
}
```

Required environment variables:

```dotenv
SESSION_SECRET=
SESSION_VERSION=1
SUPABASE_SERVICE_ROLE_KEY=
APP_ORIGIN=https://diary.wuzhizhii.com
```

Existing password and ModelScope variables remain server-only secrets. `SESSION_SECRET` must be a high-entropy secret of at least 32 random bytes. `SUPABASE_SERVICE_ROLE_KEY` must never enter `next.config.mjs`, browser modules, logs, responses, or committed files.

Use Web Crypto HMAC-SHA-256 so signing works under Cloudflare Workers. Verify signature before decoding trusted claims. Every protected request verifies:

1. cookie presence and format;
2. HMAC signature using constant-time verification;
3. `expiresAt` is in the future;
4. role is exactly `viewer` or `admin`;
5. payload `sessionVersion` equals current `SESSION_VERSION`.

Durations:

- viewer: 30 days;
- admin: 7 days.

Cookie attributes:

- `HttpOnly`;
- `Secure` in production;
- `SameSite=Lax`;
- `Path=/`;
- role-specific `Max-Age`/expiry.

Sessions expire naturally or when `SESSION_VERSION` changes. After changing either password, also increment `SESSION_VERSION`. Do not add logout UI in this phase.

The server must fail safely as a configuration error when either password is empty or the viewer and admin passwords are equal. Both passwords, `SESSION_SECRET`, `SESSION_VERSION`, and `SUPABASE_SERVICE_ROLE_KEY` are server-only runtime secrets; none may use a `NEXT_PUBLIC_` name. Sessions are fixed-duration and must not be refreshed or extended by activity.

## Authentication APIs and frontend state

`POST /api/auth` compares the submitted password without revealing which role comparison failed, signs the role-specific session, writes the cookie, and returns only safe role metadata.

Add `GET /api/auth/session` to return `guest`, `viewer`, or `admin` after server validation. Invalid, expired, malformed, or version-mismatched cookies resolve to guest and should be cleared when practical.

Rewrite `useAuth` and callers:

- remove `diaryAppAuthLevel` and `diaryAppAuthStatus` from `localStorage`;
- remove storage-event synchronization;
- initialize role from `/api/auth/session`;
- refresh role state after successful login;
- retain UI guards for feedback only;
- hide AI analysis and CSV export controls for viewer;
- show translation for viewer/admin;
- never send or store a session token in JavaScript.

## Server-only Supabase boundary

Create an explicitly server-only Supabase client using `SUPABASE_SERVICE_ROLE_KEY`. Import guards must prevent it from entering client bundles. The existing anon client may remain only for intentionally public anonymous-message operations during migration, then should be removed from sensitive browser paths.

Move sensitive database access behind server APIs grouped by domain, for example:

```text
/api/diaries
/api/diaries/[id]
/api/diaries/[id]/analysis
/api/translate
/api/diary-download
/api/health
/api/yearly-summaries
/api/yearly-summaries/[year]
/api/audio
```

Authorization helpers should expose small interfaces such as `requireSession()`, `requireViewer()`, and `requireAdmin()`. Route handlers must not accept a client-provided role or `authenticated=true` flag.

Guest access to a single diary must query whether its ID belongs to the current `ORDER BY date DESC LIMIT 5` set. A client-supplied date, list position, or public flag is not authorization evidence.

Translation accepts viewer/admin. AI analysis and any related database write accept admin only. CSV export accepts admin only.

`anonymous_messages` is the one retained browser-anon path: its board continues to issue direct Supabase `SELECT` and `INSERT`. Do not create a permanent `/api/messages` route. After the migration, no client-reachable anon client may access a sensitive domain, including Storage.

## Diary access and data invariants

`diaryContent.date` is globally unique. For a guest, the only readable diary set is the result of `ORDER BY date DESC LIMIT 5` at request time; future-dated rows participate normally in that query. The server must apply this rule to list pagination, search, calendar/date jump, a single diary request, previous/next navigation, direct URLs, and diary-image authorization. A real diary (or referenced diary image) outside that set returns `403`; an absent diary or object reference returns `404`. Do not silently turn a forbidden diary into an empty list or a not-found response.

`image_paths` is a non-null JSONB array and an empty diary stores `[]`, never `NULL`. Every present value must be globally unique across current diary rows, match `^\d{4}/\d{8}_\d+\.webp$`, and embed the owning diary's `date` as `YYYYMMDD`. Date uniqueness plus date/path matching makes cross-row duplication impossible; a database constraint trigger must still reject duplicate elements inside one JSONB array. A diary with nonempty `image_paths` cannot change date. A diary with `[]` may change to an unused date.

The no-reuse requirement cannot be met from the current array alone when the greatest-numbered object is deleted. Therefore the migration adds a durable, internal `diary_image_sequences` ledger keyed by diary date with a nondecreasing `last_sequence`; it is a sequence-allocation record, not a cleanup/retry task table. Adding an image atomically locks/upserts that date, sets its number to `GREATEST(last_sequence, current-array maximum) + 1`, and advances `last_sequence`. Removing an image never renumbers or reduces the ledger. Replacing an image overwrites its same path and updates `diaryContent.modifiedAt`. Client image URLs use the proxy plus `v=<modifiedAt>`.

## Private Storage and on-demand media proxy

Adopt media proxy APIs rather than returning signed URLs:

```text
GET /api/media/diary?path=...
GET /api/media/yearly?path=...
GET /api/media/audio?path=...
```

The browser requests media only when an image is rendered, a gallery is opened, or audio is played. Diary-list APIs return relative object paths, not batches of signed URLs.

Authorization:

- diary image: query `diaryContent.image_paths` to find the owning diary, then apply latest-five/viewer/admin rules;
- yearly image: guest/viewer/admin may read on demand;
- audio: admin only;
- upload, replacement, metadata mutation, and deletion: admin only through server APIs.

Never accept a bucket name from the client. Normalize and validate paths; reject empty paths, backslashes, `..`, encoded traversal, unexpected prefixes, and paths not referenced by an authorized database row.

The proxy downloads from private Storage and streams the body with the correct content type. Image responses may use short private/browser caching. Audio must parse and honor a single valid HTTP `Range` request, return `206` with `Content-Range`, `Accept-Ranges`, and exact `Content-Length`, return `416` for an unsatisfiable range, and forward a stream rather than fully buffering a large object. Client requests never submit a bucket name. Every server path validator rejects empty strings, backslashes, `..`, percent-encoded traversal, repeated slashes, a wrong prefix, query/fragment characters, and a wrong extension before Storage access.

### Media invariants

| Domain | Fixed bucket | Stored path and database rule | Read | Mutation |
|---|---|---|---|---|
| Diary image | `2024To2025_diary_images` | `diaryContent.image_paths` JSONB array; diary rules above | guest latest five only; viewer/admin all | admin API only |
| Yearly image | `2025_Summary_Images` | one non-null `yearly_images.storage_path` per image row; `^yearly/[1-9]\d*\.webp$`; unique among current rows | all roles | admin API only |
| Audio | `audio_messages` | `public.audio_messages.audio_path`; unique bare `*.mp3` filename, no directory | admin only | admin API only |

`yearly_images.yearly_summary_id` keeps its foreign key to `yearly_summaries.id ON DELETE CASCADE`. A yearly image replacement overwrites the same object path and updates `yearly_images.updated_at`; proxy URLs use `v=<updated_at>`. A deleted image record releases its path for later reuse. Before deleting a yearly summary, read every associated `storage_path`, delete the summary row (cascading image rows), then delete those objects; report any residual path if Storage cleanup fails.

Audio does not support in-place replacement: delete its database row first, delete the old file second, then create a new record/file. Before adding the audio-path unique constraint, a read-only duplicate audit must pass. Accept MP3 only and keep it at the bucket root.

For every media/database operation, delete database metadata before Storage. If the subsequent object deletion fails, return a structured partial-success result stating `databaseDeleted: true`, `storageDeleted: false`, and the residual path(s). If upload succeeds but its database mutation fails, immediately attempt compensating Storage deletion; return residual path(s) if that attempt also fails. No queue, Cron, automatic retry, or cleanup-task table is added in this phase, and the UI must present partial success rather than success.

Required media migration order:

1. implement and test media read proxies while buckets are still public;
2. switch all frontend media reads to proxies;
3. implement admin upload, replacement, and deletion APIs;
4. switch every frontend Storage write to those server APIs;
5. prove that no client code retains sensitive direct Storage writes;
6. verify proxies, image version parameters, and audio Range behavior;
7. make all three buckets private;
8. remove public Storage policies;
9. verify public URLs, anon listing, upload, replacement, and deletion all fail.

## Database, RLS, grants, and Advisor remediation

Keep RLS enabled. After all sensitive browser paths use server APIs:

- remove `PUBLIC/anon/authenticated FOR ALL USING (true)` policies from diary, AI, health, audio, and yearly-summary tables;
- revoke unnecessary Data API table privileges from anon/authenticated;
- retain anonymous-message SELECT/INSERT policies and the 2–1000 trimmed-length constraint;
- leave service-role access server-side, recognizing that it bypasses RLS and therefore depends on complete route authorization;
- handle `diaryInfo` and `rss_articles` separately based on confirmed use, not by copying diary policies.

Supabase Advisor findings to resolve:

1. Broad permissive table policies: remove only after corresponding server APIs and regression tests exist.
2. Public bucket listing: private buckets and removal of broad `storage.objects` SELECT eliminate list exposure.
3. `public.rls_auto_enable()` SECURITY DEFINER execution:
   - inspect dependencies and source;
   - delete it if unused;
   - otherwise move it to an unexposed schema when feasible, constrain `search_path`, and revoke EXECUTE from PUBLIC/anon/authenticated;
   - rerun security advisors after the change.
4. `diaryInfo` RLS enabled without policies: remove every project-code reference but retain the production table. Do not drop it without a separate explicit approval. `rss_articles` belongs to another project and is entirely out of scope: do not read or alter its data, RLS, grants, indexes, or functions.

Never tighten all policies before new APIs are live. Migrate one domain at a time to avoid production downtime.

## CSRF, login abuse, and response safety

Cookie authentication requires explicit write-request protection:

- `SameSite=Lax` cookie;
- validate every state-changing request's `Origin` against server-only `APP_ORIGIN` in production, with the required value `https://diary.wuzhizhii.com`;
- allow an explicitly enumerated localhost origin only in local development;
- reject Cloudflare temporary and `workers.dev` origins for production mutations;
- reject missing/foreign origins where appropriate;
- require JSON or explicit multipart content types;
- rate-limit login attempts and add a uniform failure delay;
- use generic authentication errors;
- return 401 for missing/invalid sessions and 403 for insufficient roles;
- do not expose Supabase errors, binding presence, internal paths, password distinctions, or secret metadata.

Rate limiting must be compatible with Cloudflare Workers. Select the concrete mechanism during implementation planning after checking current Cloudflare capabilities and account bindings. Origin validation does not replace session/role authorization.

## Migration phases

Each phase must be independently deployable and verified before removing the old path.

1. Session primitives, cookie tests, `/api/auth`, and `/api/auth/session`.
2. Frontend migration from localStorage to server session; viewer button visibility changes.
3. Server-only Supabase client and authorization helpers.
4. Diary reads with latest-five guest enforcement.
5. Diary admin writes, admin-only AI analysis, viewer/admin translation, admin-only CSV export.
6. Health and yearly-summary APIs, then audio APIs; preserve direct anon messages only.
7. Execute the required media migration order above.
8. Frontend removal of all remaining sensitive direct Supabase calls and `diaryInfo` references.
9. Table RLS/Data API grant tightening by domain after its replacement API is live.
10. Advisor function remediation; do not touch `rss_articles` and do not drop `diaryInfo`.
11. Complete documentation/deployment updates.

Rollback points and old/new path compatibility must be defined in the implementation plan for every phase that changes production RLS or bucket visibility.

## Testing and acceptance criteria

Automated tests must cover:

- valid viewer/admin sessions and their 30-day/7-day expiry;
- altered signatures, malformed payloads, expiry, unknown roles, and `SESSION_VERSION` mismatch;
- production Cookie attributes and absence of JavaScript-readable auth state;
- guest latest-five enforcement for list and direct-ID access;
- guest latest-five enforcement for search, calendar/date jump, previous/next, direct URLs, and owned diary images, including 403 versus 404;
- viewer read access to history and translation;
- viewer AI analysis and CSV export denied server-side and hidden in UI;
- admin CRUD, AI analysis, CSV export, health, yearly-summary, and audio operations;
- 401 versus 403 behavior;
- anonymous-message SELECT/INSERT success and UPDATE/DELETE denial;
- diary-image ownership authorization for all roles;
- diary/annual/audio path validation, date/path matching, non-null `[]`, uniqueness, no-renumber sequence allocation, overwrite version parameters, and partial-success compensation results;
- guest yearly-image access;
- admin-only audio including Range requests;
- traversal/encoding/path-injection rejection;
- CSRF Origin checks and login throttling;
- no service-role or session secret in browser bundles;
- direct anon sensitive-table access denied after migration;
- direct public Storage URLs/list/upload/update/delete behavior matches the final private policy.

Before each schema or policy batch, execute read-only production audits for the invariants that batch will enforce. Any existing NULL, malformed, duplicate, wrong-date, or incompatible path blocks the migration until an explicitly approved data-repair plan exists; implementation must not silently coerce existing production records.

Verification gates:

- focused unit/integration tests for each phase;
- `pnpm build`;
- explicit `pnpm exec tsc --noEmit` after excluding or fixing intentionally inactive backup components;
- `pnpm cf:build`;
- `pnpm exec wrangler deploy --dry-run`;
- Supabase security and performance advisors;
- pre/post-migration policy and grant queries;
- deployed guest/viewer/admin browser regression tests;
- Cloudflare logs checked for authentication, media streaming, and Range errors without logging secrets.

The design is accepted only when localStorage authentication is gone, sensitive APIs enforce the signed Cookie session, viewer cannot access AI analysis/CSV export, private media is fetched on demand through authorized proxies, and direct anon access to sensitive tables/objects is denied.

## Documentation and operational updates

Implementation must update:

- `README.md`: user-visible authentication and permission behavior;
- `AGENTS.md`: server/client boundaries and security constraints;
- `docs/DATABASE.md`: final RLS, grants, private buckets, and Advisor status;
- `docs/DEPLOY.md`: `SESSION_SECRET`, `SESSION_VERSION`, service-role secret, build/runtime stages, phased deployment, and rollback;
- checked-in SQL/migrations: authoritative policy and grant changes.

Never record secret values. Incrementing `SESSION_VERSION` is the documented global session revocation procedure.

## Instructions for the next conversation

Use this prompt:

> Read `docs/superpowers/specs/2026-07-12-stateless-session-backend-authorization-design.md`, then read `README.md`, `AGENTS.md`, `docs/DATABASE.md`, and `docs/DEPLOY.md`. Inspect current code, Git status, Supabase production metadata/advisors, and Cloudflare configuration without exposing secrets. Use `superpowers:writing-plans` to create a phased implementation plan with TDD, rollback checkpoints, and exact migration verification. Do not implement until I approve that plan.
