# AGENTS.md

## Project overview

This is a personal diary application built with Next.js and Supabase. It supports diary CRUD, image/audio uploads, search/calendar views, health tracking, anonymous messages, CSV export, yearly summaries, and an admin-only private knowledge index. Server API routes call ModelScope-hosted DeepSeek for title/emotion analysis and translation. Local knowledge indexing calls a Qwen3-Embedding-0.6B FastAPI service; online knowledge queries and candidate reranking use Cloudflare Workers AI. Guest, viewer, and admin UI modes use simple password checks.

## Tech stack

- Next.js 16 App Router, React 18, strict TypeScript, Tailwind CSS 4
- pnpm 10.20.0 and Node.js 22+
- Supabase PostgreSQL and Storage
- ModelScope OpenAI-compatible API with `deepseek-ai/DeepSeek-V3.2`; local Qwen3-Embedding-0.6B FastAPI service
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
- AI/translation API routes keep the ModelScope token server-side, enforce 50,000-character input, a 30-second upstream timeout, and five calls per IP per 60 seconds through `AI_RATE_LIMITER`; the download route returns safely escaped CSV with byte-accurate length.
- `/api/auth` writes a signed HttpOnly Cookie and `/api/auth/session` is the browser role source. This is not Supabase Auth; sessions use `SESSION_VERSION`, not a database session table.
- Images are compressed to WebP in the browser and referenced by relative paths. New uploads use insert-only semantics; explicit replacement routes use upsert on the existing path.
- Diary detail timestamps intentionally apply the product-required `+16` hour adjustment.
- Diary and yearly media read through fixed-bucket proxies; diary inherits latest-five/viewer/admin access, yearly is readable by all roles, and audio is admin-only with single-range streaming. All three media buckets are private; browser anon Storage access is denied.
- Yearly routes scope every nested event, section, opinion, and image mutation to the summary identified by the URL year. Request parsers centrally enforce byte, character, date, array, file-size, MIME, and extension limits before writes.
- The admin-only knowledge base uses queued diary indexing, newline-first chunks, SHA-256 idempotency, 1024-dimensional Qwen3 embeddings, exact vector scans plus literal keyword fusion, optional date filters, and source-diary navigation. Single and consecutive newlines are equal highest-priority boundaries; adjacent short segments target 400–700 characters with an 800-character hard maximum, while long lines fall back to complete-sentence boundaries and sentence overlap. Local requests target `http://127.0.0.1:8000/embeddings` only for document indexing, use `document` input, and send at most 16 texts per request. Online search uses the Workers AI Qwen3 model for a normalized query vector, asks the existing Supabase RPC for 20 fused candidates, and uses the Workers AI BGE reranker for the top five. Search merges adjacent hits and keeps at most two independent results per diary. Its optional admin diagnostic mode exposes the ordered RPC candidates, raw valid reranker results with their original candidate numbers, and final merged/diversified results; the full query vector is never returned. Embedding failure returns a generic 503; reranker failure falls back to vector-similarity order. Diary mutations enqueue work through a database trigger and never wait for Embedding; index replacement is transactional through a service-role-only RPC.
- One administrator sync click runs sequential API batches of up to ten sources without a batch/source cap, stopping only when the queue is empty, three consecutive source failures occur, or a request fails. Individual tasks and batches remain at least two seconds apart. While syncing, the status card bypasses caches and polls every two seconds; every exit path performs a final refresh. Indexed-source progress is the current completed-job count, not the historical non-null `last_indexed_at` count. A failed source is not automatically retried; processing continues until three consecutive failures stop the click and requeue the remaining claimed sources. Manual failed-job retry retains the existing tail-of-queue behavior. Knowledge search defaults to `2024-11-04` through the browser's local current date, while keeping both fields editable.
- New `knowledge_index_jobs.last_error` values are bounded structured JSON with category, safe status/code, an upstream-error excerpt, and a diary-content excerpt for diagnosis. Credential-like values are redacted, while legacy rows may still contain the generic `Knowledge indexing failed` text.
- Every ModelScope analysis and translation HTTP call must first reserve one slot from the Supabase-backed Beijing-calendar-day budget. The hard safety limit is 180 calls per day across all Worker instances; local Embedding calls do not reserve ModelScope quota.
- Yearly UI state/mutations live in `useYearlySummaryController`; analysis, event, gallery, and editor views live under `components/yearly-summary/`.
- Batch 3 completed media invariants on 2026-07-13, Batch 4 completed authorized media/health/yearly APIs, and Batch 5 completed production Storage plus table least-privilege hardening on 2026-07-15. The private knowledge-index migration and first Worker batch deployed on 2026-07-20; one-source indexing, search, and source navigation passed.

## Database and storage

Supabase stores diary, AI, health, message, audio, yearly-summary, and private knowledge-index records. The three media buckets are private with no anon Storage object policy. Sensitive application tables have no anon/authenticated grants or policies. Production anon message access is column-level SELECT on `id/content/created_at` only; inserts use the same-origin API and the 1–2000 database constraint. PUBLIC, anon, and authenticated cannot execute privileged application functions directly. The knowledge-index migration is applied in production and its least-privilege postflight passed. Read `docs/DATABASE.md` before altering any database or Storage boundary.

Read [`docs/DATABASE.md`](docs/DATABASE.md) before changing queries, tables, RLS, buckets, paths, or access boundaries.

## Deployment

Production targets Cloudflare Workers through OpenNext. Worker `diaryproject` uses custom domain `diary.wuzhizhii.com`, no separate zone route, `.open-next/worker.js`, `.open-next/assets`, and `nodejs_compat`. Historical versions support rollback. Workers Builds Git settings still require Dashboard confirmation.

Read [`docs/DEPLOY.md`](docs/DEPLOY.md) before changing builds, variables, API runtime behavior, OpenNext, Wrangler, Workers Builds, or domains.

## Environment variables

| Variable | Purpose | Required |
|---|---|---|
| `SUPABASE_URL` | Shared Supabase client URL | Yes |
| `SUPABASE_ANON_KEY` | Operator-only direct-access regression credential | Not required by the application |
| `MODELSCOPE_TOKEN_API_KEY` | Server-side AI/translation credential | For AI analysis and translation |
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
- AI analysis, translation, and knowledge search require the `AI_RATE_LIMITER` binding in production and fail closed if the binding or trusted Cloudflare IP is unavailable.
- Administrator bulk indexing is outside the per-IP interactive limiter and uses the local FastAPI Embedding service. It is deliberately paced and circuit-broken but still runs on the request path; monitor long runs. Failed sources remain manually retryable and do not block diary writes.
- Migration `20260720134848_modelscope_daily_quota.sql` is applied in production as `20260720141701_modelscope_daily_quota`. Any environment using ModelScope analysis/translation must apply it before deploying source that imports `modelScopeQuota.ts`; otherwise those features intentionally return a quota-check-unavailable error without contacting the provider.
- The fixed `127.0.0.1` Embedding endpoint remains a local-only document-indexing dependency and is deliberately unreachable from the deployed Worker. Online search requires the configured Workers AI `AI` binding; document indexing still requires running the local FastAPI service.
- Workers AI uses Cloudflare's daily free allocation unless the account is on a paid plan. Keep interactive knowledge search behind `AI_RATE_LIMITER`, monitor Neuron usage, and do not add REST credentials or provider keys.
- `initOpenNextCloudflareForDev()` must remain gated to Next.js `PHASE_DEVELOPMENT_SERVER`. An unconditional call starts the remote Workers AI proxy during `next build` and breaks non-interactive Cloudflare Builds when the account's `workers.dev` domain is protected by Cloudflare Access.
- The 2026-07-20 quota rollout snapshot had 195 completed, 344 pending, 56 failed, and no processing knowledge jobs. A quota-stopped sync returned the claimed source to pending without increasing failed or processing counts. Continue the administrator backfill in monitored batches rather than as an unobserved bulk operation.
- The retained direct anon message read relies on column grants plus RLS; UI roles are not authorization.
- Public unoptimized images can affect bandwidth/performance.
- Supabase security advisors intentionally report `rls_enabled_no_policy` information for deny-by-default application tables; the former anonymous INSERT and public SECURITY DEFINER execution warnings are resolved.
- `diaryInfo` is a preserved legacy keepsake with no browser-direct grant or policy; any future viewer/admin display must use a Cookie-authorized service-role API. `rss_articles` belongs to another project and is out of scope.
- The `diary_image_paths.diary_id` foreign key has a covering index. Its immediate post-creation `unused_index` advisor item is informational until production query statistics record use.
- Cloudflare Workers Builds Git repository/branch/commands still require Dashboard confirmation because the current OAuth token cannot read the Builds API.

## Documentation map

- [`README.md`](README.md): project introduction, startup instructions, and basic usage.
- [`docs/DATABASE.md`](docs/DATABASE.md): database, RLS, Supabase Storage, and data-access rules.
- [`docs/DEPLOY.md`](docs/DEPLOY.md): Cloudflare, OpenNext, environment variables, and deployment procedures.

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
