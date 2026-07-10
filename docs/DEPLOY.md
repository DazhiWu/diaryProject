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

README-documented automated path:

```text
GitHub `main`
→ Cloudflare Workers Builds (Linux, Node.js 22+)
→ `pnpm run cf:build`
→ `pnpm exec opennextjs-cloudflare deploy`
→ Worker `diaryproject`
```

The Git repository connection, production branch, account/project, routes, and custom domain are dashboard state and need confirmation.

## Prerequisites

- Node.js `>=22` and pnpm `10.20.0`, from `package.json`.
- A Cloudflare account authorized to build/deploy Workers.
- A configured Supabase project and anon-client variables.
- ModelScope/auth runtime credentials for enabled features.
- Project-local `@opennextjs/cloudflare` and `wrangler`, installed with `pnpm install`.
- WSL Ubuntu or another Linux environment is recommended for local deployment work; README records Windows-generated OpenNext bundle issues.

## Relevant files

| File | Purpose |
|---|---|
| `package.json` | Node/pnpm requirements and Next.js/OpenNext/Wrangler scripts |
| `pnpm-lock.yaml` | Reproducible pnpm dependency graph |
| `next.config.mjs` | Supabase build injection, unoptimized images, ignored TypeScript build errors |
| `open-next.config.ts` | Default OpenNext Cloudflare adapter configuration |
| `wrangler.jsonc` | Worker name/entry, compatibility, assets, variable preservation, observability |
| `lib/runtimeEnv.ts` | Cloudflare runtime binding lookup with `process.env` fallback |
| `lib/supabaseClient.ts` | Shared Supabase client initialization |
| `app/api/auth/route.ts` | Runtime auth password lookup |
| `lib/aiAnalysis.ts` | Runtime ModelScope token lookup |
| `app/api/test-env/route.ts` | Reports variable presence/length without values |
| `.gitignore` | Excludes `.env*`, `.open-next/`, `.wrangler/`, generated types, logs, build output |

There is no `.env.example` in the repository.

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
pnpm deploy
pnpm exec wrangler deploy --dry-run
```

- `pnpm build`: `next build`; validates Next.js but does not create a deployable Worker bundle.
- `pnpm cf:build`: produces `.open-next/` through `opennextjs-cloudflare build`.
- `pnpm preview`: builds and starts the OpenNext Cloudflare preview.
- `pnpm deploy`: OpenNext build followed by deploy.
- `pnpm cf-typegen`: generates ignored `cloudflare-env.d.ts`.
- `pnpm lint`: declared, but `eslint` is not a direct dependency; confirm clean-install behavior if it fails.

## Environment variables

| Variable | Used by | Required | Secret | Stage and purpose |
|---|---|---|---|---|
| `SUPABASE_URL` | `lib/supabaseClient.ts`, `next.config.mjs` | Yes | No; still do not hard-code | Build stage because it enters browser code; also used by server-imported shared client at runtime |
| `SUPABASE_ANON_KEY` | Same | Yes | Public anon credential, not a server secret | Build and deployed browser/server code; limited by RLS/Storage policies |
| `MODELSCOPE_TOKEN_API_KEY` | `lib/aiAnalysis.ts` | For AI/translation | Yes | Server runtime secret via Cloudflare binding or local `process.env` |
| `AUTH_PASSWORD_ADMIN` | `app/api/auth/route.ts` | For admin mode | Yes | Server runtime secret |
| `AUTH_PASSWORD_VIEWER` | `app/api/auth/route.ts` | For viewer mode | Yes | Server runtime secret |

Rules:

- Configure Supabase URL/anon key where Workers Builds can read them before `pnpm cf:build`; `next.config.mjs` injects them into the client bundle.
- Configure ModelScope and password credentials in deployed Worker runtime **Variables and Secrets**, preferably encrypted secrets.
- Workers Builds variables and deployed runtime variables are separate scopes. Configure each value wherever its code path requires it.
- `keep_vars: true` asks Wrangler to preserve dashboard-managed values during deployment; confirm behavior before changing it.
- Never use a Supabase service-role key as `SUPABASE_ANON_KEY`. No service-role variable exists here.

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
- Other bindings: none declared.
- Routes/custom domains: none versioned in the repository; dashboard state needs confirmation.

OpenNext adapts App Router pages and API routes to Workers. Plain `next build` is useful validation but not the production artifact.

Cloudflare variables are plain configuration values; secrets are encrypted runtime values. ModelScope tokens and passwords belong in secrets. Anything compiled into browser code, including the anon key here, cannot remain confidential even if entered through a secret UI.

## Supabase integration

- Browser code requires `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the build output.
- `/api/diary-download` imports the same shared client; there is no privileged server credential.
- If future server administration needs a service-role key, create a distinct server-only variable/client and never expose it through `next.config.mjs`.
- RLS and Storage policies are the online security boundary because browser code uses the anon client directly.
- Media uses `getPublicUrl()`. Private buckets would require signed URLs and code/policy changes.
- See [`DATABASE.md`](DATABASE.md) for tables, RLS, buckets, and path details.

## Deployment procedure

### Workers Builds (documented production path)

1. Confirm the intended commit/branch. README says `main`; verify Cloudflare dashboard state.
2. Confirm Node.js 22+ and repository root configuration.
3. Configure build-stage Supabase variables without committing values.
4. Configure runtime variables/secrets for Supabase, ModelScope, and enabled auth modes.
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
4. Run `pnpm deploy`.
5. Verify Worker behavior, variables, logs, routes, and domain.

Account identity, token scopes, and production approvals need confirmation outside the repository.

## Post-deployment verification

- Homepage, styles, and static assets.
- Diary pagination/search/calendar/detail.
- `/api/test-env`: presence metadata only, never values; restrict/remove if production policy requires.
- `/api/auth`: valid viewer/admin and invalid-password behavior.
- Guest/viewer/admin UI, remembering it does not replace RLS.
- Authorized Supabase read/create/update/delete under production policies.
- Diary image upload/display and stored relative path.
- Audio/yearly image behavior when in scope.
- AI analysis and translation with the runtime token.
- CSV export from `/api/diary-download`.
- Browser console/network errors and Cloudflare logs/observability.
- Default Worker hostname and custom domain, if configured; ensure DNS/routes do not target old Pages deployment.

## Rollback

Repository-confirmed source rollback:

1. Select/revert to a known-good Git commit.
2. Rebuild/redeploy that commit or push the revert to the production branch.
3. Repeat post-deployment verification.

Cloudflare may provide deployment-history rollback, but availability, retention, and permissions need dashboard confirmation. Database rollback is separate and requires an explicit migration/recovery plan.

## Known deployment issues

- The old Pages/`@cloudflare/next-on-pages` chain is obsolete; README records dependency drift there even without source changes.
- `pnpm build` does not produce the OpenNext Worker artifact.
- Windows bundles may differ at preview/runtime; prefer Workers Builds or Linux/WSL.
- Build and runtime variable scopes are separate.
- `next.config.mjs` ignores TypeScript build errors.
- The shared Supabase client throws at module initialization when URL/key variables are absent.
- `pnpm lint` may fail cleanly because `eslint` is not a direct dependency.
- Wrangler/API credentials may read project state but lack Workers Builds write permission.
- Custom-domain state is not versioned and may point to an old Pages project or other Worker.
- `/api/test-env` exposes variable presence and lengths; it is still a production diagnostic surface.

## Deployment change checklist

After deployment changes, verify:

- `package.json`, Node engine, package manager, and lockfile.
- `next.config.mjs`, browser variable exposure, and type-check behavior.
- `open-next.config.ts` adapter compatibility.
- `wrangler.jsonc` entry, assets, date/flags, bindings, observability, and `keep_vars`.
- Build-stage variables versus deployed runtime variables/secrets.
- Cloudflare account, branch, commands, routes, and custom domain.
- API routes and runtime environment lookup under Workers.
- Supabase RLS/Storage with the deployed anon client.
- `pnpm build`, `pnpm cf:build`, and dry-run/preview where relevant.
- Post-deployment functionality, logs, this document, `AGENTS.md`, and README.
