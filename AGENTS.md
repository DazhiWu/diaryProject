# AGENTS.md

## Project overview

This is a personal diary application built with Next.js and Supabase. It supports diary CRUD, image/audio uploads, search/calendar views, health tracking, anonymous messages, CSV export, yearly summaries, and an admin-only private knowledge index plus cited factual answers. Server API routes call an ordered runtime-configured ModelScope chat-model list for title/emotion analysis, translation, and grounded answer generation. Phase 3A extraction/summary generation and Phase 3D period comparison generation call a local Ollama chat model. Local knowledge indexing calls a Qwen3-Embedding-0.6B FastAPI service; online knowledge queries and candidate reranking use Cloudflare Workers AI. Guest, viewer, and admin UI modes use simple password checks.

## Tech stack

- Next.js 16 App Router, React 18, strict TypeScript, Tailwind CSS 4
- pnpm 10.20.0 and Node.js 22+
- Supabase PostgreSQL and Storage
- ModelScope OpenAI-compatible API with an ordered server runtime model list; local Ollama `qwen3.5:4b`; local Qwen3-Embedding-0.6B FastAPI service
- Cloudflare Workers and Workers AI through OpenNext and Wrangler

## Development environment

- Prefer WSL Ubuntu for development and OpenNext checks.
- Install with `pnpm install`; preserve `pnpm-lock.yaml` and do not add npm/Yarn lockfiles.
- Run with `pnpm dev`.
- Use `pnpm build` for Next.js validation and `pnpm cf:build` for the Cloudflare artifact.
- Keep local values in ignored `.env.local` files and never commit credentials.

## Project structure

- `app/`: App Router application, styles, and API routes.
- `components/`: business and UI components, including the administrator knowledge-base view.
- `hooks/`: authentication state and health-condition hooks.
- `lib/`: Supabase access, business APIs, media, environment lookup, AI, and utilities.
- `public/`: static placeholder assets.
- `test_extra/`: partial SQL helpers, experiments, and UI automation; not a complete migration/test suite.
- `docs/`: detailed database/storage and deployment documentation.
- `next.config.mjs`, `open-next.config.ts`, `wrangler.jsonc`: deployment configuration.

## Architecture summary

- `app/page.tsx` is a small entry point; `useDiaryController` owns diary behavior and `DiaryAppShell` composes list/calendar/create/edit/detail, export, yearly-summary, message, and audio views.
- Browser application data access uses same-origin APIs, including anonymous messages. The database is intended to retain direct anon SELECT only for `anonymous_messages.id/content/created_at`; the application no longer ships a shared Supabase browser client or local diary backup.
- ModelScope-backed routes keep the token and ordered `MODELSCOPE_CHAT_MODEL` list server-side, enforce 50,000-character analysis/translation input and 500-character factual questions, use a 30-second timeout per attempted model, and share five interactive calls per IP per 60 seconds through `AI_RATE_LIMITER`. Explicit fallback is allowlisted: network/timeout, HTTP 404/408/410/425/429/5xx, explicit model-level provider codes, missing/blank completion content, invalid analysis output, and invalid factual-answer JSON/citations advance. Authentication/configuration/quota, ambiguous request-contract HTTP failures, database failures, local `HttpError`, and unknown program errors remain terminal with safe user feedback. The download route returns safely escaped CSV with byte-accurate length.
- `/api/auth` writes a signed HttpOnly Cookie and `/api/auth/session` is the browser role source. This is not Supabase Auth; sessions use `SESSION_VERSION`, not a database session table.
- Images are compressed to WebP in the browser and referenced by relative paths. New uploads use insert-only semantics; explicit replacement routes use upsert on the existing path.
- Diary detail timestamps intentionally apply the product-required `+16` hour adjustment.
- Diary and yearly media read through fixed-bucket proxies; diary inherits latest-five/viewer/admin access, yearly is readable by all roles, and audio is admin-only with single-range streaming. All three media buckets are private; browser anon Storage access is denied.
- Yearly routes scope every nested event, section, opinion, and image mutation to the summary identified by the URL year. Request parsers centrally enforce byte, character, date, array, file-size, MIME, and extension limits before writes.
- The admin-only knowledge base uses queued diary indexing, newline-first chunks, SHA-256 idempotency, 1024-dimensional Qwen3 embeddings, exact vector scans plus literal keyword fusion, optional date filters, and source-diary navigation. Single and consecutive newlines are equal highest-priority boundaries; adjacent short segments target 400–700 characters with an 800-character hard maximum, while long lines fall back to complete-sentence boundaries and sentence overlap. Local requests target `http://127.0.0.1:8000/embeddings` only for document indexing, use `document` input, and send at most 16 texts per request. Online search uses the Workers AI Qwen3 model for a normalized query vector, asks the existing Supabase RPC for 20 fused candidates, and uses the Workers AI BGE reranker for the top five. Search merges adjacent hits and keeps at most two independent results per diary. Its optional admin diagnostic mode exposes the ordered RPC candidates, raw valid reranker results with their original candidate numbers, and final merged/diversified results; the full query vector is never returned. Embedding failure returns a generic 503; reranker failure falls back to vector-similarity order. Diary mutations enqueue work through a database trigger and never wait for Embedding; index replacement is transactional through a service-role-only RPC.
- Administrator factual answers reuse that search pipeline and pass at most five final excerpts to the configured ModelScope chat models. The server assigns `S1`–`S5`, treats diary text as untrusted quoted data, and validates structured output plus inline citation IDs inside each model attempt. Expected JSON/citation-contract failures switch models without logging or displaying unvalidated text; unexpected parser/program errors remain terminal. Accepted IDs map back to server-owned metadata, and valid insufficient-evidence output returns the fixed non-answer. Zero-candidate requests do not contact or reserve ModelScope. Answers, citations, and conversations are not persisted.
- Phase 2 is committed as `0bc4b45`, deployed as Worker version `b258ef8d-e303-42f2-941b-2dd72a2391ea`, and accepted in production. Phase 3 may begin with the operator-approved frozen corpus of 598 completed indexed sources. Pending daily diaries are outside that development corpus and must not be counted as analyzed; after feature completion, finish the backlog and regenerate affected derived data before Phase 3 production acceptance.
- Phase 3A/3B is implemented and operator-accepted locally as an administrator theme-timeline and observation-review slice; its schema migrations are applied in production through `20260731071402_phase3_summary_regeneration`. Each run freezes the approved 598-source fingerprint and exact IDs/hashes, processes its date range through frozen Ollama settings, and preserves reviewed observations plus immutable evidence and summary history. Phase 3C implements an explicit, versioned PostgreSQL aggregation over one completed/current, non-stale run. Source migration `20260803021419_phase3_corpus_aggregation.sql` was applied to production as `20260803025058_phase3_corpus_aggregation`; Worker `cd1f5f09-a607-4781-8be0-36eba039762f` is deployed. It includes only `confirmed`/`edited` observations, computes literal coverage and semantic counts in PostgreSQL, freezes corpus/model/prompt/config metadata, retains the aggregate → observation → evidence → diary chain, detects later source/observation drift, and supersedes rather than overwrites prior aggregate versions. Aggregate regeneration is administrator-only, does not require local-processing mode, and makes no model/provider call. Production postflight, advisors, transactional aggregation/version/rollback smoke, guest/viewer/admin role checks, and a reviewed monthly-pilot regeneration passed. The current aggregate covers 31/31 eligible sources with 16 accepted observations across 16 diaries and no stale reasons. Refreshed full-corpus indexing/regeneration and final Phase 3 acceptance remain separate gates; do not process the pending backlog merely to exercise 3C.
- Phase 3A v4 semantic-quality hardening is implemented in source but not migrated or deployed. New runs freeze a structured ThemeSpec; existing knowledge chunks remain unchanged while the processing route deterministically exposes sentence/range IDs. The first 4B call must partition every ID exactly once into relevant/uncertain/irrelevant, the server validates a complete disjoint partition, and only relevant evidence (or uncertain evidence when no relevant unit exists) reaches the second observation-synthesis call. A completed extraction enters `awaiting_review`; no first summary exists until every observation is confirmed/edited/rejected, after which only confirmed/edited observations may be summarized. Migration `20260803082412_phase3_theme_semantic_quality_v4.sql`, guarded rollback, read-only postflight, route/client/UI, and regression/migration contracts are checked in. Existing v3 results are preserved as stale history. An isolated, unlinked Supabase PostgreSQL 17 stack passed real migration/postflight, exact-evidence rejection, relevant/uncertain/irrelevant persistence, review-before-first-summary, guarded rollback, pre-v4 restoration checks, and reapplication; all functional fixtures rolled back. Production migration/advisors, Worker deployment, role checks, and a reviewed v4 pilot remain gates. Do not start Phase 3E against v3 observations merely to bypass this gate.
- Phase 3D is implemented in source as reviewable change/contradiction analysis between exactly two chronological calendar months inside one current, non-stale Phase 3C aggregate. Local generation sends the complete confirmed/edited observation set from both periods through one frozen Ollama call, requires every finding to cite server-owned observations from both sides, and labels output as `fact`, `summary`, or `inference`; possible contradictions and turning points are inference-only. Every generated finding starts `proposed`; administrator review can confirm, edit, or reject it online with append-only history. PostgreSQL retains comparison versions, frozen period metrics, aggregate-observation provenance, and dynamic stale reasons. Migration `20260803034844_phase3_change_contradiction_analysis.sql` and its rollback/postflight are source-only: they have not been applied in production, the Worker has not been deployed, and the current one-month pilot cannot exercise a real comparison. Do not fabricate a cross-month result or process the pending backlog merely to exercise 3D.
- One local-development administrator sync click runs sequential API batches of up to ten sources without a batch/source cap, stopping only when the queue is empty, three consecutive source failures occur, or a request fails. Individual tasks and batches remain at least two seconds apart. Production is status/search/factual-answer-only: it disables sync, rebuild, and retry controls, and production index-maintenance POST requests return `409`. While syncing locally, the status card bypasses caches and polls every two seconds; every exit path performs a final refresh. Indexed-source progress is the current completed-job count, not the historical non-null `last_indexed_at` count. A failed source is not automatically retried; processing continues until three consecutive failures stop the click and requeue the remaining claimed sources. Manual failed-job retry retains the existing tail-of-queue behavior. Knowledge search and factual answers default to `2024-11-04` through the browser's local current date, while keeping both fields editable.
- New `knowledge_index_jobs.last_error` values are bounded structured JSON with category, safe status/code, an upstream-error excerpt, and a diary-content excerpt for diagnosis. Credential-like values are redacted, while legacy rows may still contain the generic `Knowledge indexing failed` text.
- Every ModelScope analysis, translation, and factual-answer generation HTTP attempt must first reserve one slot from the Supabase-backed Beijing-calendar-day budget. Ordered model fallback therefore consumes one slot per attempted model. The hard safety limit is 180 calls per day across all Worker instances; quota denial/unavailability stops fallback, while zero-candidate answers, local Embedding, and Workers-AI-only retrieval do not reserve ModelScope quota.
- Yearly UI state/mutations live in `useYearlySummaryController`; analysis, event, gallery, and editor views live under `components/yearly-summary/`.
- Batch 3 completed media invariants on 2026-07-13, Batch 4 completed authorized media/health/yearly APIs, and Batch 5 completed production Storage plus table least-privilege hardening on 2026-07-15. The private knowledge-index migration and first Worker batch deployed on 2026-07-20; one-source indexing, search, and source navigation passed.

## Database and storage

Supabase stores diary, AI, health, message, audio, yearly-summary, and private knowledge-index records. The three media buckets are private with no anon Storage object policy. Sensitive application tables have no anon/authenticated grants or policies. Production anon message access is column-level SELECT on `id/content/created_at` only; inserts use the same-origin API and the 1–2000 database constraint. PUBLIC, anon, and authenticated cannot execute privileged application functions directly. The knowledge-index migration is applied in production and its least-privilege postflight passed. Read `docs/DATABASE.md` before altering any database or Storage boundary.

Read [`docs/DATABASE.md`](docs/DATABASE.md) before changing queries, tables, RLS, buckets, paths, or access boundaries.

## Deployment

Production targets Cloudflare Workers through OpenNext. Worker `diaryproject` uses custom domain `diary.wuzhizhii.com`, no separate zone route, `.open-next/worker.js`, `.open-next/assets`, and `nodejs_compat`. Historical versions support rollback. Workers Builds is confirmed on GitHub `DazhiWu/diaryProject`, branch `main`, root `/`, with `pnpm run cf:build` and `pnpm run deploy`.

Read [`docs/DEPLOY.md`](docs/DEPLOY.md) before changing builds, variables, API runtime behavior, OpenNext, Wrangler, Workers Builds, or domains.

## Environment variables

| Variable | Purpose | Required |
|---|---|---|
| `SUPABASE_URL` | Shared Supabase client URL | Yes |
| `SUPABASE_ANON_KEY` | Operator-only direct-access regression credential | Not required by the application |
| `MODELSCOPE_TOKEN_API_KEY` | Server-side ModelScope credential | For AI analysis, translation, and factual answers |
| `MODELSCOPE_CHAT_MODEL` | Server-only English-comma-separated ModelScope chat-model priority list | For AI analysis, translation, and factual answers; no source-code default |
| `OLLAMA_BASE_URL` | Server-only local Ollama API root | For local Phase 3A processing and Phase 3D comparison generation; defaults to `http://127.0.0.1:11434` |
| `AUTH_PASSWORD_ADMIN` | Admin password | For admin mode |
| `AUTH_PASSWORD_VIEWER` | Viewer password | For viewer mode |
| `SESSION_SECRET` | Cookie-session HMAC key | Yes, server-only |
| `SESSION_VERSION` | Session revocation version | Yes, server-only |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged server Supabase client | For protected backend APIs, server-only |
| `APP_ORIGIN` | Production state-changing request Origin | Yes, server-only |

Never record values or substitute a service-role key for the anon key. See `docs/DEPLOY.md` for stage/secrecy details.

## Common commands

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
```

## Important conventions

- Use pnpm, Node.js 22+, strict TypeScript, `@/*`, and the App Router structure.
- Preserve component, hook, and `lib/` boundaries unless the user explicitly requests an architectural change.
- Preserve table/bucket names unless a coordinated migration is requested.
- Keep `pnpm lint` passing with the ESLint flat configuration in `eslint.config.mjs`; legacy experimental files under `test_extra/` are excluded.
- Do not commit `.env*`, credentials, `.open-next/`, or Wrangler state.
- Verify `pnpm build` and `pnpm cf:build` for server-route, environment, or deployment changes.

## Known issues and risks

- Anonymous-message API writes require deployment of `ANONYMOUS_MESSAGE_RATE_LIMITER`; production fails closed when the binding or trusted Cloudflare IP is unavailable.
- AI analysis, translation, knowledge search, and factual answers require the `AI_RATE_LIMITER` binding in production and fail closed if the binding or trusted Cloudflare IP is unavailable.
- Administrator bulk indexing is outside the per-IP interactive limiter and uses the separately maintained local FastAPI Embedding service plus the local Next.js development server. It is deliberately paced and circuit-broken but still runs on the request path; monitor long runs and do not add or edit diaries during the maintenance window. Failed sources remain manually retryable and do not block diary writes. If a full rebuild request is interrupted by network failure, rerun the full rebuild locally after connectivity returns.
- Migration `20260720134848_modelscope_daily_quota.sql` is applied in production as `20260720141701_modelscope_daily_quota`. Any environment using ModelScope analysis, translation, or factual answers must apply it before deploying source that imports `modelScopeQuota.ts`; otherwise those features intentionally return a quota-check-unavailable error without contacting the provider.
- `MODELSCOPE_CHAT_MODEL` must contain at least one non-empty model name. Local `.env.local` and the deployed Worker runtime variable use the same comma-separated format and order. OpenAI SDK automatic retries remain disabled; explicit fallback reserves before every attempt and defaults unknown errors to terminal. Complete allowlisted exhaustion reports `所有模型 API 调用失败`; model-service 401, ambiguous 400/403/405/409/415/422, configuration/quota failures, and unexpected local exceptions do not consume another model unless a safe provider code explicitly identifies a model-level unavailable/unsupported condition.
- The fixed `127.0.0.1` Embedding endpoint remains a local-only document-indexing dependency, is intentionally maintained outside this repository, and is deliberately unreachable from the deployed Worker. Online search requires the configured Workers AI `AI` binding; document indexing still requires running both the local FastAPI service and `pnpm dev`.
- Workers AI uses Cloudflare's daily free allocation unless the account is on a paid plan. Keep interactive knowledge search and factual answers behind `AI_RATE_LIMITER`, monitor Neuron usage, and do not add REST credentials or provider keys.
- `initOpenNextCloudflareForDev()` must remain gated to Next.js `PHASE_DEVELOPMENT_SERVER`. An unconditional call starts the remote Workers AI proxy during `next build` and breaks non-interactive Cloudflare Builds when the account's `workers.dev` domain is protected by Cloudflare Access.
- `lib/runtimeEnv.ts` must keep non-production `process.env` lookup ahead of `getCloudflareContext()`. Local `.env.local` values cover sessions, Supabase, ModelScope, and Ollama without opening remote binding connections; missing local values may fall back to Cloudflare context, while production keeps bindings authoritative. Reversing this order adds one remote proxy attempt per environment-variable read and made ordinary local API requests wait several seconds.
- `cloudflare-env.d.ts` is generated and ignored. The `prebuild` lifecycle runs `pnpm cf-typegen` so clean clones derive `CloudflareEnv`, including the Workers AI binding, from `wrangler.jsonc` before any Next.js type check.
- Deployment uses `scripts/deploy-worker.mjs`, which sets Wrangler's `OPEN_NEXT_DEPLOY` guard and deploys the already-built OpenNext artifact directly. Do not restore `opennextjs-cloudflare deploy`: its environment-loading platform proxy connects to the remote AI binding and fails in non-interactive builds when `workers.dev` is protected by Cloudflare Access. The project has no OpenNext remote cache binding that requires its cache-population step.
- The 2026-07-20 quota rollout snapshot had 195 completed, 344 pending, 56 failed, and no processing knowledge jobs. A quota-stopped sync returned the claimed source to pending without increasing failed or processing counts. Continue any administrator backfill from the local development server in monitored batches rather than as an unobserved bulk operation.
- The Phase 3 development corpus is intentionally frozen at the 598 completed sources in the 2026-07-30 checkpoint. New pending sources do not block development, but every analysis run must identify exact source IDs/content hashes and disclose coverage; do not describe the frozen corpus as the complete live diary corpus.
- Phase 3 extraction creation, processing, failed-source retry, summary regeneration, and 3D comparison generation remain local-development-only. A Worker deployed after the matching migrations may read stored results, review non-stale summaries/observations/comparison findings, and explicitly regenerate deterministic Phase 3C aggregates. V4 needs one scope-partition call per eligible source plus one synthesis call for relevant/uncertain sources; the first non-empty summary is a separate post-review call. Do not deploy 3D or v4 source before applying its matching migration, and do not treat schema/Worker deployment or a reviewed monthly range as full-corpus Phase 3 acceptance.
- During the source-only 3D rollout window, theme-timeline reads intentionally treat only PostgREST `PGRST205` from the missing `understanding_comparisons` table as an empty comparison set so deployed 3A–3C data remains readable. Do not broaden this fallback to permission, network, malformed-data, or later 3D-table errors; those must still fail closed.
- Phase 3A/3D generation uses the native Ollama `/api/chat` endpoint and does not reserve ModelScope quota. Treat `OLLAMA_BASE_URL` as trusted server configuration, never accept it from the browser, and never expose an unauthenticated Ollama listener to the public network. Windows Ollama normally binds to Windows loopback; WSL development may require an explicitly firewalled Windows host binding and a WSL-reachable URL. Phase 3A provider timeout/unavailability releases the current source to pending and stops processing. For `relevant=false`, an otherwise empty result may retain a recognized `fact`/`summary`/`inference` label; the parser canonicalizes that label to `null`, persists no observation, and still rejects any non-empty statement/evidence or unknown classification. Other invalid structured output remains a retryable source failure. Incomplete/failed coverage blocks review but is reported separately from actual source/hash/model/Prompt drift. Phase 3D rejects invalid structured output without persisting a partial comparison.
- The retained direct anon message read relies on column grants plus RLS; UI roles are not authorization.
- Public unoptimized images can affect bandwidth/performance.
- Supabase security advisors intentionally report `rls_enabled_no_policy` information for deny-by-default application tables; the former anonymous INSERT and public SECURITY DEFINER execution warnings are resolved.
- `diaryInfo` is a preserved legacy keepsake with no browser-direct grant or policy; any future viewer/admin display must use a Cookie-authorized service-role API. `rss_articles` belongs to another project and is out of scope.
- The `diary_image_paths.diary_id` foreign key has a covering index. Its immediate post-creation `unused_index` advisor item is informational until production query statistics record use.
- Cloudflare Workers Builds API reads confirm GitHub `DazhiWu/diaryProject`, branch `main`, root `/`, build command `pnpm run cf:build`, and production deploy command `pnpm run deploy`.

## Documentation map

- [`README.md`](README.md): project introduction, startup instructions, and basic usage.
- [`docs/DATABASE.md`](docs/DATABASE.md): database, RLS, Supabase Storage, and data-access rules.
- [`docs/DEPLOY.md`](docs/DEPLOY.md): Cloudflare, OpenNext, environment variables, and deployment procedures.
- [`docs/FACT_LAYER_PLAN.md`](docs/FACT_LAYER_PLAN.md): implemented administrator-only Fact Layer boundaries, verification requirements, and production acceptance state.
- [`docs/PHASE3_UNDERSTANDING_PLAN.md`](docs/PHASE3_UNDERSTANDING_PLAN.md): Phase 3 entry checkpoint, frozen development corpus, independent batches, and verification gates.
- [`docs/THEME_TIMELINE_THEME_CATALOG.md`](docs/THEME_TIMELINE_THEME_CATALOG.md): copy-ready long-diary theme catalog, safe theme wording, and pilot-versus-full-run boundaries.
- [`docs/DIGITAL_TWIN_ROADMAP.md`](docs/DIGITAL_TWIN_ROADMAP.md): post-Fact-Layer roadmap for auditable understanding, the private twin, growth snapshots, the public twin, and long-term maintenance.

`docs/ARCHITECTURE.md` does not currently exist. Create it only when architecture detail becomes substantial enough to require a dedicated document.

## AI agent instructions

- Before any development task, read `README.md`, `AGENTS.md`, and the `docs/` files relevant to the task.
- Before editing, inspect the actual code, configuration, and Git status; do not rely only on historical chat or older documentation.
- Prefer the smallest necessary change.
- Do not modify files unrelated to the current task.
- Preserve the current architecture, directory structure, naming, and code style unless the user explicitly requests changes.
- Use the package manager and runtime versions currently specified by the project.
- Never write, print, or commit real keys, tokens, passwords, or environment-variable values.
- If code and documentation disagree, treat actual code and configuration as authoritative, then correct the affected documentation in the same task.
- Preserve existing user changes in a dirty worktree and inspect diffs before editing overlapping files.
- After implementation, check whether `README.md`, `AGENTS.md`, or a focused document under `docs/` must be updated.
- Run verification proportional to the change; for deployment-sensitive changes, distinguish `pnpm build` from `pnpm cf:build`.
- At completion, report changed files, reasons, verification performed, and facts still requiring confirmation.

## Documentation update rules

| Change type | Required documentation update |
|---|---|
| Database tables, fields, indexes, RLS, Storage, or media-path changes | Update `docs/DATABASE.md` |
| Cloudflare, OpenNext, Wrangler, build commands, environment variables, or deployment-flow changes | Update `docs/DEPLOY.md` |
| Project goals, startup instructions, or external usage changes | Update `README.md` |
| Directory structure, major modules, development conventions, or AI constraints change | Update `AGENTS.md` |
| Significant architecture change | First update the summary in `AGENTS.md`, then consider creating or updating `docs/ARCHITECTURE.md` |

When one change affects several categories, update every applicable document. Do not copy the same detailed explanation into each file; keep summaries and links in `AGENTS.md` and details in the focused document.

## Documentation maintenance

- `README.md` is for human developers and users.
- `AGENTS.md` is for AI coding assistants and contains the project summary, development constraints, high-value conventions, and documentation navigation.
- `docs/` contains detailed topics such as database, deployment, and architecture.
- Do not repeat long sections of the same content across documents.
- Keep only high-value summaries and entry points in `AGENTS.md`.
- When one topic grows noticeably, move its detail to the corresponding file under `docs/` and link it here.
- Do not record chat history, temporary debugging output, abandoned approaches, or one-time operations.
- Do not mechanically append notes after every conversation; edit, merge, replace, or remove obsolete content first.
- Keep headings and formatting consistent with the existing English section structure.
