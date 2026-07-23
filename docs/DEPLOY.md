# Deployment

## Overview

Production targets Cloudflare Workers through the OpenNext Cloudflare adapter. Next.js is converted into a Worker entry plus static assets and deployed through OpenNext/Wrangler. README documents a GitHub-connected Workers Builds workflow from `main`; local scripts also support build, preview, dry-run, and direct deployment. The former Cloudflare Pages and `@cloudflare/next-on-pages` path is obsolete.

## Current deployment architecture

Repository-confirmed build path:

```text
Next.js source
→ `opennextjs-cloudflare build`
→ `.open-next/worker.js` + `.open-next/assets`
→ Cloudflare Workers
```

Historically documented automated path (Dashboard confirmation still required):

```text
GitHub `main`
→ Cloudflare Workers Builds (Linux, Node.js 22+)
→ `pnpm run cf:build`
→ `pnpm exec opennextjs-cloudflare deploy`
→ Worker `diaryproject`
```

Cloudflare was inspected read-only on 2026-07-12 and directly deployed on 2026-07-20. Worker identity, runtime bindings, custom domain, routes, versions, OAuth Workers write scope, and rollback capability are confirmed below. The current OAuth token cannot read the Workers Builds API, so the Git repository connection, production branch, root directory, and build/deploy commands still need Dashboard confirmation.

## Prerequisites

- Node.js `>=22` and pnpm `10.20.0`, from `package.json`.
- A Cloudflare account authorized to build/deploy Workers.
- A configured Supabase project and server runtime credentials.
- ModelScope/auth runtime credentials for enabled analysis and translation features.
- A Qwen3-Embedding-0.6B FastAPI service on `http://127.0.0.1:8000` for local knowledge indexing/search tests.
- Project-local `@opennextjs/cloudflare` and `wrangler`, installed with `pnpm install`.
- WSL Ubuntu or another Linux environment is recommended for local deployment work; README records Windows-generated OpenNext bundle issues.

## Relevant files

| File | Purpose |
|---|---|
| `package.json` | Node/pnpm requirements and Next.js/OpenNext/Wrangler scripts |
| `pnpm-lock.yaml` | Reproducible pnpm dependency graph |
| `next.config.mjs` | Unoptimized-image configuration; TypeScript build errors are enforced |
| `open-next.config.ts` | Default OpenNext Cloudflare adapter configuration |
| `wrangler.jsonc` | Worker name/entry, compatibility, assets, variable preservation, observability |
| `lib/runtimeEnv.ts` | Cloudflare runtime binding lookup with `process.env` fallback |
| `app/api/auth/route.ts` | Runtime password lookup and signed Cookie Session entry point |
| `lib/aiAnalysis.ts` | Runtime ModelScope token lookup |
| `lib/server/knowledgeEmbedding.ts` | Local Qwen3 FastAPI Embedding client |
| `supabase/migrations/20260719155837_knowledge_base_index.sql` | Applied private knowledge-index schema and RPCs |
| `supabase/migrations/20260720134848_modelscope_daily_quota.sql` | Required shared daily ModelScope call-budget table and reservation RPC |
| `.gitignore` | Excludes `.env*`, `.open-next/`, `.wrangler/`, generated types, logs, build output |

There is no `.env.example` in the repository.

The deployed backend-authorization routes use `SESSION_SECRET`, `SESSION_VERSION`, and `SUPABASE_SERVICE_ROLE_KEY` as Worker runtime secrets. They must never be added to `next.config.mjs` or browser code.

## Build commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm start
pnpm cf:build
pnpm cf-typegen
pnpm preview
pnpm run deploy
pnpm exec wrangler deploy --dry-run
```

- `pnpm build`: `next build`; validates Next.js but does not create a deployable Worker bundle.
- `pnpm cf:build`: produces `.open-next/` through `opennextjs-cloudflare build`.
- `pnpm preview`: builds and starts the OpenNext Cloudflare preview.
- `pnpm run deploy`: OpenNext build followed by deploy. Use `pnpm run` explicitly because `pnpm deploy` invokes pnpm's built-in command instead of this package script.
- `pnpm cf-typegen`: generates ignored `cloudflare-env.d.ts`.
- `pnpm lint`: runs ESLint 9 with the Next.js Core Web Vitals and TypeScript flat configuration.

## Environment variables

| Variable | Used by | Required | Secret | Stage and purpose |
|---|---|---|---|---|
| `SUPABASE_URL` | `lib/server/supabaseAdmin.ts` | Yes | No; still do not hard-code | Server runtime connection target |
| `SUPABASE_ANON_KEY` | Operator regression scripts only | Not required by the application | Public anon credential, not a server secret | Operator environment for direct-access verification |
| `MODELSCOPE_TOKEN_API_KEY` | `lib/aiAnalysis.ts` | For AI analysis and translation | Yes | Server runtime secret via Cloudflare binding or local `process.env` |
| `AUTH_PASSWORD_ADMIN` | `app/api/auth/route.ts` | For admin mode | Yes | Server runtime secret |
| `AUTH_PASSWORD_VIEWER` | `app/api/auth/route.ts` | For viewer mode | Yes | Server runtime secret |
| `SESSION_SECRET` | `lib/server/session.ts` | Yes | Yes | Server runtime secret; at least 32 bytes, used for HMAC Cookie signatures |
| `SESSION_VERSION` | `lib/server/session.ts` | Yes | Yes | Server runtime secret; increment after either auth password changes to invalidate existing sessions |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/server/supabaseAdmin.ts` | For protected backend APIs | Yes | Server runtime secret; never expose through `next.config.mjs` or browser modules |
| `APP_ORIGIN` | `lib/server/origin.ts` | Yes | Yes | Server runtime secret used to authorize production state-changing Origins |

Rules:

- Configure `SUPABASE_URL`, auth/session, Origin, service-role, and enabled AI variables in Worker runtime. Do not place credentials in `next.config.mjs`, browser code, logs, or source control.
- Configure the `LOGIN_RATE_LIMITER` Worker binding from `wrangler.jsonc`; it enforces five login attempts per 60 seconds by client IP. Do not rename or reuse namespace `2026071201` for an unrelated binding.
- Configure `ANONYMOUS_MESSAGE_RATE_LIMITER` from `wrangler.jsonc`; it enforces three anonymous-message writes per 60 seconds by client IP. Production message writes fail closed if the binding or trusted Cloudflare client IP is unavailable. Do not reuse namespace `2026071501`.
- Configure `AI_RATE_LIMITER` from `wrangler.jsonc`; it enforces five interactive AI analysis/translation/knowledge-search calls per 60 seconds by client IP. Production interactive AI calls fail closed if the binding or trusted Cloudflare client IP is unavailable. Administrator bulk indexing is an explicit maintenance action outside this interactive limiter. Do not reuse namespace `2026071502`.
- Use ignored `.dev.vars` for local workerd preview runtime values; `.env.local` supplies local Next.js runtime values but is not a substitute for Worker runtime bindings.
- Configure ModelScope and password credentials in deployed Worker runtime **Variables and Secrets**, preferably encrypted secrets.
- ModelScope analysis and translation share a Supabase-backed limit of 180 upstream HTTP attempts per Beijing calendar day. Local Embedding requests do not consume this counter.
- Workers Builds variables and deployed runtime variables are separate scopes. Current application environment lookup is runtime-only; configure deployed Worker bindings for live requests.
- `keep_vars: true` asks Wrangler to preserve dashboard-managed values during deployment; confirm behavior before changing it.
- Never use a Supabase service-role key as `SUPABASE_ANON_KEY`.

## Cloudflare configuration

- Platform: Workers, not Pages.
- Worker name: `diaryproject`.
- Adapter: `defineCloudflareConfig()` from `@opennextjs/cloudflare`.
- Worker entry: `.open-next/worker.js`.
- Static assets: `.open-next/assets`, bound as `ASSETS`.
- Compatibility date: `2026-07-08`.
- Compatibility flag: `nodejs_compat`.
- Observability: enabled.
- Variable preservation: `keep_vars: true`.
- Rate-limit bindings: `LOGIN_RATE_LIMITER` for five login calls, `ANONYMOUS_MESSAGE_RATE_LIMITER` for three message writes, and `AI_RATE_LIMITER` for five interactive AI/translation/knowledge-search calls per 60 seconds.
- Custom domain: `diary.wuzhizhii.com`, production environment.
- Zone routes: none target `diaryproject`; the custom domain targets the Worker directly.
- Runtime bindings declared by the repository: `ASSETS`, `LOGIN_RATE_LIMITER`, `ANONYMOUS_MESSAGE_RATE_LIMITER`, and `AI_RATE_LIMITER`. Configure the named runtime variables/secrets before enabling the corresponding features.
- Historical Worker versions and rollback capability are available.
- Production quota-protection version deployed on 2026-07-20: `6fb8845e-63f8-4488-961a-aa75b6c53af7`; immediate pre-deployment rollback version: `7acb2010-2b58-490e-9a6b-721e18772a79`.

OpenNext adapts App Router pages and API routes to Workers. Plain `next build` is useful validation but not the production artifact.

Cloudflare variables are plain configuration values; secrets are encrypted runtime values. Passwords, session material, service-role credentials, and ModelScope tokens belong in runtime secrets. `SUPABASE_URL` is non-secret runtime configuration; the application no longer compiles a Supabase anon client into browser code.

## Supabase integration

- Browser code uses same-origin APIs and does not require Supabase credentials in the build output.
- `/api/diary-download` is admin-only and uses `lib/server/supabaseAdmin.ts`; the service-role factory is not a browser import path.
- `/api/knowledge/index` and `/api/knowledge/search` are admin-only, use the same service-role boundary, and require the applied knowledge migration. Browser code never receives ModelScope or Supabase credentials.
- Analysis and translation require `reserve_modelscope_api_call()` before contacting ModelScope. Local indexing and knowledge search instead call `http://127.0.0.1:8000/embeddings` directly and do not reserve ModelScope quota.
- Administrator indexing remains request-bound. One click issues sequential API batches of up to ten sources without a batch/source cap; the server and client enforce at least two seconds between tasks/batches. It stops only when the queue is empty, a request fails, or three consecutive source failures preserve the failed rows and requeue unprocessed claimed rows. There is no automatic per-source retry.
- The fixed loopback Embedding address is intentionally local-test-only. Do not deploy this source expecting knowledge indexing/search to work in Cloudflare until the endpoint becomes explicit runtime configuration and is reachable from that runtime.
- Index failures are logged with structured category/status/code metadata. The service-role-only job row also stores bounded upstream and diary-content diagnostic excerpts; credential-like values are redacted. Treat `knowledge_index_jobs.last_error` as private diary data and never include it in public/admin status responses.
- RLS, grants, and Storage policies remain defense-in-depth and the boundary for operator direct-access tests; application requests use authorized server routes.
- Media reads use same-origin authorized proxy routes with the runtime service-role credential: diary and yearly images are versioned by their record timestamps, and admin audio supports HTTP Range streaming. All three media buckets are private and direct browser anon Storage access is denied.
- See [`DATABASE.md`](DATABASE.md) for tables, RLS, buckets, and path details.

## Deployment procedure

### Workers Builds (documented production path)

1. Confirm the intended commit/branch. README says `main`; verify Cloudflare dashboard state.
2. Confirm Node.js 22+ and repository root configuration.
3. Before deploying knowledge routes to a new environment, apply `20260719155837_knowledge_base_index.sql`, then apply `20260720134848_modelscope_daily_quota.sql` to the intended Supabase project and review security/performance advisors. Production has both migrations applied.
   The quota migration intentionally initializes its Beijing deployment date to 180 because earlier same-day calls are unknown; ModelScope features remain stopped until the next Beijing midnight.
4. Configure runtime variables/secrets for Supabase, ModelScope, and enabled auth modes.
5. Confirm all three Rate Limit bindings are present in the deployment configuration.
6. Validate locally where practical:

   ```bash
   pnpm install
   pnpm build
   pnpm cf:build
   pnpm exec wrangler deploy --dry-run
   ```

7. Push the intended commit to the connected branch.
8. Confirm build command `pnpm run cf:build` and deploy command `pnpm exec opennextjs-cloudflare deploy`.
9. Inspect build/deploy logs; plain Next.js success is not Worker verification.
10. Complete the checks below on the Worker URL and any custom domain.

### Local direct deployment

1. Confirm the knowledge-index migration and the ModelScope daily-quota migration are applied to the intended Supabase project before deploying source that includes ModelScope routes.
2. Authenticate Wrangler with the intended account.
3. Supply required local/build values without committing `.env.local`.
4. Run `pnpm cf:build` and optionally the Wrangler dry-run.
5. Run `pnpm run deploy`, or deploy an already-built bundle with `pnpm exec opennextjs-cloudflare deploy`.
6. Verify Worker behavior, variables, logs, routes, and domain.

The direct-deployment identity and Workers write scope were confirmed on 2026-07-20. Workers Builds repository/branch/command settings still require Dashboard confirmation.

## Post-deployment verification

- Homepage, styles, and static assets.
- Diary pagination/search/calendar/detail.
- `/api/auth` and `/api/auth/session`: valid viewer/admin Cookie-session behavior and invalid-password behavior.
- Guest/viewer/admin API and UI access, including guest denial and viewer read-only access for health data.
- `/api/anonymous-messages`: public three-column reads, 1–2000-character writes, server-only User-Agent capture, Origin rejection, and `429` behavior after the configured rate threshold. The legacy nullable `ip_address` column is not written by the current API.
- Authorized Supabase read/create/update/delete under production policies.
- Diary image proxy display, yearly-image proxy display, and admin audio Range streaming. Batch 3 production verification on 2026-07-13 returned `200 image/webp` for a viewer diary image and `206` with `Content-Range`/`Accept-Ranges` for admin audio.
- Batch 4 media writes, health, and yearly-summary metadata use authorized APIs. Batch 5 production verification on 2026-07-15 confirmed private buckets, denied direct anon Storage access, unchanged diary/yearly/audio proxies, denied anon access to every sensitive table, health/yearly admin CRUD, guest/viewer/admin role boundaries, and admin CSV export. The follow-up Worker and anonymous-message/function-ACL migrations were deployed the same day; public message GET/POST, User-Agent capture, wrong-year 404s, 413 handling, role boundaries, bindings, and both trigger postflights passed.
- AI analysis and translation with the runtime token.
- ModelScope shared quota: confirm reservation 180 succeeds, reservation 181 returns a clear `429` without an upstream call, counter/RPC errors return `503` without an upstream call, and the date rolls over at Beijing midnight. Verify analysis and translation share the counter; local indexing/search must not change it.
- Administrator knowledge status, initial pending count, batched backfill, retry behavior, semantic/date-filtered search, and source-diary navigation. Confirm guest/viewer requests are denied, direct anon/authenticated access to all three knowledge tables/functions is denied, and diary writes remain successful when later indexing fails.
- Verify uncapped continuation until the queue is empty, two-second pacing across task and batch boundaries, no automatic retry after a failed source, carry-over of consecutive-failure state between API batches, and stop/requeue behavior at the third consecutive failure.
- Verify new failure rows contain bounded diagnostic JSON without runtime credentials, and that the status API does not return `last_error` content.
- The initial 2026-07-20 knowledge rollout verified the default Worker hostname and custom domain, guest `401`, viewer `403`, admin status access, one-source Qwen3 indexing, hybrid search, and admin source-diary access.
- The later 2026-07-20 quota rollout deployed Worker `6fb8845e-63f8-4488-961a-aa75b6c53af7` after tests, Next.js/OpenNext builds, lint, and Wrangler dry-run passed. The custom domain returned `200` for homepage and guest/viewer/admin sessions, denied guest/viewer knowledge access with `401`/`403`, and returned a clear quota `429` to an admin sync at `call_count = 180`. Before and after the request, knowledge state remained 195 completed, 344 pending, 56 failed, and zero processing jobs; source diaries/jobs/chunks remained 595/595/210.
- Oversized JSON/multipart requests return `413`; invalid dates, field lengths, file types, and array sizes return `400` before downstream writes. ModelScope requests time out after 30 seconds, and the sixth interactive AI/translation/knowledge-search call in 60 seconds returns `429` for the same client IP.
- ModelScope SDK automatic retries remain disabled; any future explicit retry must reserve a new daily slot before the new upstream attempt.
- CSV export from `/api/diary-download`.
- Browser console/network errors and Cloudflare logs/observability.
- Default Worker hostname and custom domain, if configured; ensure DNS/routes do not target old Pages deployment.

## Rollback

Repository-confirmed source rollback:

1. Select/revert to a known-good Git commit.
2. Rebuild/redeploy that commit or push the revert to the production branch.
3. Repeat post-deployment verification.

Version history and rollback capability were verified again on 2026-07-20. List versions with `pnpm exec wrangler versions list --name diaryproject`; the immediate pre-quota-rollout target is `7acb2010-2b58-490e-9a6b-721e18772a79`, usable with `pnpm exec wrangler rollback 7acb2010-2b58-490e-9a6b-721e18772a79 --name diaryproject`. Roll back the Worker before removing database objects. The quota rollback `supabase/rollbacks/20260720134848_modelscope_daily_quota_rollback.sql` deletes only its reservation RPC and usage table, but must not run while the deployed Worker still depends on that RPC. The separate knowledge-index rollback removes derived knowledge settings, chunks, and jobs while preserving source diaries and the vector extension.

## Known deployment issues

- The old Pages/`@cloudflare/next-on-pages` chain is obsolete; README records dependency drift there even without source changes.
- `pnpm build` does not produce the OpenNext Worker artifact.
- Windows bundles may differ at preview/runtime; prefer Workers Builds or Linux/WSL.
- Build and runtime variable scopes are separate; current application secrets and Supabase server configuration are runtime-only.
- TypeScript build errors are enforced by `next.config.mjs`/Next.js.
- `pnpm lint` is a required local/CI gate and currently passes without warnings.
- Wrangler/API credentials may read project state but lack Workers Builds write permission.
- Custom-domain state is not versioned with the repository even though its current target was verified.
- Workers Builds values and Worker runtime secrets are separate; changing one scope does not update the other.
- The completed signed-session/private-media redesign has a historical specification at [`superpowers/specs/2026-07-12-stateless-session-backend-authorization-design.md`](superpowers/specs/2026-07-12-stateless-session-backend-authorization-design.md); current deployment behavior is documented here.

## Deployment change checklist

After deployment changes, verify:

- `package.json`, Node engine, package manager, and lockfile.
- `next.config.mjs`, browser variable exposure, and type-check behavior.
- `open-next.config.ts` adapter compatibility.
- `wrangler.jsonc` entry, assets, date/flags, bindings, observability, and `keep_vars`.
- Build-stage variables versus deployed runtime variables/secrets.
- Cloudflare account, branch, commands, routes, and custom domain.
- API routes and runtime environment lookup under Workers.
- Supabase RLS/Storage and the operator-only anon direct-access matrix.
- `pnpm build`, `pnpm cf:build`, and dry-run/preview where relevant.
- Post-deployment functionality, logs, this document, `AGENTS.md`, and README.
