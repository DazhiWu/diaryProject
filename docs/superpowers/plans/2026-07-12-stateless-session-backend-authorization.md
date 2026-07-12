# Stateless Session and Backend Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace browser-trusted authentication and sensitive anon Supabase/Storage access with signed Cookie sessions, authorized APIs, private proxied media, and least-privilege policies without a production access gap.

**Architecture:** Client components call same-origin App Router APIs. Server-only modules validate the session and Origin, then use an isolated service-role Supabase client; only the anonymous-message board retains the browser anon client. Media is authorized from metadata before streaming a fixed-bucket object, while DB-first media mutations return explicit partial-success results.

**Tech Stack:** Next.js 16 App Router, React 18, TypeScript, Supabase JS/PostgreSQL/Storage, Cloudflare Workers via OpenNext, Web Crypto, Cloudflare Rate Limiting binding, pnpm 10.20.0, Node.js 22+, Vitest (add as a development dependency).

**Revision note:** This revision removes the false local-only logout behavior, adds an explicit Cloudflare-compatible login-throttling task, strengthens production preflight rules, and makes `diaryContent.date` uniqueness an audited database invariant.

## Global Constraints

- Never print, commit, or put values for credentials, passwords, or secrets in browser code.
- `AUTH_PASSWORD_VIEWER` and `AUTH_PASSWORD_ADMIN` are nonempty, distinct server secrets; changing either requires incrementing server-only `SESSION_VERSION`.
- Viewer sessions are exactly 30 days; admin sessions are exactly 7 days; activity never renews them.
- This phase has no logout endpoint or logout control. Remove existing logout UI and hook methods instead of simulating logout by resetting local state while the HttpOnly Cookie remains valid.
- `POST /api/auth` is protected by a Cloudflare-compatible limiter configured as five attempts per 60 seconds for each production client IP and route. A missing production binding or missing trusted Cloudflare client-IP header fails closed before password comparison.
- In production, every state-changing request requires `Origin: https://diary.wuzhizhii.com` checked against server-only `APP_ORIGIN`; localhost is allowed only in local development. Temporary Cloudflare and `workers.dev` origins never authorize production writes.
- Guests may read only the dynamic `diaryContent ORDER BY date DESC LIMIT 5` set, including future dates; real-but-forbidden diary resources return 403 and absent resources return 404.
- `diaryContent.date` is globally unique. Existing duplicates block the schema batch; the database unique constraint is the final defense for new and date-edited diaries.
- `diaryContent.image_paths` is always `[]` or a valid array; use only bucket `2024To2025_diary_images`. Each diary image path's directory year and filename date must match the owning diary date. `yearly_images` uses only `2025_Summary_Images`; `audio_messages` uses only `audio_messages`.
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
| `lib/server/loginRateLimit.ts` | Login-attempt key derivation, Cloudflare binding access, local test adapter, and fail-closed production behavior. |
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

### Task 2: Prepare and execute the read-only production preflight without overstating completion

**Files:**
- Create: `supabase/verification/20260712_media_preflight.sql`
- Create: `supabase/verification/20260712_media_postflight.sql`
- Modify: `docs/DATABASE.md`

**Interfaces:**
- Consumes a read-only SQL-console role or approved read-only production connection.
- Produces zero-row violation queries for duplicate diary dates, malformed media metadata, mismatched diary path dates, duplicate object paths, and incompatible nullability.
- Produces a human-recorded, date-stamped execution result outside source control; the result contains counts/paths but never credentials.
- Preparing or committing the SQL does not complete the production-preflight step. Batch 0 remains blocked until the SQL was actually executed and every violation result set was empty.

- [ ] **Step 1: Write the preflight queries before migrations**

```sql
-- Every result set below must be empty before its matching constraint is installed.

-- A diary date may identify only one diary.
SELECT date, count(*) AS row_count, array_agg(id ORDER BY id) AS diary_ids
FROM public."diaryContent"
GROUP BY date
HAVING count(*) > 1;

-- image_paths must already be a non-null JSON array.
SELECT id, date, image_paths
FROM public."diaryContent"
WHERE image_paths IS NULL OR jsonb_typeof(image_paths) <> 'array';

-- Every diary image path must match the strict format, directory year, and full diary date.
WITH diary_paths AS (
  SELECT d.id, d.date, p.path, p.ordinality
  FROM public."diaryContent" AS d
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(d.image_paths) = 'array' THEN d.image_paths ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS p(path, ordinality)
)
SELECT id, date, path, ordinality
FROM diary_paths
WHERE path !~ '^[0-9]{4}/[0-9]{8}_[0-9]+\.webp$'
   OR split_part(path, '/', 1) <> to_char(date, 'YYYY')
   OR substring(split_part(path, '/', 2) FROM 1 FOR 8) <> to_char(date, 'YYYYMMDD');

-- A diary may not repeat a path inside its own JSON array.
WITH diary_paths AS (
  SELECT d.id, p.path
  FROM public."diaryContent" AS d
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(d.image_paths) = 'array' THEN d.image_paths ELSE '[]'::jsonb END
  ) AS p(path)
)
SELECT id, path, count(*) AS occurrences
FROM diary_paths
GROUP BY id, path
HAVING count(*) > 1;

-- A diary image path may belong to only one existing diary.
WITH diary_paths AS (
  SELECT d.id, p.path
  FROM public."diaryContent" AS d
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(d.image_paths) = 'array' THEN d.image_paths ELSE '[]'::jsonb END
  ) AS p(path)
)
SELECT path, count(DISTINCT id) AS diary_count, array_agg(DISTINCT id ORDER BY id) AS diary_ids
FROM diary_paths
GROUP BY path
HAVING count(DISTINCT id) > 1;

-- Yearly image paths must be present, strictly formatted, and unique among existing rows.
SELECT id, yearly_summary_id, storage_path
FROM public.yearly_images
WHERE storage_path IS NULL OR storage_path !~ '^yearly/[1-9][0-9]*\.webp$';

SELECT storage_path, count(*) AS row_count, array_agg(id ORDER BY id) AS image_ids
FROM public.yearly_images
WHERE storage_path IS NOT NULL
GROUP BY storage_path
HAVING count(*) > 1;

-- Audio paths must be root-level MP3 names and unique among existing rows.
SELECT id, audio_path
FROM public.audio_messages
WHERE audio_path IS NULL OR audio_path !~ '^[^/\\?%#]+\.mp3$';

SELECT audio_path, count(*) AS row_count, array_agg(id ORDER BY id) AS audio_ids
FROM public.audio_messages
WHERE audio_path IS NOT NULL
GROUP BY audio_path
HAVING count(*) > 1;
```

- [ ] **Step 2: Execute the SQL read-only and record the real completion state**

Run: execute `supabase/verification/20260712_media_preflight.sql` against production using the Supabase SQL editor or another explicitly approved read-only connection.

Expected: every violation result set is empty.

Completion rules:

1. If Codex has no production connection, it must stop after generating the SQL, list the exact manual execution steps, leave this checkbox unchecked, and report Batch 0 as blocked.
2. A generated SQL file, a syntax check, or a local test does not count as production execution.
3. If any query returns a row, stop the affected migration batch and request a separately approved data-repair decision. Do not coerce or silently repair production rows in application code.
4. Record only the execution date, operator, query status, and empty/nonempty outcome outside source control. Do not paste credentials or secret-bearing metadata into the repository.

- [ ] **Step 3: Add postflight assertions for columns, unique constraints, and the sequence ledger**

```sql
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('diaryContent', 'yearly_images', 'audio_messages')
  AND column_name IN ('date', 'image_paths', 'storage_path', 'audio_path')
ORDER BY table_name, column_name;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('diaryContent', 'yearly_images', 'audio_messages')
  AND (
    indexdef ILIKE '%UNIQUE%date%'
    OR indexdef ILIKE '%UNIQUE%storage_path%'
    OR indexdef ILIKE '%UNIQUE%audio_path%'
  )
ORDER BY tablename, indexname;

SELECT date, last_sequence
FROM public.diary_image_sequences
ORDER BY date DESC
LIMIT 5;
```

- [ ] **Step 4: Document the audit procedure and its blocking semantics**

Add a concise `docs/DATABASE.md` migration-preflight subsection. Document the commands, the requirement that all result sets are empty, the manual-execution handoff when production access is unavailable, and the rule that unexecuted production checks remain unchecked. Do not commit live result values.

- [ ] **Step 5: Commit the prepared verification assets**

```bash
git add supabase/verification/20260712_media_preflight.sql supabase/verification/20260712_media_postflight.sql docs/DATABASE.md
git commit -m "docs: add authorization migration preflight checks"
```

The commit may be created before manual production execution, but Task 2 and the Batch 0 deployment gate remain incomplete until Step 2 is actually executed with empty results.

## Batch 1: Signed session, Origin boundary, and server admin client

**Deployment gate:** `pnpm test tests/server/session.test.ts tests/server/origin.test.ts tests/server/loginRateLimit.test.ts tests/server/supabaseAdmin.test.ts`, `pnpm exec tsc --noEmit`, `pnpm build`, `pnpm cf:build`, `pnpm exec wrangler deploy --dry-run`, and a `pnpm preview` login-throttling smoke test pass. Configure the new server secrets, `APP_ORIGIN`, and `LOGIN_RATE_LIMITER` runtime binding before enabling login; do not add secret values to `next.config.mjs`. Confirm there is no logout control or local-only logout method.

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

### Task 4: Add Cloudflare-compatible login throttling with fail-closed production behavior

**Files:**
- Create: `lib/server/loginRateLimit.ts`
- Create: `tests/server/loginRateLimit.test.ts`
- Modify: the repository's existing Wrangler configuration file, using its current format (`wrangler.jsonc` or `wrangler.toml`) and never creating a second competing config file
- Regenerate: `worker-configuration.d.ts` when this file is tracked by the repository

**Interfaces:**
- Produces `type LoginRateLimitDecision = { allowed: boolean; retryAfterSeconds: number }`.
- Produces `checkLoginRateLimit(request: Request): Promise<LoginRateLimitDecision>`.
- Production uses a binding named `LOGIN_RATE_LIMITER`, configured for five calls per 60 seconds with namespace ID `2026071201`; verify that this namespace ID is not already assigned to an unrelated binding before committing it.
- Production derives the key from `CF-Connecting-IP` as `auth:${clientIp}` and fails closed with a safe 503 when either the trusted Cloudflare IP header or binding is unavailable.
- Local development and unit tests use an injected/process-local fixed-window adapter keyed by the first `X-Forwarded-For` value or `127.0.0.1`; this fallback must never be selected when the deployment mode is production.

- [ ] **Step 1: Write failing limiter tests**

```ts
it('allows five attempts and rejects the sixth for the same client key', async () => {
  const limiter = createMemoryLoginLimiter({ limit: 5, periodSeconds: 60, now: () => 1_000 })
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await expect(limiter.limit('auth:203.0.113.10')).resolves.toEqual({ allowed: true, retryAfterSeconds: 60 })
  }
  await expect(limiter.limit('auth:203.0.113.10')).resolves.toEqual({ allowed: false, retryAfterSeconds: 60 })
})

it('keeps different client keys independent', async () => {
  const limiter = createMemoryLoginLimiter({ limit: 1, periodSeconds: 60, now: () => 1_000 })
  await expect(limiter.limit('auth:203.0.113.10')).resolves.toMatchObject({ allowed: true })
  await expect(limiter.limit('auth:203.0.113.11')).resolves.toMatchObject({ allowed: true })
})

it('fails closed when the production binding or trusted IP header is missing', async () => {
  await expect(checkLoginRateLimit(productionRequestWithoutCloudflareIp(), { binding: undefined })).rejects.toMatchObject({ status: 503 })
})
```

- [ ] **Step 2: Run the focused failure**

Run: `pnpm test tests/server/loginRateLimit.test.ts`

Expected: missing module/function failures.

- [ ] **Step 3: Implement the adapter and Cloudflare binding access**

Use `getCloudflareContext().env.LOGIN_RATE_LIMITER` in the Cloudflare runtime. Configure the existing Wrangler file with one rate-limiting binding:

```jsonc
{
  "ratelimits": [
    {
      "name": "LOGIN_RATE_LIMITER",
      "namespace_id": "2026071201",
      "simple": { "limit": 5, "period": 60 }
    }
  ]
}
```

Merge this entry into the existing configuration instead of replacing other bindings. In TOML, use the equivalent `[[ratelimits]]` shape. The production adapter calls `limit({ key })` and converts `{ success: false }` into `{ allowed: false, retryAfterSeconds: 60 }`.

Do not log the supplied password, Cookie, session token, raw request body, client IP, or secrets. Production binding/header failures throw a safe 503 error and never fall back to process-local counters.

- [ ] **Step 4: Regenerate types and verify unit/local binding behavior**

Run:

```bash
pnpm exec wrangler types --env-interface CloudflareEnv
pnpm test tests/server/loginRateLimit.test.ts
pnpm cf:build
pnpm preview
```

Expected: the focused tests pass, OpenNext builds, and the local preview exposes the configured binding or the explicitly selected local adapter without selecting the development fallback in a production-mode test.

- [ ] **Step 5: Verify missing-binding safety**

Run the focused production-mode test with the binding absent and with `CF-Connecting-IP` absent.

Expected: safe 503, no password comparison interface is invoked by consumers, and no fallback to process-local state occurs.

- [ ] **Step 6: Commit**

```bash
WRANGLER_CONFIG="$(git ls-files 'wrangler.jsonc' 'wrangler.toml' | head -n 1)"
test -n "$WRANGLER_CONFIG"
git add lib/server/loginRateLimit.ts tests/server/loginRateLimit.test.ts "$WRANGLER_CONFIG"
if git ls-files --error-unmatch worker-configuration.d.ts >/dev/null 2>&1; then git add worker-configuration.d.ts; fi
git commit -m "feat: add login rate limiter"
```

### Task 5: Enforce Origin, expose auth endpoints, and remove browser-trusted auth state

**Files:**
- Create: `lib/server/origin.ts`
- Create: `tests/server/origin.test.ts`
- Modify: `app/api/auth/route.ts`
- Create: `app/api/auth/session/route.ts`
- Modify: `hooks/useAuth.ts`
- Modify: `app/page.tsx`
- Modify: auth-related caller component files identified by the required search; list their exact paths in the execution report before editing

**Interfaces:**
- Consumes `checkLoginRateLimit(request)` from Task 4.
- `assertAllowedOrigin(request: Request): void` throws 403 for no/foreign production Origin.
- `GET /api/auth/session` returns `{ role: 'guest' | 'viewer' | 'admin' }` and clears invalid cookies where practical.
- `POST /api/auth` returns `{ role: 'viewer' | 'admin' }` plus only an HttpOnly `Set-Cookie` header.
- `useAuth` exposes session loading and login refresh behavior, but no `logout()` method in this phase.

- [ ] **Step 1: Write failing Origin, endpoint, and throttling-integration tests**

```ts
it('accepts only configured production Origin for writes', () => {
  expect(() => assertAllowedOrigin(new Request('https://worker/api', { method: 'POST', headers: { Origin: 'https://diary.wuzhizhii.com' } }))).not.toThrow()
  expect(() => assertAllowedOrigin(new Request('https://worker/api', { method: 'POST', headers: { Origin: 'https://x.example' } }))).toThrow(/403/)
})
it('session endpoint never returns a token', async () => {
  const response = await GET(new Request('https://worker/api/auth/session'))
  expect(await response.json()).toEqual({ role: 'guest' })
})
it('returns 429 before password comparison after the limit is exhausted', async () => {
  const response = await invokeLoginWithRejectedLimiter()
  expect(response.status).toBe(429)
  expect(response.headers.get('Retry-After')).toBe('60')
  expect(passwordComparator).not.toHaveBeenCalled()
})
```

Before editing, run:

```bash
rg -n 'diaryAppAuth(Level|Status)|\blogout\b|退出登录|登出' app components hooks lib
```

Record every auth-related result so the implementation removes the real callers instead of leaving an unreachable fake logout branch.

- [ ] **Step 2: Run the failure**

Run: `pnpm test tests/server/origin.test.ts tests/server/loginRateLimit.test.ts`

Expected: missing module/handler or integration failures.

- [ ] **Step 3: Implement routes, limiter integration, and localStorage removal without fake logout**

`POST /api/auth` validates bounded JSON and the configured Origin, then calls `checkLoginRateLimit(request)` before password comparison. A rejected decision returns generic JSON with status 429 and `Retry-After: 60`. A limiter configuration failure returns safe 503. An allowed attempt compares both role passwords without revealing which comparison failed, applies the uniform invalid-credential delay, and sets the signed session Cookie on success. Successful attempts also consume a limiter token.

`useAuth` loads `/api/auth/session`, updates local React state after successful login, deletes `diaryAppAuthLevel`/`diaryAppAuthStatus` migration remnants, and removes storage-event synchronization.

Remove the existing logout method and logout UI. Do not implement a local-state-only reset because the HttpOnly Cookie would remain valid and restore the session on refresh. Do not add a logout endpoint or Cookie-clearing route in this phase.

- [ ] **Step 4: Verify security, throttling, and no-logout behavior**

Run:

```bash
pnpm test tests/server/origin.test.ts tests/server/loginRateLimit.test.ts tests/server/session.test.ts
rg -n 'diaryAppAuth(Level|Status)|\blogout\b|退出登录|登出' hooks/useAuth.ts app/page.tsx components
```

Expected: tests pass; the final search has no auth-related localStorage state, logout hook method, or rendered logout control. Review any unrelated textual match manually before completion.

Start `pnpm preview`, then send six valid-Origin login attempts from the same local test key. Expected: the first five reach credential handling and the sixth returns 429 with `Retry-After: 60`. Repeat with a different local forwarded IP and confirm its counter is independent. Do not use real password values in recorded output.

- [ ] **Step 5: Commit**

```bash
git add lib/server/origin.ts tests/server/origin.test.ts app/api/auth/route.ts app/api/auth/session/route.ts hooks/useAuth.ts app/page.tsx components
git commit -m "feat: enforce origin and cookie authentication"
```

### Task 6: Isolate the privileged client

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

### Task 7: Enforce latest-five access and 403/404 semantics in one server module

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

### Task 8: Move diary writes, analysis, translation, and export behind role guards

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

Require session/role before all protected work. Move the `components/diary-detail.tsx` direct `diaryContent` update and `saveAIAnalysis()` into the authorized API transaction flow. Make viewer AI/CSV buttons absent, retain translation for viewer/admin, and map errors to safe 401/403/400 responses without Supabase details. Detect the database unique-date violation and return a safe conflict response instead of exposing PostgreSQL or Supabase error text.

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

### Task 9: Add audited diary-date and media constraints with a sequence ledger

**Files:**
- Create: `supabase/migrations/20260712_01_media_invariants.sql`
- Create: `tests/server/pathRules.test.ts`
- Create: `lib/server/pathRules.ts`

**Interfaces:**
- Produces `parseDiaryImagePath(path)`, `assertDiaryImagePathMatchesDate(path, diaryDate)`, `parseYearlyImagePath(path)`, `parseAudioPath(path)`, and `parseSingleRange(header, size)`.
- Migration creates or verifies a database unique constraint/index for `diaryContent.date`, creates `public.diary_image_sequences(date date primary key, last_sequence integer not null check (last_sequence >= 0))`, and installs trigger-enforced media invariants.
- The migration includes a reviewed rollback section that removes only objects introduced by this migration and never drops user data.

- [ ] **Step 1: Write path and Range failures first**

```ts
it.each(['', '../x.webp', '2026//20260118_1.webp', '2026/20260118_1.webp?x=1', '2026%2f20260118_1.webp'])('rejects diary path %s', (path) => {
  expect(() => parseDiaryImagePath(path)).toThrow()
})
it('accepts exactly a diary date-matched webp path', () => {
  expect(parseDiaryImagePath('2026/20260118_1.webp')).toEqual({ date: '2026-01-18', sequence: 1 })
  expect(() => assertDiaryImagePathMatchesDate('2026/20260118_1.webp', '2026-01-18')).not.toThrow()
})
it('rejects a mismatched directory year even when the filename date matches', () => {
  expect(() => assertDiaryImagePathMatchesDate('2025/20260118_1.webp', '2026-01-18')).toThrow()
})
it('rejects a filename date that differs from the owning diary date', () => {
  expect(() => assertDiaryImagePathMatchesDate('2026/20260119_1.webp', '2026-01-18')).toThrow()
})
it('returns 416 for an unsatisfiable Range', () => {
  expect(() => parseSingleRange('bytes=20-30', 20)).toThrow(/416/)
})
```

- [ ] **Step 2: Run the test**

Run: `pnpm test tests/server/pathRules.test.ts`

Expected: module-not-found failure.

- [ ] **Step 3: Implement SQL and pure validation**

The migration first relies on the completed Batch 0 preflight. It adds or verifies a unique constraint/index on `diaryContent.date`; if duplicate dates exist, the migration must abort without changing data. It sets `diaryContent.image_paths DEFAULT '[]'::jsonb NOT NULL`, requires an array, adds a trigger that validates strict path format, directory year, filename date, owning diary date, global path ownership, and duplicate array elements, prevents date change while `image_paths` is nonempty, and atomically upserts the per-date high-water ledger. Empty-image diaries may change date, with the database date-unique constraint remaining the final concurrency defense. It makes `yearly_images.storage_path NOT NULL` with a unique constraint and format trigger, preserves its cascade FK, and adds unique/MP3-root validation for `audio_messages.audio_path`. Include explicit rollback SQL for the newly introduced constraints, triggers, functions, and sequence ledger. Do not include `rss_articles` or `diaryInfo` in this SQL.

- [ ] **Step 4: Verify locally and in read-only postflight**

Run: `pnpm test tests/server/pathRules.test.ts && pnpm exec tsc --noEmit`

Expected: tests/type-check pass. After an approved migration execution, run `supabase/verification/20260712_media_postflight.sql`; expected output confirms `diaryContent.date` uniqueness, `image_paths` default/non-null state, yearly/audio unique constraints, and sequence-ledger availability. Re-run the preflight violation queries and require empty results.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260712_01_media_invariants.sql lib/server/pathRules.ts tests/server/pathRules.test.ts
git commit -m "feat: enforce media path invariants"
```

### Task 10: Implement streaming, authorized media proxies and switch reads

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
- `diaryMediaUrl(path, modifiedAt)` returns `/api/media/diary?path=${encodeURIComponent(path)}&v=${encodeURIComponent(modifiedAt)}`.
- `yearlyMediaUrl(path, updatedAt)` returns the equivalent URL using `encodeURIComponent(storagePath)` and `encodeURIComponent(updatedAt)`.
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

Expected: OpenNext starts a local workerd preview. In a second terminal, select one existing `audio_messages.audio_path` from the completed read-only preflight, export it as `KNOWN_MP3_PATH`, request a known diary proxy image, and run:

```bash
ENCODED_MP3_PATH="$(python -c 'import os, urllib.parse; print(urllib.parse.quote(os.environ["KNOWN_MP3_PATH"]))')"
curl -i -H 'Range: bytes=0-1023' "http://localhost:8787/api/media/audio?path=${ENCODED_MP3_PATH}"
```

Use an admin session Cookie for the request. Expected: the image renders through `/api/media/diary`; audio returns `206` with `Accept-Ranges: bytes` and `Content-Range`, and Worker logs show no full-object memory read.

- [ ] **Step 6: Commit**

```bash
git add lib/server/media.ts app/api/media app/page.tsx components/diary-detail.tsx components/diary-list.tsx components/yearly-summary.tsx lib/audioHandler.ts tests/api/mediaProxy.test.ts
git commit -m "feat: proxy authorized media reads"
```

## Batch 4: Admin media mutations and remaining domain APIs

**Deployment gate:** Every mutation needs a valid admin Cookie, valid production Origin, and an explicit partial-success UI test. Buckets remain public until all write callers are server APIs and the direct-client scan is clean.

### Task 11: Add diary, yearly, and audio mutation workflows

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

### Task 12: Move health and yearly-summary metadata behind APIs; preserve anonymous messages

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

### Task 13: Make Storage private only after proxy/write migration is proven

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

### Task 14: Tighten table RLS/grants one domain at a time and remove obsolete references

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
- [ ] Before enabling login in production, verify `LOGIN_RATE_LIMITER` is bound, five same-key attempts are allowed per 60-second window, the sixth returns 429 with `Retry-After: 60`, and a missing production binding returns 503 before password comparison.
- [ ] Confirm the final UI and `useAuth` API contain no logout control or local-only logout method; session termination in this phase occurs only by expiry, invalid Cookie, or `SESSION_VERSION` change.
- [ ] Deploy code before database/policy changes. Keep old public reads only until proxy reads have deployed and client media reads have switched; keep no old direct writes after Batch 4’s scan is clean.
- [ ] Before each database migration, export/review the exact current policy, grant, constraint, function, and bucket definition for the named objects; store it in an approved operator-only rollback record, not the repository if it contains sensitive account metadata.
- [ ] If an application deployment fails before a schema/policy change, roll back to the prior Cloudflare Worker version and repeat the workerd-preview regression. If a schema/policy batch fails, restore only its reviewed prior SQL stanza, then roll back the Worker version if its API contract no longer matches.
- [ ] After final migration, check Supabase security/performance advisors, confirm `diaryInfo` remains present but unreferenced, confirm no `rss_articles` query/change occurred, and inspect `git diff` for accidental production configuration or secret changes.

## Plan self-review

- [x] Covers signed sessions, exact role durations, password configuration validation, `SESSION_VERSION`, Origin restrictions, no browser token, and removal of false local-only logout behavior.
- [x] Contains an explicit five-attempt/60-second Cloudflare login-throttling task with 429 behavior, local tests, binding configuration, and fail-closed production handling.
- [x] Covers every guest diary entry point, including forbidden-versus-missing semantics and future dates.
- [x] Audits and enforces `diaryContent.date` uniqueness, non-null JSON-array image paths, directory-year/date matching, and globally unique media ownership.
- [x] Makes actual production preflight execution a blocking step and prohibits marking it complete when Codex only generated SQL.
- [x] Covers all three fixed buckets, strict paths, version parameters, yearly cascade deletion, audio Range streaming, and DB-first/compensating media outcomes.
- [x] Preserves direct anonymous messages only, excludes `rss_articles`, and preserves the `diaryInfo` table.
- [x] Separates compatibility deployment from private-bucket and RLS/grant migration, with per-batch gates, read-only audits, verification, and bounded rollback.
- [x] Uses exact paths, TDD commands, frequent commits, and OpenNext/workerd preview verification.
