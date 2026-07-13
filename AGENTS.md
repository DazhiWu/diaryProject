# AGENTS.md

## Project overview

This is a personal diary application built with Next.js and Supabase. It supports diary CRUD, image/audio uploads, search/calendar views, health tracking, anonymous messages, CSV export, and yearly summaries. Server API routes call a ModelScope-hosted DeepSeek model for title/emotion analysis and translation. Guest, viewer, and admin UI modes use simple password checks.

## Tech stack

- Next.js 16 App Router, React 18, strict TypeScript, Tailwind CSS 4
- pnpm 10.20.0 and Node.js 22+
- Supabase PostgreSQL and Storage
- ModelScope OpenAI-compatible API with `deepseek-ai/DeepSeek-V3.2`
- Cloudflare Workers through OpenNext and Wrangler

## Development environment

- Prefer WSL Ubuntu for development and OpenNext checks.
- Install with `pnpm install`; preserve `pnpm-lock.yaml` and do not add npm/Yarn lockfiles.
- Run with `pnpm dev`.
- Use `pnpm build` for Next.js validation and `pnpm cf:build` for the Cloudflare artifact.
- Keep local values in ignored `.env.local` files and never commit credentials.

## Project structure

- `app/`: App Router application, styles, and API routes.
- `components/`: business and UI components.
- `hooks/`: authentication state and health-condition hooks.
- `lib/`: Supabase access, business APIs, media, environment lookup, AI, and utilities.
- `public/`: static placeholder assets.
- `test_extra/`: partial SQL helpers, experiments, and UI automation; not a complete migration/test suite.
- `docs/`: detailed database/storage and deployment documentation.
- `next.config.mjs`, `open-next.config.ts`, `wrangler.jsonc`: deployment configuration.

## Architecture summary

- `app/page.tsx` switches among diary list/calendar/create/edit/detail, export, yearly-summary, message, and audio views.
- Client-reachable modules use a shared Supabase anon client for most database/Storage operations; diary data has a compressed `localStorage` fallback.
- AI/translation API routes keep the ModelScope token server-side; the download route returns CSV.
- `/api/auth` validates passwords behind an Origin/rate-limit boundary and writes a signed HttpOnly Cookie; `/api/auth/session` is the browser role source. This is not Supabase Auth, and current direct anon data paths remain until later migration batches.
- `lib/server/` contains server-only environment, session, Origin, rate-limit, and privileged Supabase-client boundaries. Do not import these modules from browser code.
- Images are compressed to WebP in the browser, uploaded with insert-only semantics, and referenced by relative paths. Yearly images use unique object paths.
- Diary detail timestamps intentionally apply the product-required `+16` hour adjustment.

## Database and storage

Supabase stores diary, AI, health, message, audio, and yearly-summary records. Production was inspected on 2026-07-12: the three media buckets are public with SELECT/INSERT but no UPDATE/DELETE object policy; anonymous messages allow SELECT/INSERT only; most other browser-direct tables still have permissive public ALL policies. Only health/message SQL is checked in.

Read [`docs/DATABASE.md`](docs/DATABASE.md) before changing queries, tables, RLS, buckets, paths, or access boundaries.

## Deployment

Production targets Cloudflare Workers through OpenNext. Worker `diaryproject` uses custom domain `diary.wuzhizhii.com`, no separate zone route, `.open-next/worker.js`, `.open-next/assets`, and `nodejs_compat`. Historical versions support rollback. Workers Builds Git settings still require Dashboard confirmation.

Read [`docs/DEPLOY.md`](docs/DEPLOY.md) before changing builds, variables, API runtime behavior, OpenNext, Wrangler, Workers Builds, or domains.

## Environment variables

| Variable | Purpose | Required |
|---|---|---|
| `SUPABASE_URL` | Shared Supabase client URL | Yes |
| `SUPABASE_ANON_KEY` | Browser-visible Supabase anon credential | Yes |
| `MODELSCOPE_TOKEN_API_KEY` | Server-side AI/translation credential | For AI features |
| `AUTH_PASSWORD_ADMIN` | Admin password | For admin mode |
| `AUTH_PASSWORD_VIEWER` | Viewer password | For viewer mode |
| `SESSION_SECRET` | Cookie-session HMAC key, at least 32 bytes | Yes, server-only |
| `SESSION_VERSION` | Session revocation version | Yes, server-only |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged server Supabase client credential | For protected backend APIs, server-only |
| `APP_ORIGIN` | Production state-changing request Origin | Yes, server-only |

Never record values or substitute a service-role key for the anon key. `SESSION_VERSION` must be incremented after either auth password changes. See `docs/DEPLOY.md` for stage/secrecy details.

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
pnpm deploy
```

## Important conventions

- Use pnpm, Node.js 22+, strict TypeScript, `@/*`, and the App Router structure.
- Preserve component, hook, and `lib/` boundaries unless the user explicitly requests an architectural change.
- Preserve table/bucket names unless a coordinated migration is requested.
- Treat `components/ui/backup/` as intentionally inactive.
- Do not commit `.env*`, credentials, `.open-next/`, or Wrangler state.
- Verify `pnpm build` and `pnpm cf:build` for server-route, environment, or deployment changes.

## Known issues and risks

- TypeScript build errors are ignored by `next.config.mjs`.
- Browser anon writes rely on RLS/Storage policies; UI roles are not authorization.
- Authentication is not Supabase Auth and has no logout endpoint/control in this phase. Sessions expire naturally or when `SESSION_VERSION` changes.
- Sensitive browser-direct data and Storage access is not yet migrated; the privileged client exists but must only be used by authorized server routes.
- Public unoptimized images can affect bandwidth/performance.
- Most browser-direct business tables still have permissive public ALL policies; a trusted-session redesign is required before tightening them without breaking admin features.
- Supabase security advisors flag broad Storage listing and a public SECURITY DEFINER function; review them separately before changing production behavior.
- `pnpm lint` lacks a direct `eslint` dependency and needs clean-install confirmation.
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
