# Stateless Session and Backend Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace browser-trusted authentication and sensitive anon Supabase/Storage access with signed Cookie sessions, authorized APIs, private proxied media, and least-privilege policies without a production access gap.

**Architecture:** Client components call same-origin App Router APIs. Server-only modules validate the session and Origin, then use an isolated service-role Supabase client; only the anonymous-message board retains the browser anon client. Media is authorized from metadata before streaming a fixed-bucket object, while DB-first media mutations return explicit partial-success results.

**Tech Stack:** Next.js 16 App Router, React 18, TypeScript, Supabase JS/PostgreSQL/Storage, Cloudflare Workers via OpenNext, Web Crypto, pnpm 10.20.0, Node.js 22+, Vitest (add as a development dependency).

## Global Constraints

- Never print, commit, or put values for credentials, passwords, or secrets in browser code.
- `AUTH_PASSWORD_VIEWER` and `AUTH_PASSWORD_ADMIN` are nonempty, distinct server secrets; changing either requires incrementing server-only `SESSION_VERSION`.
- Viewer sessions are exactly 30 days; admin sessions are exactly 7 days; activity never renews them.
- In production, every state-changing request requires `Origin: https://diary.wuzhizhii.com` checked against server-only `APP_ORIGIN`; localhost is allowed only in local development. Temporary Cloudflare and `workers.dev` origins never authorize production writes.
- Guests may read only the dynamic `diaryContent ORDER BY date DESC LIMIT 5` set, including future dates; real-but-forbidden diary resources return 403 and absent resources return 404.
- `diaryContent.image_paths` is always `[]` or a valid array; use only bucket `2024To2025_diary_images`. `yearly_images` uses only `2025_Summary_Images`; `audio_messages` uses only `audio_messages`.
- Client requests never carry a bucket name. Reject empty, backslash, `..`, percent-encoded traversal, repeated slash, bad prefix, query/fragment, and bad extension before Storage use.
- Metadata deletion precedes Storage deletion. Return residual paths on either post-delete failure or failed upload compensation; do not add retry queues, Cron jobs, or cleanup task tables.
- Keep `anonymous_messages` browser-anon `SELECT`/`INSERT` and its trimmed 2–1000-length check. Do not create `/api/messages`; remove all other client-reachable sensitive anon access.
- Do not touch `rss_articles`. Remove code references to `diaryInfo`, retain its production table, and never drop it without another explicit approval.
- Do not make buckets private, remove public Storage policies, revoke grants, or tighten business-table RLS until the corresponding API is deployed, client paths are switched, and that batch’s verification gate passes.
- Use `pnpm`, preserve `pnpm-lock.yaml`, and run all build-sensitive checks in WSL/Linux.

---

## Target file map

| Path | Responsibility |
|---|---|
| `lib/server/env.ts` | Server-only required-variable lookup and deployment-mode checks. |
| `lib/server/session.ts` | HMAC Cookie encode/verify, role guards, cookie construction. |
| `lib/server/origin.ts` | JSON/multipart Content-Type and state-changing Origin validation. |
| `lib/server/supabaseAdmin.ts` | The only service-role Supabase client. |
| `lib/server/pathRules.ts` | Fixed-bucket media path validation, diary date/path validation, Range parsing. |
| `lib/server/diaryAccess.ts` | Guest latest-five membership, 403/404 lookup, neighbors, and diary DTOs. |
| `lib/server/media.ts` | Authorized Storage streaming and partial-success result types. |
| `lib/server/mediaMutations.ts` | Admin upload/replace/delete workflows and compensation. |
| `app/api/auth/route.ts`, `app/api/auth/session/route.ts` | Login and current-session endpoints. |
| `app/api/diaries/**`, `app/api/health/**`, `app/api/yearly-summaries/**`, `app/api/audio/**` | Domain APIs with server authorization. |
| `app/api/media/{diary,yearly,audio}/route.ts` | On-demand image/audio read proxies. |
| `lib/diaryApi.ts`, `lib/audioApi.ts`, `lib/yearlySummaryApi.ts`, `hooks/useAuth.ts`, `app/page.tsx` | Browser API clients/state; no sensitive Supabase or Storage writes. |
| `components/diary-detail.tsx`, `components/diary-downloader.tsx`, `components/yearly-summary.tsx` | Role-appropriate controls, proxy URL rendering, and partial-success messages. |
| `supabase/migrations/*.sql` | Versioned constraints, sequence ledger, RLS/grants, and Storage-policy changes. |
| `supabase/verification/*.sql` | Read-only production preflight and postflight assertions. |
| `tests/**/*.test.ts`, `vitest.config.ts`, `package.json` | TDD coverage and test command. |

## Batch 0: Test harness and read-only production preflight

**Deployment gate:** No production mutation. The preflight result must show no incompatible rows before any migration that adds a constraint.

### Task 1: Add a deterministic unit-test harness

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `tests/server/session.test.ts`

**Interfaces:**
- Produces `pnpm test` as `vitest run` and `pnpm test:watch` as `vitest`.
- Tests import server-only modules through `@/` and run in the Node environment.

- [ ] **Step 1: Write the failing smoke test**

```ts
import { describe, expect, it } from 'vitest'

describe('test harness', () => {
  it('executes TypeScript tests', () => {
    expect('server authorization').toContain('authorization')
  })
})
```

- [ ] **Step 2: Verify the project has no test command yet**

Run: `pnpm test --runInBand`

Expected: command-not-found or an equivalent missing-script failure.

- [ ] **Step 3: Add Vitest without changing runtime dependencies**

Add `vitest` under `devDependencies`, the two scripts above, and this `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: { environment: 'node', setupFiles: ['./tests/setup.ts'] },
})
```

- [ ] **Step 4: Verify the harness**

Run: `pnpm test tests/server/session.test.ts`

Expected: one passing test.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts tests/setup.ts tests/server/session.test.ts
git commit -m "test: add authorization test harness"
```

### Task 2: Check production data only, and preserve the result outside source control

**Files:**
- Create: `supabase/verification/20260712_media_preflight.sql`
- Create: `supabase/verification/20260712_media_postflight.sql`
- Modify: `docs/DATABASE.md`

**Interfaces:**
- Consumes a read-only SQL-console role or approved read-only production connection.
- Produces zero-row violation queries and a human-recorded, date-stamped execution result; the result contains counts/paths but never credentials.

- [ ] **Step 1: Write the preflight queries before migrations**

```sql
-- Every result must be empty before its matching constraint is installed.
SELECT id, date FROM public."diaryContent" WHERE image_paths IS NULL OR jsonb_typeof(image_paths) <> 'array';
SELECT d.id, d.date, p.path
FROM public."diaryContent" AS d
CROSS JOIN LATERAL jsonb_array_elements_text(d.image_paths) AS p(path)
WHERE p.path !~ '^\d{4}/\d{8}_[0-9]+\.webp$'
   OR replace(split_part(p.path, '/', 2), '_', '') !~ ('^' || replace(d.date::text, '-', '') || '[0-9]+\.webp$');
SELECT storage_path, count(*) FROM public.yearly_images GROUP BY storage_path HAVING count(*) > 1 OR bool_or(storage_path IS NULL);
SELECT audio_path, count(*) FROM public.audio_messages GROUP BY audio_path HAVING count(*) > 1 OR bool_or(audio_path !~ '^[^/\\?%#]+\.mp3$');
```

- [ ] **Step 2: Run the queries read-only against production**

Run: execute `supabase/verification/20260712_media_preflight.sql` in the Supabase SQL editor in read-only mode.

Expected: empty violation result sets. If a query returns data, stop that migration batch and request a separately approved data-repair decision; do not coerce rows in application code.

- [ ] **Step 3: Add postflight assertions**

```sql
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('diaryContent', 'yearly_images', 'audio_messages')
  AND column_name IN ('image_paths', 'storage_path', 'audio_path');
SELECT date, last_sequence FROM public.diary_image_sequences ORDER BY date DESC LIMIT 5;
```

- [ ] **Step 4: Document only the audit procedure**

Add a concise `docs/DATABASE.md` migration-preflight subsection, not live result values, and state that a nonempty violation set blocks the batch.

- [ ] **Step 5: Commit**

```bash
git add supabase/verification/20260712_media_preflight.sql supabase/verification/20260712_media_postflight.sql docs/DATABASE.md
git commit -m "docs: add media migration preflight checks"
```

## Batch 1: Signed session, Origin boundary, and server admin client

**Deployment gate:** `pnpm test tests/server/session.test.ts tests/server/origin.test.ts`, `pnpm exec tsc --noEmit`, `pnpm build`, `pnpm cf:build`, and `pnpm exec wrangler deploy --dry-run` pass. Configure the new server secrets in runtime scope and `APP_ORIGIN` before enabling login; do not add them to `next.config.mjs`.

### Task 3: Implement and test session primitives before routes

**Files:**
- Create: `lib/server/env.ts`
- Create: `lib/server/session.ts`
- Create: `tests/server/session.test.ts`

**Interfaces:**
- Produces `type Role = 'guest' | 'viewer' | 'admin'` and `type SessionPayload = { role: 'viewer' | 'admin'; sessionVersion: string; expiresAt: number }`.
- Produces `createSession(role, now): Promise<{ token: string; maxAge: number }>` and `readSession(cookieHeader, now): Promise<SessionPayload | null>`.

- [ ] **Step 1: Write failing expiry, tamper, and configuration tests**

```ts
it.each([['viewer', 30 * 24 * 60 * 60], ['admin', 7 * 24 * 60 * 60]] as const)(
  '%s expires at the fixed role duration', async (role, maxAge) => {
    const created = await createSession(role, 1_000)
    expect(created.maxAge).toBe(maxAge)
    expect(await readSession(`diary_session=${created.token}`, 1_000 + maxAge * 1_000 - 1)).toMatchObject({ role })
    expect(await readSession(`diary_session=${created.token}`, 1_000 + maxAge * 1_000)).toBeNull()
  },
)
it('rejects a modified signature and mismatched session version', async () => {
  const { token } = await createSession('viewer', 1_000)
  expect(await readSession(`diary_session=${token}x`, 1_001)).toBeNull()
})
it('fails configuration for empty or equal passwords', () => {
  expect(() => validateAuthConfiguration({ viewer: '', admin: 'a' })).toThrow('AUTH_PASSWORD_VIEWER')
  expect(() => validateAuthConfiguration({ viewer: 'same', admin: 'same' })).toThrow('distinct')
})
```

- [ ] **Step 2: Run the focused test to prove failure**

Run: `pnpm test tests/server/session.test.ts`

Expected: import or function-not-defined failure.

- [ ] **Step 3: Implement Web Crypto HMAC and safe cookies**

Use URL-safe base64 JSON plus a 32-byte-minimum HMAC-SHA-256 signature. Compare signatures using `crypto.subtle.verify`, check expiry/role/version after signature verification, and construct `HttpOnly; SameSite=Lax; Path=/; Secure` cookies in production with exact role `Max-Age`. Never serialize the password or secret.

```ts
export function requireRole(session: SessionPayload | null, role: 'viewer' | 'admin'): SessionPayload {
  if (!session) throw new HttpError(401, 'Authentication required')
  if (role === 'admin' && session.role !== 'admin') throw new HttpError(403, 'Forbidden')
  return session
}
```

- [ ] **Step 4: Verify all session cases**

Run: `pnpm test tests/server/session.test.ts`

Expected: valid viewer/admin, malformed token, altered signature, unknown role, expiry, version mismatch, and invalid password configuration all pass their assertions.

- [ ] **Step 5: Commit**

```bash
git add lib/server/env.ts lib/server/session.ts tests/server/session.test.ts
git commit -m "feat: add signed cookie session primitives"
```

### Task 4: Test Origin enforcement and expose auth endpoints

**Files:**
- Create: `lib/server/origin.ts`
- Create: `tests/server/origin.test.ts`
- Modify: `app/api/auth/route.ts`
- Create: `app/api/auth/session/route.ts`
- Modify: `hooks/useAuth.ts`

**Interfaces:**
- `assertAllowedOrigin(request: Request): void` throws 403 for no/foreign production Origin.
- `GET /api/auth/session` returns `{ role: 'guest' | 'viewer' | 'admin' }` and clears invalid cookies where practical.
- `POST /api/auth` returns `{ role: 'viewer' | 'admin' }` plus only an HttpOnly `Set-Cookie` header.

- [ ] **Step 1: Write failing Origin and endpoint tests**

```ts
it('accepts only configured production Origin for writes', () => {
  expect(() => assertAllowedOrigin(new Request('https://worker/api', { method: 'POST', headers: { Origin: 'https://diary.wuzhizhii.com' } }))).not.toThrow()
  expect(() => assertAllowedOrigin(new Request('https://worker/api', { method: 'POST', headers: { Origin: 'https://x.example' } }))).toThrow(/403/)
})
it('session endpoint never returns a token', async () => {
  const response = await GET(new Request('https://worker/api/auth/session'))
  expect(await response.json()).toEqual({ role: 'guest' })
})
```

- [ ] **Step 2: Run the failure**

Run: `pnpm test tests/server/origin.test.ts`

Expected: missing module/handler failures.

- [ ] **Step 3: Implement routes and replace localStorage state**

`POST /api/auth` parses bounded JSON, validates Origin and auth configuration, uses generic invalid-credential failures with a uniform delay, and sets the session cookie. `useAuth` loads `/api/auth/session`, updates local React state after login, deletes `diaryAppAuthLevel`/`diaryAppAuthStatus` migration remnants, and removes storage-event synchronization. Its existing `logout()` becomes local UI reset only; no logout endpoint is introduced.

- [ ] **Step 4: Verify security behavior**

Run: `pnpm test tests/server/origin.test.ts tests/server/session.test.ts && rg -n 'diaryAppAuth(Level|Status)' app components hooks lib`

Expected: tests pass; the final `rg` has no output.

- [ ] **Step 5: Commit**

```bash
git add lib/server/origin.ts tests/server/origin.test.ts app/api/auth/route.ts app/api/auth/session/route.ts hooks/useAuth.ts
git commit -m "feat: enforce origin and cookie authentication"
```

### Task 5: Isolate the privileged client

**Files:**
- Create: `lib/server/supabaseAdmin.ts`
- Create: `tests/server/supabaseAdmin.test.ts`
- Modify: `next.config.mjs`

**Interfaces:**
- Produces `getSupabaseAdmin(): SupabaseClient` only from a module guarded by `import 'server-only'`.
- `next.config.mjs` exposes only the existing public URL/anon variables and never the service key, session values, passwords, or `APP_ORIGIN`.

- [ ] **Step 1: Write an import/bundle-boundary test**

```ts
it('creates the admin client only from a service-role runtime binding', async () => {
  await expect(import('@/lib/server/supabaseAdmin')).resolves.toHaveProperty('getSupabaseAdmin')
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm test tests/server/supabaseAdmin.test.ts`

Expected: module-not-found failure.

- [ ] **Step 3: Implement the server-only factory**

Create the client with server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, `auth.persistSession: false`, and no browser import path. Do not modify production configuration in this task.

- [ ] **Step 4: Verify server boundary and Worker build**

Run: `pnpm test tests/server/supabaseAdmin.test.ts && pnpm build && pnpm cf:build && pnpm exec wrangler deploy --dry-run`

Expected: all commands exit 0; inspect generated client chunks only for variable names, never values, and confirm no service/session/password identifier appears in browser modules.

- [ ] **Step 5: Commit**

```bash
git add lib/server/supabaseAdmin.ts tests/server/supabaseAdmin.test.ts next.config.mjs
git commit -m "feat: isolate server supabase admin client"
```

## Batch 2: Diary reads and privileged diary actions

**Deployment gate:** Deploy only after guest/viewer/admin API tests pass against a staging-safe dataset. Preserve old browser reads until the API-returned DTO renders identically; no RLS change in this batch.

### Task 6: Enforce latest-five access and 403/404 semantics in one server module

**Files:**
- Create: `lib/server/diaryAccess.ts`
- Create: `tests/server/diaryAccess.test.ts`
- Create: `app/api/diaries/route.ts`
- Create: `app/api/diaries/[id]/route.ts`
- Create: `app/api/diaries/[id]/neighbors/route.ts`
- Create: `app/api/diaries/calendar/route.ts`
- Modify: `lib/diaryApi.ts`
- Modify: `app/page.tsx`

**Interfaces:**
- `getDiaryList(input, role)` returns capped guest results and public DTOs with relative paths.
- `getDiaryById(id, role)` and `getDiaryByDate(date, role)` throw 404 if absent and 403 if present but guest-forbidden.
- `getDiaryNeighbors(id, role)` returns neighbors only from the caller’s allowed set.

- [ ] **Step 1: Write authorization tests before SQL code**

```ts
it('includes a future date when it is in the five newest rows', async () => {
  const result = await getDiaryList({ page: 1, pageSize: 50, search: 'x' }, 'guest', fakeRepo)
  expect(result.entries.map((entry) => entry.id)).toEqual([9, 8, 7, 6, 5])
  expect(result.totalCount).toBe(5)
})
it('returns 403 for a real sixth diary and 404 for an absent diary', async () => {
  await expect(getDiaryById(4, 'guest', fakeRepo)).rejects.toMatchObject({ status: 403 })
  await expect(getDiaryById(404, 'guest', fakeRepo)).rejects.toMatchObject({ status: 404 })
})
```

- [ ] **Step 2: Prove failure**

Run: `pnpm test tests/server/diaryAccess.test.ts`

Expected: missing-module failure.

- [ ] **Step 3: Implement allowed-set-first queries and browser migration**

Query the ordered five IDs first for a guest, then apply list/search/calendar/date/neighbors filtering only within that ID set. Do not accept a client-provided date/list position as proof. Replace `lib/diaryApi.ts` browser calls with `fetch('/api/diaries…')`; remove `getMultipleImageUrls()` conversion from `app/page.tsx` and retain raw paths plus `modifiedAt` for proxy URL construction.

- [ ] **Step 4: Verify API and client behavior**

Run: `pnpm test tests/server/diaryAccess.test.ts && pnpm exec tsc --noEmit && rg -n 'from\(' app/page.tsx lib/diaryApi.ts`

Expected: tests/type-check pass; final search contains no Supabase `.from(` call in the converted files.

- [ ] **Step 5: Commit**

```bash
git add lib/server/diaryAccess.ts tests/server/diaryAccess.test.ts app/api/diaries lib/diaryApi.ts app/page.tsx
git commit -m "feat: authorize diary reads on the server"
```

### Task 7: Move diary writes, analysis, translation, and export behind role guards

**Files:**
- Create: `app/api/diaries/[id]/analysis/route.ts`
- Modify: `app/api/diaries/route.ts`
- Modify: `app/api/diaries/[id]/route.ts`
- Modify: `app/api/ai-analysis/route.ts`
- Modify: `app/api/translate/route.ts`
- Modify: `app/api/diary-download/route.ts`
- Modify: `components/diary-detail.tsx`
- Modify: `components/diary-downloader.tsx`
- Create: `tests/api/diaryRoles.test.ts`

**Interfaces:**
- `POST/PATCH/DELETE /api/diaries` and analysis/download require admin; translation requires viewer or admin.
- Every mutation calls `assertAllowedOrigin()` before database or AI work.

- [ ] **Step 1: Write role matrix tests**

```ts
it.each([
  ['viewer', '/api/ai-analysis', 403],
  ['viewer', '/api/diary-download', 403],
  ['viewer', '/api/translate', 200],
  ['admin', '/api/diaries/1', 200],
  ['guest', '/api/translate', 401],
] as const)('%s receives %i for %s', async (role, url, status) => {
  expect(await invokeAs(role, url)).toHaveProperty('status', status)
})
```

- [ ] **Step 2: Run the failing role tests**

Run: `pnpm test tests/api/diaryRoles.test.ts`

Expected: current unguarded API behavior fails at least the viewer/guest cases.

- [ ] **Step 3: Implement guards and remove client database writes**

Require session/role before all protected work. Move the `components/diary-detail.tsx` direct `diaryContent` update and `saveAIAnalysis()` into the authorized API transaction flow. Make viewer AI/CSV buttons absent, retain translation for viewer/admin, and map errors to safe 401/403/400 responses without Supabase details.

- [ ] **Step 4: Verify**

Run: `pnpm test tests/api/diaryRoles.test.ts && rg -n 'from\(' components/diary-detail.tsx components/diary-downloader.tsx`

Expected: role tests pass; converted components have no direct Supabase query.

- [ ] **Step 5: Commit**

```bash
git add app/api/diaries app/api/ai-analysis/route.ts app/api/translate/route.ts app/api/diary-download/route.ts components/diary-detail.tsx components/diary-downloader.tsx tests/api/diaryRoles.test.ts
git commit -m "feat: enforce diary action roles"
```

## Batch 3: Schema invariants and media read proxies

**Deployment gate:** Run the Batch 0 preflight read-only queries. Apply the schema migration only after every violation query is empty. Deploy proxy reads while buckets remain public and confirm they render before changing any bucket or Storage policy.

### Task 8: Add audited media constraints and diary sequence ledger

**Files:**
- Create: `supabase/migrations/20260712_01_media_invariants.sql`
- Create: `tests/server/pathRules.test.ts`
- Create: `lib/server/pathRules.ts`

**Interfaces:**
- Produces `parseDiaryImagePath(path)`, `parseYearlyImagePath(path)`, `parseAudioPath(path)`, and `parseSingleRange(header, size)`.
- Migration creates `public.diary_image_sequences(date date primary key, last_sequence integer not null check (last_sequence >= 0))` and trigger-enforced invariants.

- [ ] **Step 1: Write path and Range failures first**

```ts
it.each(['', '../x.webp', '2026//20260118_1.webp', '2026/20260118_1.webp?x=1', '2026%2f20260118_1.webp'])('rejects diary path %s', (path) => {
  expect(() => parseDiaryImagePath(path)).toThrow()
})
it('accepts exactly a diary date-matched webp path', () => {
  expect(parseDiaryImagePath('2026/20260118_1.webp')).toEqual({ date: '2026-01-18', sequence: 1 })
})
it('returns 416 for an unsatisfiable Range', () => {
  expect(() => parseSingleRange('bytes=20-30', 20)).toThrow(/416/)
})
```

- [ ] **Step 2: Run the test**

Run: `pnpm test tests/server/pathRules.test.ts`

Expected: module-not-found failure.

- [ ] **Step 3: Implement SQL and pure validation**

The migration sets `diaryContent.image_paths DEFAULT '[]'::jsonb NOT NULL`, requires an array, adds a trigger that validates every diary path/date and duplicate array element, prevents date change while nonempty, and atomically upserts the per-date high-water ledger. It makes `yearly_images.storage_path NOT NULL` with a unique constraint and format trigger, preserves its cascade FK, and adds unique/MP3-root validation for `audio_messages.audio_path`. Do not include `rss_articles` or `diaryInfo` in this SQL.

- [ ] **Step 4: Verify locally and in read-only postflight**

Run: `pnpm test tests/server/pathRules.test.ts && pnpm exec tsc --noEmit`

Expected: tests/type-check pass. After an approved migration execution, run `supabase/verification/20260712_media_postflight.sql`; expected column/ledger results match the migration and no violation query returns rows.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260712_01_media_invariants.sql lib/server/pathRules.ts tests/server/pathRules.test.ts
git commit -m "feat: enforce media path invariants"
```

### Task 9: Implement streaming, authorized media proxies and switch reads

**Files:**
- Create: `lib/server/media.ts`
- Create: `app/api/media/diary/route.ts`
- Create: `app/api/media/yearly/route.ts`
- Create: `app/api/media/audio/route.ts`
- Create: `tests/api/mediaProxy.test.ts`
- Modify: `app/page.tsx`
- Modify: `components/diary-detail.tsx`
- Modify: `components/diary-list.tsx`
- Modify: `components/yearly-summary.tsx`
- Modify: `lib/audioHandler.ts`

**Interfaces:**
- `diaryMediaUrl(path, modifiedAt)` returns `/api/media/diary?path=<encoded>&v=<encoded timestamp>`.
- `yearlyMediaUrl(path, updatedAt)` returns the corresponding yearly URL.
- Audio proxy returns a streamed `Response`, 200 for whole object, 206 for a valid range, and 416 for invalid/unsatisfiable range.

- [ ] **Step 1: Write authorization/streaming tests**

```ts
it('returns 403 for a real image owned by the sixth diary and 404 for no owner', async () => {
  expect((await diaryMedia(fakeRequest('2020/20200101_1.webp'), guest)).status).toBe(403)
  expect((await diaryMedia(fakeRequest('2020/20200101_9.webp'), guest)).status).toBe(404)
})
it('forwards a valid audio range without calling arrayBuffer', async () => {
  const response = await audioMedia(fakeRangeRequest('bytes=0-3'), admin, fakeStorageStream('abcdef'))
  expect(response.status).toBe(206)
  expect(response.headers.get('Content-Range')).toBe('bytes 0-3/6')
})
```

- [ ] **Step 2: Run failing tests**

Run: `pnpm test tests/api/mediaProxy.test.ts`

Expected: missing route/module failure.

- [ ] **Step 3: Implement metadata-first authorization and streams**

Validate the request path before querying. For diary media, find its owning JSONB path, distinguish absent owner (404) from a real but guest-forbidden owner (403), then stream the fixed bucket. Yearly media accepts all roles after row ownership check; audio requires admin and parses one range. Build image URL helpers from `modifiedAt`/`updated_at`; stop all `getPublicUrl()` use in rendering paths.

- [ ] **Step 4: Verify proxy behavior before policy changes**

Run: `pnpm test tests/api/mediaProxy.test.ts && rg -n 'getPublicUrl|storage\.from' app components lib/imageHandler.ts lib/audioHandler.ts lib/yearlySummaryApi.ts`

Expected: media tests pass. Remaining direct Storage matches may exist only in not-yet-converted write modules and are enumerated for Batch 4.

- [ ] **Step 5: Verify with Cloudflare workerd preview**

Run: `pnpm preview`

Expected: OpenNext starts a local workerd preview. In a second terminal, request a known diary proxy image and `curl -i -H 'Range: bytes=0-1023' 'http://localhost:8787/api/media/audio?path=<known-mp3>'` using an admin session cookie. Expected: image is rendered through `/api/media/diary`; audio is `206`, has `Accept-Ranges: bytes`, `Content-Range`, and does not trigger a full-object memory read in Worker logs.

- [ ] **Step 6: Commit**

```bash
git add lib/server/media.ts app/api/media app/page.tsx components/diary-detail.tsx components/diary-list.tsx components/yearly-summary.tsx lib/audioHandler.ts tests/api/mediaProxy.test.ts
git commit -m "feat: proxy authorized media reads"
```

## Batch 4: Admin media mutations and remaining domain APIs

**Deployment gate:** Every mutation needs a valid admin Cookie, valid production Origin, and an explicit partial-success UI test. Buckets remain public until all write callers are server APIs and the direct-client scan is clean.

### Task 10: Add diary, yearly, and audio mutation workflows

**Files:**
- Create: `lib/server/mediaMutations.ts`
- Create: `app/api/diaries/[id]/images/route.ts`
- Create: `app/api/diaries/[id]/images/[sequence]/route.ts`
- Create: `app/api/yearly-summaries/[year]/images/route.ts`
- Create: `app/api/yearly-summaries/[year]/images/[imageId]/route.ts`
- Create: `app/api/audio/route.ts`
- Create: `app/api/audio/[id]/route.ts`
- Create: `tests/api/mediaMutations.test.ts`
- Modify: `lib/imageHandler.ts`
- Modify: `lib/audioApi.ts`
- Modify: `lib/yearlySummaryApi.ts`
- Modify: `app/page.tsx`
- Modify: `components/yearly-summary.tsx`

**Interfaces:**
- `type MutationResult = { databaseDeleted: boolean; storageDeleted: boolean; residualPaths: string[] }` for delete flows.
- Upload/replace routes accept multipart file content but no bucket field; diary add uses the sequence ledger and replacement retains its path.

- [ ] **Step 1: Write failure/compensation tests**

```ts
it('compensates a successful upload when metadata insertion fails', async () => {
  const result = await createDiaryImage(input, storageThatUploads, repositoryThatFails)
  expect(result).toEqual({ ok: false, residualPaths: [] })
})
it('reports a database-first delete with a residual object', async () => {
  const result = await deleteAudio(id, repositoryThatDeletes, storageThatFailsDelete)
  expect(result).toEqual({ databaseDeleted: true, storageDeleted: false, residualPaths: ['recording.mp3'] })
})
it('rejects wav and a nested mp3 path', () => {
  expect(() => parseAudioPath('nested/a.mp3')).toThrow()
  expect(() => parseAudioPath('a.wav')).toThrow()
})
```

- [ ] **Step 2: Run the expected failure**

Run: `pnpm test tests/api/mediaMutations.test.ts`

Expected: missing implementation failure.

- [ ] **Step 3: Implement all admin-only workflows**

For diary: allocate `max(ledger,current)+1`, upload WebP, update array/`modifiedAt`, and compensation-delete on DB failure; delete metadata path before Storage. For yearly: generate a positive-digit unique candidate, insert one metadata row/path, overwrite the identical path on replace and update `updated_at`; delete a summary by first reading all paths, deleting the parent, then attempting every object. For audio: accept MP3 only, never overwrite, and model replacement as delete old row/object then create new record/file. Return concrete residual path lists in every failed cleanup response.

- [ ] **Step 4: Convert browser writes and show partial success**

Replace `uploadImage`, `uploadAudioFile`, `supabase.storage.from(...).upload/remove/update`, and direct row mutations in the listed client modules with same-origin `fetch` calls. UI success notifications require `storageDeleted !== false`; render a warning listing residual paths for partial success.

- [ ] **Step 5: Verify direct client Storage writes are gone**

Run: `pnpm test tests/api/mediaMutations.test.ts && rg -n 'storage\.from\([^)]*\)\.(upload|update|remove)|getPublicUrl' app components hooks lib --glob '!lib/server/**'`

Expected: mutation tests pass; no sensitive direct Storage read/write result remains. `lib/messageBoardApi.ts` may retain its anon table client but no Storage calls.

- [ ] **Step 6: Commit**

```bash
git add lib/server/mediaMutations.ts app/api/diaries app/api/yearly-summaries app/api/audio lib/imageHandler.ts lib/audioApi.ts lib/yearlySummaryApi.ts app/page.tsx components/yearly-summary.tsx tests/api/mediaMutations.test.ts
git commit -m "feat: move media mutations to admin APIs"
```

### Task 11: Move health and yearly-summary metadata behind APIs; preserve anonymous messages

**Files:**
- Create: `app/api/health/route.ts`
- Create: `app/api/health/[id]/route.ts`
- Create: `app/api/yearly-summaries/route.ts`
- Create: `app/api/yearly-summaries/[year]/route.ts`
- Create: `tests/api/domainRoles.test.ts`
- Modify: `lib/diaryApi.ts`
- Modify: `lib/yearlySummaryApi.ts`
- Modify: `components/anonymous-message-board.tsx`
- Modify: `lib/messageBoardApi.ts`

**Interfaces:**
- Health `GET` accepts guest/viewer/admin; health mutation accepts admin only.
- Yearly summary reads accept guest/viewer/admin; metadata mutations accept admin only.
- `messageBoardApi` has only `SELECT`/`INSERT` operations and no role/session transport.

- [ ] **Step 1: Write the role and preservation tests**

```ts
it.each([['guest', 'GET', '/api/health', 200], ['viewer', 'POST', '/api/health', 403], ['admin', 'POST', '/api/health', 200], ['guest', 'GET', '/api/yearly-summaries/2026', 200]] as const)(
  '%s %s %s is %i', async (role, method, path, status) => expect(await invokeAs(role, path, method)).toHaveProperty('status', status),
)
it('anonymous messages expose only list and insert functions', async () => {
  expect(Object.keys(await import('@/lib/messageBoardApi'))).not.toEqual(expect.arrayContaining(['updateAnonymousMessage', 'deleteAnonymousMessage']))
})
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm test tests/api/domainRoles.test.ts`

Expected: unguarded direct access fails the role expectations.

- [ ] **Step 3: Implement APIs and convert only sensitive browser modules**

Use server repositories for health/yearly tables and Origin checks on mutations. Keep `components/anonymous-message-board.tsx` and `lib/messageBoardApi.ts` using the anon client for explicit SELECT/INSERT; do not add an API wrapper.

- [ ] **Step 4: Verify**

Run: `pnpm test tests/api/domainRoles.test.ts && rg -n 'from\(' app components hooks lib --glob '!lib/messageBoardApi.ts' --glob '!lib/server/**'`

Expected: tests pass; no remaining sensitive browser database call is found. The message module has no update/delete operation.

- [ ] **Step 5: Commit**

```bash
git add app/api/health app/api/yearly-summaries lib/diaryApi.ts lib/yearlySummaryApi.ts components/anonymous-message-board.tsx lib/messageBoardApi.ts tests/api/domainRoles.test.ts
git commit -m "feat: authorize health and yearly summary APIs"
```

## Batch 5: Private Storage and least-privilege production migration

**Deployment gate:** All prior tests, an authenticated workerd-preview smoke test, and a deployed guest/viewer/admin regression pass. This is the first batch allowed to mutate production policies/buckets and therefore requires a separately recorded production approval and a rollback owner.

### Task 12: Make Storage private only after proxy/write migration is proven

**Files:**
- Create: `supabase/migrations/20260712_02_private_media_storage.sql`
- Create: `supabase/verification/20260712_storage_access_postflight.sql`
- Create: `tests/e2e/privateStorageRegression.md`
- Modify: `docs/DATABASE.md`
- Modify: `docs/DEPLOY.md`

**Interfaces:**
- Storage migration changes exactly the three named buckets, removes public object policies, and grants no anon/client direct Storage access.
- Regression script records expected status results without credentials.

- [ ] **Step 1: Write the regression matrix before the migration**

```markdown
| Request | Expected |
|---|---:|
| Guest proxy for newest diary image | 200 |
| Guest proxy for sixth diary image | 403 |
| Viewer proxy for old diary image | 200 |
| Admin audio Range proxy | 206 |
| Direct public object URL | non-200 |
| Anon Storage list/upload/overwrite/delete | non-2xx |
```

- [ ] **Step 2: Run the matrix while buckets are still public**

Run: execute the proxy rows against the deployed pre-migration application; record only status/header outcomes.

Expected: proxy rows pass. The direct-public rows may still succeed, proving why the policy migration is required.

- [ ] **Step 3: Write the narrow bucket/policy migration**

Update only `storage.buckets` rows for `2024To2025_diary_images`, `2025_Summary_Images`, and `audio_messages`, then remove only policies that grant public/anon access to those buckets. Do not alter another bucket, do not introduce signed URLs, and do not weaken server-service-role access.

- [ ] **Step 4: Apply only after approval and verify postflight**

Run: execute `supabase/migrations/20260712_02_private_media_storage.sql`, then `supabase/verification/20260712_storage_access_postflight.sql` and the regression matrix.

Expected: all proxy requests retain their expected statuses; every direct public URL/list/upload/replace/delete is denied.

- [ ] **Step 5: Roll back the batch if a proxy fails**

Reapply the exact prior bucket visibility and only the prior three bucket policies from a reviewed backup migration, then redeploy the last known-good Worker version. Do not roll back by opening all `storage.objects` policies globally. Re-run the matrix before declaring recovery.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260712_02_private_media_storage.sql supabase/verification/20260712_storage_access_postflight.sql tests/e2e/privateStorageRegression.md docs/DATABASE.md docs/DEPLOY.md
git commit -m "feat: make authorized media storage private"
```

### Task 13: Tighten table RLS/grants one domain at a time and remove obsolete references

**Files:**
- Create: `supabase/migrations/20260712_03_backend_authorization_rls.sql`
- Create: `supabase/verification/20260712_rls_postflight.sql`
- Create: `tests/e2e/roleRegression.md`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/DATABASE.md`
- Modify: `docs/DEPLOY.md`

**Interfaces:**
- Anon/authenticated can retain only anonymous-message SELECT/INSERT, subject to the database length constraint.
- Sensitive table access is service-role-only through authorized routes; `diaryInfo` remains untouched and `rss_articles` is absent from every statement.

- [ ] **Step 1: Write negative direct-access cases**

```markdown
| Identity | Operation | Target | Expected |
|---|---|---|---:|
| anon | SELECT | diaryContent | denied |
| anon | INSERT | health_conditions | denied |
| anon | UPDATE | yearly_summaries | denied |
| anon | SELECT/INSERT | anonymous_messages valid trimmed content | allowed |
| anon | UPDATE/DELETE | anonymous_messages | denied |
```

- [ ] **Step 2: Verify failures before the RLS migration**

Run: execute the matrix with the anon key in a non-production test project or approved production test harness.

Expected: existing broad policies demonstrate the current exposure; do not apply the migration until all replacement endpoints have passed their deployed role regression.

- [ ] **Step 3: Write a domain-scoped RLS/grant migration**

For diary/AI, health, yearly-summary, and audio tables, remove broad public ALL policies and revoke unneeded anon/authenticated privileges only after server APIs are live. Preserve anonymous-message SELECT/INSERT policies and check. Do not reference `diaryInfo`, `rss_articles`, or unrelated functions. Handle `rls_auto_enable()` only after a separate dependency/source review proves the narrow remediation safe.

- [ ] **Step 4: Apply incrementally and verify**

Run: apply one domain stanza at a time; after each stanza run `supabase/verification/20260712_rls_postflight.sql`, `pnpm test`, deployed role regression, and Cloudflare observability checks.

Expected: UI/API behavior remains correct for guest/viewer/admin, anonymous messages retain only their two allowed operations, and direct sensitive anon access is denied.

- [ ] **Step 5: Roll back a failing domain safely**

Restore only the reviewed prior policy/grant stanza for the failing domain, redeploy the previous Worker if necessary, and repeat its read/write regression. Never restore global public ALL access as an emergency shortcut.

- [ ] **Step 6: Update long-term documentation and commit**

Document final endpoint boundaries, secrets by stage (names only), private bucket behavior, session revocation through `SESSION_VERSION`, and the explicit exclusions. Do not record live secret values or one-time audit output.

```bash
git add supabase/migrations/20260712_03_backend_authorization_rls.sql supabase/verification/20260712_rls_postflight.sql tests/e2e/roleRegression.md README.md AGENTS.md docs/DATABASE.md docs/DEPLOY.md
git commit -m "feat: tighten backend authorization policies"
```

## Release verification and rollback checklist

- [ ] For every code batch run `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm build`, `pnpm cf:build`, and `pnpm exec wrangler deploy --dry-run`; treat `pnpm build` as insufficient without the OpenNext result.
- [ ] Before each deployment run `pnpm preview` in WSL/Linux, authenticate as guest/viewer/admin, verify Cookie attributes/expiry, all diary entry paths, yearly-image proxy, and admin audio Range. Check Worker logs for status/errors only, never secrets.
- [ ] Deploy code before database/policy changes. Keep old public reads only until proxy reads have deployed and client media reads have switched; keep no old direct writes after Batch 4’s scan is clean.
- [ ] Before each database migration, export/review the exact current policy, grant, constraint, function, and bucket definition for the named objects; store it in an approved operator-only rollback record, not the repository if it contains sensitive account metadata.
- [ ] If an application deployment fails before a schema/policy change, roll back to the prior Cloudflare Worker version and repeat the workerd-preview regression. If a schema/policy batch fails, restore only its reviewed prior SQL stanza, then roll back the Worker version if its API contract no longer matches.
- [ ] After final migration, check Supabase security/performance advisors, confirm `diaryInfo` remains present but unreferenced, confirm no `rss_articles` query/change occurred, and inspect `git diff` for accidental production configuration or secret changes.

## Plan self-review

- [x] Covers signed sessions, exact role durations, password configuration validation, `SESSION_VERSION`, Origin restrictions, and no browser token.
- [x] Covers every guest diary entry point, including forbidden-versus-missing semantics and future dates.
- [x] Covers all three fixed buckets, strict paths, version parameters, yearly cascade deletion, audio Range streaming, and DB-first/compensating media outcomes.
- [x] Preserves direct anonymous messages only, excludes `rss_articles`, and preserves the `diaryInfo` table.
- [x] Separates compatibility deployment from private-bucket and RLS/grant migration, with per-batch gates, read-only audits, verification, and bounded rollback.
- [x] Uses exact paths, TDD commands, frequent commits, and OpenNext/workerd preview verification.
