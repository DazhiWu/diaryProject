# Batch 5 Read-Only Production Audit Record

**Project:** `DiaryProject` (`zaavhqdodkmlxpjijdqo`)  
**Executed:** 2026-07-15 10:43:12 CST (2026-07-15 02:43:12 UTC checkpoint)  
**Method:** Supabase SQL MCP `SELECT` queries only. No DDL, DCL, data mutation, bucket update, or deployment was performed.

**Cloudflare version read:** `c41d583a-af78-426e-9808-369424df1531`, the 100% version in the latest `diaryproject` deployment, confirmed with read-only `pnpm exec wrangler deployments list --name diaryproject`. No Worker action was attempted.

**Production-audit consistency checkpoint:** all three target buckets remain `public = true`; exactly the two audited global `storage.objects` policies remain; no Storage bucket policy exists; all ten target public tables have enabled/non-forced RLS, zero direct `PUBLIC` table ACLs, and no column ACLs; and the exact anonymous-message trimmed-length constraint and two legacy anon/authenticated policies remain. These results exactly match the reviewed migration preconditions.

**2026-07-15 pre-mutation gate:** the full audit was rerun at 02:53:45 UTC and the deployment version was reconfirmed. In Codex, inherited `TMP`/`TEMP` pointed to the Windows Temp directory; after setting all temporary-directory variables to `/tmp/diaryproject-codex` in one shell, `pnpm test` passed (10 files, 42 tests) and `pnpm exec tsc --noEmit` passed. `pnpm build` then failed in the Codex sandbox when Turbopack attempted to create a process/bind a port (`Operation not permitted`). No direct-access test, database mutation, Storage mutation, policy/grant change, bucket update, migration, or Worker deployment was attempted. Phased execution is stopped pending a clean rerun of all preflight checks.

**Direct-access runner gate:** after the user completed the build-related checks in a normal WSL terminal, Codex attempted the operator-only pre-change runner. It exited before any request or fixture creation because `SUPABASE_SERVICE_ROLE_KEY` is not present in this Codex environment. This is expected credential separation. No fixture, cleanup action, database mutation, Storage mutation, policy/grant change, bucket update, migration, or Worker deployment occurred. The matrix must be run from a controlled operator environment with the service-role key injected solely for cleanup.

**Runner-integrity exception:** the original byte-identical runner cannot be recovered from Git, workspace cache, or a trusted historical file copy. Codex reconstructed the previously authored logic from conversation context; it passes `node --check`, but hashes to `e82fe7b416da6c6b4780d25cf627d7653d291a2f8330922af0d845ce096cd38d`, not the originally recorded `ebe6062edc5fa03c797a025cf2f75a9232bf454feed95a1901c48759dc927eaf`. The SHA manifest deliberately retains the original expected value, so the mismatch remains visible for approval review.

**Runner acceptance:** DazhiWu explicitly accepted the reconstructed runner hash `e82fe7b416da6c6b4780d25cf627d7653d291a2f8330922af0d845ce096cd38d` for the pre-change matrix. The SHA manifest now records that accepted value.

**2026-07-15 direct-access preflight result:** runner ID `fea9c1d8-de10-4010-8eb4-772f5c21337d` failed on the first anon `diaryContent` insert with Node `fetch failed`; no access-control assertion was reached. Its finally cleanup also could not reach the API. A subsequent controlled read-only catalog check found zero tagged rows in every target table and zero objects under the run-ID Storage prefix. Per the stop rule, no further matrix row or Batch 5 production mutation was attempted.

**Restarted preflight checkpoint:** after commit `098e99e`, local tests (10 files, 42 tests), strict TypeScript checking, sandbox-exempt Next/OpenNext builds, and Wrangler deploy dry-run passed. Read-only production checks reconfirmed the reviewed database/Storage state and production Worker version. Production guest/viewer/admin login and read-role regression passed. Local workerd served the homepage, guest session, diary reads, and Supabase-backed data; Cookie login remained fail-closed with `503` because local preview lacks the production Cloudflare client-IP context required by the rate-limit binding, while the same login paths passed on the deployed Worker.

**Schema-correctness stop:** runner ID `4fed039b-5c54-416e-ac2e-f9a220abc5cd` reached the production Data API and confirmed the initial anon diary, AI, and health baseline operations. It then stopped because the runner supplied a long audit tag to the four-character `yearly_summaries.year` column. Cleanup reported complete; a separate read-only query returned zero matching rows in all ten target tables and zero matching Storage objects. The runner was corrected to use a four-digit audit year and ordered, ID-based cleanup. No Storage policy, bucket visibility, table policy, grant, migration, or Worker deployment changed.

**Media-path correctness stop:** corrected runner ID `41e68d22-ab22-4b58-a969-b5062af30738` reached the yearly-image fixture after successful anon baseline operations through the yearly-summary child tables. The deployed media-invariants trigger rejected the runner's nonconforming yearly path. Cleanup reported complete; independent read-only checks found zero tagged target-table rows, zero matching Storage objects, and no remaining four-digit audit-year summary. The runner was corrected to use the deployed `yearly/<positive-integer>.webp` and root-level `<name>.mp3` contracts. No production policy, grant, bucket, migration, or Worker changed.

## Storage

- `2024To2025_diary_images`, `2025_Summary_Images`, and `audio_messages` are all `public = true`; all have no configured MIME or size limit.
- The only `storage.objects` policies are global, apply to `{public}`, and are not bucket-scoped:
  - `Enable Insert access for all users`: `FOR INSERT WITH CHECK (true)`.
  - `Public read images 13zwbcf_0`: `FOR SELECT USING (true)`.
- No policy exists on `storage.buckets`.

## Application tables

- All Batch 5 target tables have RLS enabled, RLS not forced, and owner `postgres`.
- Every target public table has zero direct table-level `PUBLIC` ACL entries. This satisfies the final-approval prerequisite; the reviewed forward migrations therefore remove only the audited `anon`/`authenticated` grants and policies.
- `anon`, `authenticated`, and `service_role` currently have direct table-level `ALL`-equivalent privileges on the target tables; no column-level ACL (`pg_attribute.attacl`) exists.
- Sensitive-table policies are permissive `FOR ALL TO public USING (true)`:
  - `Enable read access for all users` on `diaryContent`, `diary_AI_analysis`, `health_conditions`, and `audio_messages`.
  - `Policy with security definer functions` on the yearly-summary tables.
- `anonymous_messages_content_length_check` is validated and exactly enforces `char_length(btrim(content)) >= 2 AND char_length(btrim(content)) <= 1000`.
- `anonymous_messages` currently grants SELECT/INSERT policies to both `anon` and `authenticated`. Repository inspection found only the browser anon client path; there is no Supabase Auth caller, so the final migration removes `authenticated` access and retains anon SELECT/INSERT only.

## Functions, views, and event trigger

- No public-schema view depending on a target table is accessible to `PUBLIC`, `anon`, or `authenticated`.
- `public.rls_auto_enable()` is `SECURITY DEFINER`, owned by `postgres`, and executable by `PUBLIC`, `anon`, `authenticated`, and `service_role`; it has one normal dependency: event trigger `ensure_rls`.
- This Batch 5 package does not reference or modify `rls_auto_enable`, `ensure_rls`, `diaryInfo`, or `rss_articles`.

## Approved-interface basis for bucket visibility

Supabase's current JavaScript reference documents `supabase.storage.updateBucket(bucketId, { public: false })`. The final execution runbook therefore uses that Storage API (or the equivalent Dashboard action), not a direct `UPDATE storage.buckets` statement.

## Record integrity

This record intentionally contains no credentials, API keys, tokens, cookies, URL query strings, raw user data, or complete operator-only catalog output. The complete SQL audit remains in `supabase/verification/20260715_batch5_production_audit.sql` and must be rerun immediately before production approval.
