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

Cloudflare was inspected read-only on 2026-07-12. Worker identity, runtime bindings, custom domain, routes, versions, and rollback capability are confirmed below. The current OAuth token cannot read the Workers Builds API, so the Git repository connection, production branch, root directory, and build/deploy commands still need Dashboard confirmation.

## Prerequisites

- Node.js `>=22` and pnpm `10.20.0`, from `package.json`.
- A Cloudflare account authorized to build/deploy Workers.
- A configured Supabase project and server runtime credentials.
- ModelScope/auth runtime credentials for enabled features.
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
| `MODELSCOPE_TOKEN_API_KEY` | `lib/aiAnalysis.ts` | For AI/translation | Yes | Server runtime secret via Cloudflare binding or local `process.env` |
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
- Configure `AI_RATE_LIMITER` from `wrangler.jsonc`; it enforces five AI analysis/translation calls per 60 seconds by client IP. Production AI calls fail closed if the binding or trusted Cloudflare client IP is unavailable. Do not reuse namespace `2026071502`.
- Use ignored `.dev.vars` for local workerd preview runtime values; `.env.local` supplies local Next.js runtime values but is not a substitute for Worker runtime bindings.
- Configure ModelScope and password credentials in deployed Worker runtime **Variables and Secrets**, preferably encrypted secrets.
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
- Rate-limit bindings: `LOGIN_RATE_LIMITER` for five login calls, `ANONYMOUS_MESSAGE_RATE_LIMITER` for three message writes, and `AI_RATE_LIMITER` for five AI/translation calls per 60 seconds.
- Custom domain: `diary.wuzhizhii.com`, production environment.
- Zone routes: none target `diaryproject`; the custom domain targets the Worker directly.
- Runtime bindings declared by the repository: `ASSETS`, `LOGIN_RATE_LIMITER`, `ANONYMOUS_MESSAGE_RATE_LIMITER`, and `AI_RATE_LIMITER`. Configure the named runtime variables/secrets before enabling the corresponding features.
- Historical Worker versions and rollback capability are available.

OpenNext adapts App Router pages and API routes to Workers. Plain `next build` is useful validation but not the production artifact.

Cloudflare variables are plain configuration values; secrets are encrypted runtime values. Passwords, session material, service-role credentials, and ModelScope tokens belong in runtime secrets. `SUPABASE_URL` is non-secret runtime configuration; the application no longer compiles a Supabase anon client into browser code.

## Supabase integration

- Browser code uses same-origin APIs and does not require Supabase credentials in the build output.
- `/api/diary-download` is admin-only and uses `lib/server/supabaseAdmin.ts`; the service-role factory is not a browser import path.
- RLS, grants, and Storage policies remain defense-in-depth and the boundary for operator direct-access tests; application requests use authorized server routes.
- Media reads use same-origin authorized proxy routes with the runtime service-role credential: diary and yearly images are versioned by their record timestamps, and admin audio supports HTTP Range streaming. All three media buckets are private and direct browser anon Storage access is denied.
- See [`DATABASE.md`](DATABASE.md) for tables, RLS, buckets, and path details.

## Deployment procedure

### Workers Builds (documented production path)

1. Confirm the intended commit/branch. README says `main`; verify Cloudflare dashboard state.
2. Confirm Node.js 22+ and repository root configuration.
3. Configure runtime variables/secrets for Supabase, ModelScope, and enabled auth modes.
4. Confirm both Rate Limit bindings are present in the deployment configuration.
5. Validate locally where practical:

   ```bash
   pnpm install
   pnpm build
   pnpm cf:build
   pnpm exec wrangler deploy --dry-run
   ```

6. Push the intended commit to the connected branch.
7. Confirm build command `pnpm run cf:build` and deploy command `pnpm exec opennextjs-cloudflare deploy`.
8. Inspect build/deploy logs; plain Next.js success is not Worker verification.
9. Complete the checks below on the Worker URL and any custom domain.

### Local direct deployment

1. Authenticate Wrangler with the intended account.
2. Supply required local/build values without committing `.env.local`.
3. Run `pnpm cf:build` and optionally the Wrangler dry-run.
4. Run `pnpm run deploy`, or deploy an already-built bundle with `pnpm exec opennextjs-cloudflare deploy`.
5. Verify Worker behavior, variables, logs, routes, and domain.

Account identity, token scopes, and production approvals need confirmation outside the repository.

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
- Oversized JSON/multipart requests return `413`; invalid dates, field lengths, file types, and array sizes return `400` before downstream writes. ModelScope requests time out after 30 seconds, and the sixth AI/translation call in 60 seconds returns `429` for the same client IP.
- CSV export from `/api/diary-download`.
- Browser console/network errors and Cloudflare logs/observability.
- Default Worker hostname and custom domain, if configured; ensure DNS/routes do not target old Pages deployment.

## Rollback

Repository-confirmed source rollback:

1. Select/revert to a known-good Git commit.
2. Rebuild/redeploy that commit or push the revert to the production branch.
3. Repeat post-deployment verification.

Version history and rollback capability were verified on 2026-07-12. After explicit production approval, list versions with `pnpm exec wrangler versions list --name diaryproject` and roll back with `pnpm exec wrangler rollback <version-id> --name diaryproject`. Database rollback is separate and requires an explicit migration/recovery plan.

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
