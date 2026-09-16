# Deployment

## Overview

Production targets Cloudflare Workers through the OpenNext Cloudflare adapter. Next.js is converted into a Worker entry plus static assets and deployed through OpenNext/Wrangler. README documents a GitHub-connected Workers Builds workflow from `main`; local scripts also support build, preview, dry-run, and direct deployment. The former Cloudflare Pages and `@cloudflare/next-on-pages` path is obsolete.

## Active recall rollout boundary

The [private recall assistant](PRIVATE_RECALL_ASSISTANT.md) needs no new migration, environment variable, binding, or credential. It reuses the deployed index RPC, Workers AI, ModelScope priority list, per-attempt budget, and administrator authorization. Each request may make up to five existing search calls; planning makes no ModelScope call. Because those searches and ordered model attempts can make one response legitimately long, the authorized answer route streams padded NDJSON start/heartbeat events every ten seconds until its final result or safe error event. This keeps an otherwise silent connection active through network intermediaries without exposing diary text in heartbeat frames. The retired Phase 3 runtime and Ollama integration are absent from deployable source; dormant production `understanding_*` data is outside the request path.

## Current deployment architecture

Repository-confirmed build path:

```text
Next.js source
→ `opennextjs-cloudflare build`
→ `.open-next/worker.js` + `.open-next/assets`
→ Cloudflare Workers
```

Required automated path:

```text
GitHub `main`
→ Cloudflare Workers Builds (Linux, Node.js 22+)
→ `pnpm run cf:build`
→ `node scripts/deploy-worker.mjs`
→ Worker `diaryproject`
```

Cloudflare was inspected read-only on 2026-07-12, directly deployed again on 2026-07-23, and deployed with the accepted Fact Layer on 2026-07-30. Worker identity, runtime bindings, custom domain, routes, versions, OAuth Workers write scope, and rollback capability are confirmed below. A 2026-08-13 read-only Workers Builds API check confirmed GitHub repository `DazhiWu/diaryProject`, branch `main`, root `/`, build command `pnpm run cf:build`, and production deploy command `node scripts/deploy-worker.mjs`.

## Prerequisites

- Node.js `>=22` and pnpm `10.20.0`, from `package.json`.
- A Cloudflare account authorized to build/deploy Workers.
- A configured Supabase project and server runtime credentials.
- ModelScope/auth runtime credentials plus an ordered `MODELSCOPE_CHAT_MODEL` runtime variable for enabled analysis, translation, and factual-answer features.
- A Qwen3-Embedding-0.6B FastAPI service on `http://127.0.0.1:8000` for local knowledge document indexing.
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
| `scripts/deploy-worker.mjs` | Cross-platform Wrangler deploy wrapper that bypasses OpenNext's remote platform proxy |
| `lib/runtimeEnv.ts` | Local `process.env`-first lookup with Cloudflare binding fallback; production bindings remain authoritative |
| `app/api/auth/route.ts` | Runtime password lookup and signed Cookie Session entry point |
| `lib/server/modelScopeClient.ts` | Shared ModelScope client, ordered runtime model parsing, per-attempt quota/fallback, timeout, and safe error metadata |
| `lib/aiAnalysis.ts` | Diary analysis and translation orchestration |
| `lib/server/knowledgeAnswer.ts` | Fact Layer retrieval-to-generation orchestration and citation validation |
| `lib/server/knowledgeEmbedding.ts` | Local Qwen3 FastAPI Embedding client |
| `lib/server/workersAi.ts` | Workers AI query Embedding, vector normalization, and candidate reranking |
| `supabase/migrations/20260719155837_knowledge_base_index.sql` | Applied private knowledge-index schema and RPCs |
| `supabase/migrations/20260720134848_modelscope_daily_quota.sql` | Required shared daily ModelScope call-budget table and reservation RPC |
| `docs/archive/phase3/README.md` | Retired Phase 3 runtime boundary, historical designs, and never-applied SQL archive |
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
- `pnpm run deploy`: its `predeploy` lifecycle builds the OpenNext artifact, then the repository wrapper runs Wrangler with `OPEN_NEXT_DEPLOY=true`. Use `pnpm run` explicitly because `pnpm deploy` invokes pnpm's built-in command instead of this package script.
- `pnpm cf-typegen`: generates ignored `cloudflare-env.d.ts`.
- `pnpm lint`: runs ESLint 9 with the Next.js Core Web Vitals and TypeScript flat configuration.

## Environment variables

| Variable | Used by | Required | Secret | Stage and purpose |
|---|---|---|---|---|
| `SUPABASE_URL` | `lib/server/supabaseAdmin.ts` | Yes | No; still do not hard-code | Server runtime connection target |
| `SUPABASE_ANON_KEY` | Operator regression scripts only | Not required by the application | Public anon credential, not a server secret | Operator environment for direct-access verification |
| `MODELSCOPE_TOKEN_API_KEY` | `lib/server/modelScopeClient.ts` | For AI analysis, translation, and factual answers | Yes | Server runtime secret via Cloudflare binding or local `process.env` |
| `MODELSCOPE_CHAT_MODEL` | `lib/server/modelScopeClient.ts` | For AI analysis, translation, and factual answers | No; still server-only | English-comma-separated priority list via Cloudflare runtime variable or local `.env.local`; no source-code default |
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
- Configure `AI_RATE_LIMITER` from `wrangler.jsonc`; it enforces five interactive AI analysis/translation/knowledge-search/factual-answer calls per 60 seconds by client IP. Production interactive AI calls fail closed if the binding or trusted Cloudflare client IP is unavailable. Administrator bulk indexing is an explicit maintenance action outside this interactive limiter. Do not reuse namespace `2026071502`.
- Configure the Workers AI `AI` binding from `wrangler.jsonc`; OpenNext server code accesses it through `getCloudflareContext({ async: true })`. No Account ID, API Token, or model key belongs in source or runtime variables.
- `next.config.mjs` does not call `initOpenNextCloudflareForDev()`. Local development does not consume Cloudflare runtime bindings; OpenNext supplies the declared bindings only in the built/deployed Worker.
- `lib/runtimeEnv.ts` checks `process.env` first outside production and returns immediately when `.env.local` supplied the value. Only a missing local value may call `getCloudflareContext({ async: true })`; production checks Cloudflare bindings first and uses `process.env` only as fallback. Do not reverse this order: session verification reads both `SESSION_SECRET` and `SESSION_VERSION`, so binding-first local lookup causes unnecessary remote proxy connections per request.
- `cloudflare-env.d.ts` remains generated and ignored rather than hand-maintained. The package `prebuild` lifecycle runs the existing `pnpm cf-typegen` command before `next build`, so local builds, OpenNext, and clean Workers Builds all derive `CloudflareEnv` from the checked-in Wrangler configuration before TypeScript runs.
- Actual deployment uses `scripts/deploy-worker.mjs` rather than `opennextjs-cloudflare deploy`. Workers Builds runs `pnpm run cf:build` once, then calls the wrapper directly so the deploy stage reuses the generated `.open-next` artifact instead of invoking the package `predeploy` lifecycle and rebuilding it. OpenNext 1.20.1 loads the entire Wrangler environment through `getPlatformProxy()` before its cache-population step, which connects the Workers AI binding to the Access-protected `workers.dev` hostname and fails in non-interactive builds. This project uses the default OpenNext configuration and has no remote R2/KV/DO cache binding, so the wrapper safely deploys the generated Worker/assets with Wrangler while setting `OPEN_NEXT_DEPLOY=true` to prevent Wrangler from delegating back to OpenNext.
- Use ignored `.dev.vars` for local workerd preview runtime values; `.env.local` supplies local Next.js runtime values but is not a substitute for Worker runtime bindings.
- Configure `MODELSCOPE_CHAT_MODEL` as a deployed Worker runtime **Variable** and ModelScope/password credentials as runtime **Secrets**. Use English commas and list models in attempt order; changing the deployed order is a runtime-variable operation after this source feature is deployed.
- ModelScope analysis, translation, and factual-answer generation share a Supabase-backed limit of 180 upstream HTTP attempts per Beijing calendar day. Every attempted model reserves one slot immediately before its HTTP request; quota denial/unavailability stops fallback. The retry allowlist is network/timeout, HTTP 404/408/410/425/429/5xx, explicit model-level codes (`MODEL_NOT_FOUND`, `MODEL_UNAVAILABLE`, `MODEL_OVERLOADED`, `MODEL_NOT_SUPPORTED`, `MODEL_ACCESS_DENIED`), unreadable or malformed response bodies at the ModelScope SDK boundary, missing/blank completion content, invalid analysis output, and invalid factual-answer JSON/citations. HTTP 401 and ambiguous request-contract statuses such as 400/403/405/409/415/422 are terminal unless a listed model-level code is present. Configuration/quota failures, local `HttpError`, database failures, and unknown program errors never advance. Safe per-model logs include the model, outcome, and elapsed milliseconds but no prompt, diary evidence, provider response text, or credential. Zero-candidate answers, local document Embedding, and Workers-AI-only knowledge search do not consume this counter.
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
- Rate-limit bindings: `LOGIN_RATE_LIMITER` for five login calls, `ANONYMOUS_MESSAGE_RATE_LIMITER` for three message writes, and `AI_RATE_LIMITER` for five interactive AI/translation/knowledge-search/factual-answer calls per 60 seconds.
- Custom domain: `diary.wuzhizhii.com`, production environment.
- Zone routes: none target `diaryproject`; the custom domain targets the Worker directly.
- Runtime bindings declared by the repository: `ASSETS`, `AI`, `LOGIN_RATE_LIMITER`, `ANONYMOUS_MESSAGE_RATE_LIMITER`, and `AI_RATE_LIMITER`. Configure the named runtime variables/secrets before enabling the corresponding features.
- Workers AI query models are `@cf/qwen/qwen3-embedding-0.6b` and `@cf/baai/bge-reranker-base`. The Free Workers plan includes 10,000 Neurons per day; requests above that allocation fail. A paid Workers plan can charge usage above the allocation, so keep the current limiter and monitor account usage when the no-paid-service boundary is required.
- Historical Worker versions and rollback capability are available.
- Production Fact Layer version deployed and accepted on 2026-07-30: `b258ef8d-e303-42f2-941b-2dd72a2391ea`; immediate pre-Phase-2 rollback version: `b897c9f4-0e65-41d9-b5ae-2aafc0245b89`.
- Production quota-protection version deployed on 2026-07-20: `6fb8845e-63f8-4488-961a-aa75b6c53af7`; immediate pre-deployment rollback version: `7acb2010-2b58-490e-9a6b-721e18772a79`.

OpenNext adapts App Router pages and API routes to Workers. Plain `next build` is useful validation but not the production artifact.

Cloudflare variables are plain configuration values; secrets are encrypted runtime values. Passwords, session material, service-role credentials, and ModelScope tokens belong in runtime secrets. `SUPABASE_URL` and `MODELSCOPE_CHAT_MODEL` are non-secret server runtime configuration; the application no longer compiles a Supabase anon client or ModelScope configuration into browser code.

## Supabase integration

- Browser code uses same-origin APIs and does not require Supabase credentials in the build output.
- `/api/diary-download` is admin-only and uses `lib/server/supabaseAdmin.ts`; the service-role factory is not a browser import path.
- `/api/knowledge/index`, `/api/knowledge/search`, and `/api/knowledge/answer` are admin-only, use the same service-role boundary, and require the applied knowledge migration. Browser code never receives ModelScope or Supabase credentials.
- `/api/knowledge/answer` performs Origin, Cookie, input, and rate-limit checks before opening its `application/x-ndjson` stream. Start and ten-second heartbeat events are padded transport frames only. A final `result` event carries the normal answer DTO. Errors discovered after streaming begins use a final safe `error` event and include the application status because the HTTP status is already `200`; pre-stream boundary failures retain normal non-2xx responses.
- Analysis, translation, and factual-answer generation require `reserve_modelscope_api_call()` before every ModelScope HTTP attempt. Local `pnpm dev` retrieval calls `http://127.0.0.1:8000/embeddings` for query Embedding and skips reranking; deployed retrieval uses Workers AI query Embedding and reranking. Neither retrieval path reserves ModelScope quota.
- Administrator indexing remains request-bound and local-only. The production interface disables sync, rebuild, and retry controls, and the production index-maintenance POST API returns `409`; GET status and knowledge search remain available. One local click issues sequential API batches of up to ten sources without a batch/source cap; the server and client enforce at least two seconds between tasks/batches. It stops only when the queue is empty, a request fails, or three consecutive source failures preserve the failed rows and requeue unprocessed claimed rows. There is no automatic per-source retry.
- The fixed loopback Embedding address is intentionally local-only and remains required for administrator document indexing. The FastAPI implementation is currently maintained separately from this repository. Run it together with `pnpm dev`, and do not add or edit diaries during the indexing window. If a full rebuild is interrupted by network failure, rerun the full rebuild locally. Deployed knowledge search does not depend on Worker access to the loopback address; it requires the `AI` binding instead.
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
8. Confirm build command `pnpm run cf:build` and deploy command `node scripts/deploy-worker.mjs`. This separation builds the OpenNext artifact once and deploys that existing artifact; do not configure `pnpm run deploy` or `opennextjs-cloudflare deploy` as the Workers Builds deploy command.
9. Inspect build/deploy logs; plain Next.js success is not Worker verification.
10. Complete the checks below on the Worker URL and any custom domain.

### Local direct deployment

1. Confirm the knowledge-index migration and the ModelScope daily-quota migration are applied to the intended Supabase project before deploying source that includes ModelScope routes.
2. Authenticate Wrangler with the intended account.
3. Supply required local/build values without committing `.env.local`.
4. Run `pnpm cf:build` and optionally the Wrangler dry-run.
5. Run `pnpm run deploy`. For an already-built bundle, run `node scripts/deploy-worker.mjs`; do not use `opennextjs-cloudflare deploy`.
6. Verify Worker behavior, variables, logs, routes, and domain.

The direct-deployment identity and Workers write scope were confirmed again on 2026-07-23. The repository, branch, root, build command, and current production deploy command were API-confirmed again on 2026-08-13.

## Post-deployment verification

- Homepage, styles, and static assets.
- Diary pagination/search/calendar/detail.
- `/api/auth` and `/api/auth/session`: valid viewer/admin Cookie-session behavior and invalid-password behavior.
- Guest/viewer/admin API and UI access, including guest denial and viewer read-only access for health data.
- `/api/anonymous-messages`: public three-column reads, 1–2000-character writes, server-only User-Agent capture, Origin rejection, and `429` behavior after the configured rate threshold. The legacy nullable `ip_address` column is not written by the current API.
- Authorized Supabase read/create/update/delete under production policies.
- Diary image proxy display, yearly-image proxy display, and admin audio Range streaming. Batch 3 production verification on 2026-07-13 returned `200 image/webp` for a viewer diary image and `206` with `Content-Range`/`Accept-Ranges` for admin audio.
- Batch 4 media writes, health, and yearly-summary metadata use authorized APIs. Batch 5 production verification on 2026-07-15 confirmed private buckets, denied direct anon Storage access, unchanged diary/yearly/audio proxies, denied anon access to every sensitive table, health/yearly admin CRUD, guest/viewer/admin role boundaries, and admin CSV export. The follow-up Worker and anonymous-message/function-ACL migrations were deployed the same day; public message GET/POST, User-Agent capture, wrong-year 404s, 413 handling, role boundaries, bindings, and both trigger postflights passed.
- AI analysis, translation, and administrator factual answers with the runtime token.
- ModelScope ordered fallback and shared quota: confirm models are attempted in `MODELSCOPE_CHAT_MODEL` order and each allowlisted failure reserves another slot. Exercise network/timeout, the documented retryable HTTP/model codes, unreadable or malformed SDK response bodies, missing/blank content, invalid analysis output, and malformed factual-answer JSON/citations; the first usable result stops. Confirm safe logs expose only the model, outcome, elapsed milliseconds, status, and code. Confirm 401, ambiguous request-contract statuses, configuration/quota, database, and unexpected program errors do not advance and return a safe reason. Complete allowlisted exhaustion returns `所有模型 API 调用失败`. Confirm reservation 180 succeeds, reservation 181 returns a clear `429` without an upstream call, counter/RPC errors return `503` without an upstream call, and the date rolls over at Beijing midnight. Verify analysis, translation, and non-empty factual answers share the counter; zero-candidate answers, local indexing, and standalone Workers AI knowledge search must not change it.
- Administrator knowledge status, initial pending count, semantic/date-filtered search, and source-diary navigation. In production, confirm all maintenance POST actions return `409` and their UI controls are disabled. Run batched backfill and retry checks only from the local development server. Confirm guest/viewer requests are denied, direct anon/authenticated access to all three knowledge tables/functions is denied, and diary writes remain successful when later indexing fails.
- Workers AI knowledge search: as an administrator, enable “诊断模式” and confirm stage 1 shows the RPC-ordered candidates with fusion rank, date, title, chunk number, content, vector similarity, and RPC score; stage 2 maps each finite BGE result to the correct original candidate number; and stage 3 shows the merged/diversified final results. Confirm the query vector has 1,024 dimensions and unit norm through internal tests rather than returning it. Successful responses set `rerankApplied: true`; forced reranker failure keeps stage 1, leaves stage 2 empty, and preserves up to five vector-ordered final results with `rerankApplied: false`. Do not log the full vector or diary context during this check.
- Fact Layer: submit an administrator question with and without matching diary evidence. In browser network tooling, confirm the authorized answer response starts promptly as `application/x-ndjson`, receives a padded heartbeat at least every ten seconds while work remains pending, and ends with exactly one result or safe error event. Confirm supported answers contain only server-owned `S1`–`S8` citations whose cards open the correct source diaries; zero or valid model-declared inadequate evidence produces the explicit non-answer; reranker fallback is visible; duplicate submission is blocked; and guest/viewer/invalid-Origin requests are denied. Malformed provider JSON or citation IDs must switch to the next model without displaying/logging unvalidated text; complete allowlisted exhaustion returns `所有模型 API 调用失败`. Confirm no answer, citation, or conversation row is written.
- Locally verify uncapped continuation until the queue is empty, two-second pacing across task and batch boundaries, no automatic retry after a failed source, carry-over of consecutive-failure state between API batches, and stop/requeue behavior at the third consecutive failure.
- Verify new failure rows contain bounded diagnostic JSON without runtime credentials, and that the status API does not return `last_error` content.
- The initial 2026-07-20 knowledge rollout verified the default Worker hostname and custom domain, guest `401`, viewer `403`, admin status access, one-source Qwen3 indexing, hybrid search, and admin source-diary access.
- The later 2026-07-20 quota rollout deployed Worker `6fb8845e-63f8-4488-961a-aa75b6c53af7` after tests, Next.js/OpenNext builds, lint, and Wrangler dry-run passed. The custom domain returned `200` for homepage and guest/viewer/admin sessions, denied guest/viewer knowledge access with `401`/`403`, and returned a clear quota `429` to an admin sync at `call_count = 180`. Before and after the request, knowledge state remained 195 completed, 344 pending, 56 failed, and zero processing jobs; source diaries/jobs/chunks remained 595/595/210.
- Oversized JSON/multipart requests return `413`; invalid dates, field lengths, file types, or arrays return `400` before downstream writes. ModelScope analysis and translation attempts time out after 30 seconds; factual-answer attempts use 45 seconds and an 8,000-token completion budget because reasoning models count private reasoning before final `content`. The application validates only final `content` and never returns or logs `reasoning_content`. SDK abort, connection-timeout, and connection errors are identified by runtime type so minified Worker class names do not prevent ordered fallback. The sixth interactive AI/translation/knowledge-search/factual-answer call in 60 seconds returns `429` for the same client IP.
- ModelScope SDK automatic retries remain disabled. Ordered cross-model fallback is explicit application behavior, and every new upstream attempt reserves a new daily slot first.
- CSV export from `/api/diary-download`.
- Browser console/network errors and Cloudflare logs/observability.
- Default Worker hostname and custom domain, if configured; ensure DNS/routes do not target old Pages deployment.

## Rollback

Repository-confirmed source rollback:

1. Select/revert to a known-good Git commit.
2. Rebuild/redeploy that commit or push the revert to the production branch.
3. Repeat post-deployment verification.

Historical Worker versions remain available for source rollback. Dormant `understanding_*` objects are not part of application rollback: do not remove them while any older Worker exposing Phase 3 routes could still be restored. A later schema cleanup must use its own reviewed migration and backup. The ModelScope quota rollback must not run while deployed source still depends on it; the knowledge-index rollback removes only derived index objects and preserves source diaries.

## Local and deployed knowledge-query providers

`pnpm dev` uses the separately maintained FastAPI service at `127.0.0.1:8000` for both document and query Embedding. Query vectors are normalized before the existing Supabase RPC. Local search intentionally skips BGE reranking and returns `rerankApplied: false`, so it does not need Cloudflare Access, a remote development proxy, or network routing for workerd.

The deployed Worker uses the configured `AI` binding for Qwen3 query Embedding and BGE reranking. Production calls retain the 20-second Embedding and eight-second reranking deadlines and safe failure classifications. Reranker failure falls back to vector order; primary Embedding failure remains terminal. Because provider availability and ranking differ by environment, complete a short post-deployment recall smoke test before treating a release as accepted.

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
