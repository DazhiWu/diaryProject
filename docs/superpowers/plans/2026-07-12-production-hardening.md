# Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the production environment diagnostic surface, align package/media behavior and documentation with verified Supabase/Cloudflare state, and restrict anonymous-message writes without breaking existing diary features.

**Architecture:** Keep the current browser-direct Supabase architecture. Remove only the diagnostic route/UI, narrow `anonymous_messages` RLS to public SELECT/INSERT, use insert-only Storage paths, and document externally verified production state. Other permissive table policies remain until a future trusted-session redesign.

**Tech Stack:** Next.js 16, React 18, TypeScript, pnpm 10.20.0, Supabase PostgreSQL/Storage, Cloudflare Workers/OpenNext.

## Global Constraints

- Preserve guest/viewer/admin UI behavior and the confirmed `+16` hour display adjustment.
- Preserve `test_extra/add_diary.py` unchanged.
- Do not expose or record credential values.
- Do not modify unrelated user changes or the untracked `pnpm-workspace.yaml`.
- Do not deploy Cloudflare in this task.

---

### Task 1: Remove the environment diagnostic surface

**Files:**
- Delete: `app/api/test-env/route.ts`
- Modify: `components/diary-detail.tsx`
- Test: repository search and Next.js route build

**Interfaces:**
- Consumes: authenticated diary-detail action bar.
- Produces: no `/api/test-env` route, fetch call, handler, or “测试环境” button.

- [ ] Run a repository assertion and confirm it fails while `test-env` references exist.
- [ ] Remove the route, handler, button, and stale comments.
- [ ] Re-run the assertion and confirm no application references remain.

### Task 2: Align package and Storage behavior

**Files:**
- Modify: `package.json`
- Modify: `lib/imageHandler.ts`
- Modify: `lib/yearlySummaryApi.ts`
- Verify: `pnpm-lock.yaml`, TypeScript/Next.js build

**Interfaces:**
- Consumes: current `uploadImage(file, path, bucket)` API.
- Produces: package name `diary-project`; insert-only uploads; unique yearly replacement paths with database reference updates.

- [ ] Run assertions that fail for the old package name and `upsert: true`.
- [ ] Change the package name and set Storage uploads to `upsert: false`.
- [ ] Generate a unique yearly replacement path rather than overwriting an existing object.
- [ ] Re-run assertions and build verification.

### Task 3: Restrict anonymous-message production RLS

**Files:**
- Modify: Supabase production policy through a named migration.
- Update: `test_extra/CREATE_ANONYMOUS_MESSAGE_TABLE.sql` if its policy definitions differ.

**Interfaces:**
- Consumes: public paginated SELECT and INSERT from `lib/messageBoardApi.ts`.
- Produces: `anon`/`authenticated` can SELECT and INSERT; UPDATE and DELETE are denied by RLS.

- [ ] Query current policies and confirm the permissive ALL policy.
- [ ] Apply an idempotent migration replacing it with explicit SELECT and INSERT policies and a 2–1000 character content check.
- [ ] Query policies/constraints again and verify allowed/denied operations using a transaction that rolls back test rows.

### Task 4: Synchronize long-term documentation

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/DATABASE.md`
- Modify: `docs/DEPLOY.md`

**Interfaces:**
- Consumes: verified repository, Supabase, and Cloudflare evidence.
- Produces: accurate durable documentation with remaining Workers Builds Git settings explicitly unconfirmed.

- [ ] Replace unconfirmed database/storage facts with verified production facts.
- [ ] Record Cloudflare custom domain, no zone route, runtime binding types, history/rollback, and the remaining Builds API limitation.
- [ ] Remove `/api/test-env`, package-name, script-retention, time-offset, and resolved Storage questions.
- [ ] Validate links, commands, variables, sensitive-data patterns, and documentation diff.

### Task 5: Full regression verification

**Files:**
- Verify only.

**Interfaces:**
- Consumes: all implementation changes.
- Produces: fresh evidence for existing application and Worker artifact health.

- [ ] Run `pnpm build`.
- [ ] Run `pnpm cf:build`.
- [ ] Run `pnpm exec wrangler deploy --dry-run`.
- [ ] Confirm expected routes and absence of `/api/test-env`.
- [ ] Review final Git diff and report any verification limitation.
