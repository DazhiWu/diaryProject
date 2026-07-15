# Batch 5 Production Approval Plan

## Status and scope

**Status:** Storage phase completed on 2026-07-15; diary/AI table lockdown awaits separate approval. All three media buckets are private, Storage policies are absent, platform ACLs are preserved behind RLS, direct anon access is denied, and authorized proxies passed production regression.

**Goal:** Make the three diary media buckets private and remove direct anon access to sensitive application data, without changing the existing Cookie-authorized API contracts.

**Out of scope:** `rss_articles`; deleting `diaryInfo`; changing application code, credentials, domains, Workers Builds settings, or the `public.rls_auto_enable()` function before a separate dependency review.

## Evidence accepted from Batch 4

- The deployed 2026-07-15 regression recorded guest/viewer/admin rejection, health/yearly CRUD, media mutation and proxy-read coverage, and audio Range streaming.
- The client scan leaves only `anonymous_messages` anon SELECT/INSERT.
- Current local role/media tests pass. This is supporting evidence, not a substitute for the production preflight below.

## Approval prerequisites

All items must be attached to the production change record before implementation approval:

1. A named production approver and rollback owner.
2. A fresh, read-only execution of `supabase/verification/20260715_batch5_production_audit.sql`; the initial 2026-07-15 record is in `supabase/operator-records/20260715_batch5_readonly_audit.md`, but it must be rerun immediately before approval.
3. An authenticated WSL/workerd-preview smoke test and a deployed guest/viewer/admin regression using the current production Worker.
4. A pre-migration status-only matrix: guest proxy for an image-bearing fixture inside the latest-five window `200`, historical guest diary proxy outside that window `403`, the same historical viewer proxy `200`, admin audio Range `206`, plus the observed direct-public object/list/write results.
5. Review of the rendered, audit-filled SQL migrations and their exact rollback SQL. No placeholder or draft file may be executed.
6. Confirmation that `docs/DATABASE.md`'s obsolete Overview statement about localStorage-only authentication is corrected in the implementation change.

## Execution order after approval

1. Run the read-only audit and archive the output outside the repository.
2. Apply `supabase/migrations/20260715_02_private_media_storage_policies.sql` first, then run `supabase/verification/20260715_storage_policy_lockdown_postflight.sql` and the anonymous Storage write/list matrix while buckets remain public.
3. Only after that check passes, use the documented Storage API runbook in `supabase/drafts/20260715_02_private_media_bucket_api.md` to set the three bucket `public` flags to `false`, then run `supabase/verification/20260715_storage_access_postflight.sql` and the full proxy/direct-access matrix. If a proxy result changes, first restore bucket visibility, then apply the exact Storage rollback SQL, and roll back the Worker version if required.
4. Apply the reviewed RLS/grants migrations one domain at a time: `20260715_03_diary_ai_rls.sql`, `20260715_04_health_rls.sql`, `20260715_05_yearly_summary_rls.sql`, then `20260715_06_audio_rls.sql`; apply the anonymous-message least-privilege migration last.
5. After each domain, run its postflight, `pnpm test`, deployed role regression, and Cloudflare observability checks. Restore only that domain's reviewed policy/grant stanza on failure.
6. Check Supabase advisors, confirm `diaryInfo` remains untouched and `rss_articles` was absent from every statement, then update the focused documentation.

## Approval record

| Field | Required value before execution |
|---|---|
| Production approver | DazhiWu — final production-execution approval remains Pending |
| Rollback owner | DazhiWu |
| Worker version before change | `c41d583a-af78-426e-9808-369424df1531` — 100% of the latest `diaryproject` deployment, read-only `wrangler deployments list` on 2026-07-15 |
| Audit timestamp and operator-only record | 2026-07-15 10:43:12 CST (02:43:12 UTC); `supabase/operator-records/20260715_batch5_readonly_audit.md`; rerun required immediately before approval |
| Pre-migration regression record | Batch 4 production regression passed 2026-07-15. The Batch 5 direct-access matrix was corrected and reviewed on 2026-07-15; its production execution remains Pending final approval. |
| Reviewed Storage migration checksum | `supabase/operator-records/20260715_batch5_sha256sums.txt` |
| Reviewed RLS/grants migration checksum | `supabase/operator-records/20260715_batch5_sha256sums.txt` |

## 2026-07-15 execution preflight record

- Full read-only production audit completed at 10:53:45 CST (02:53:45 UTC). The three target buckets remain public, the two exact audited global Storage policies remain, target RLS/ACL/column-ACL state remains as reviewed, and the anonymous-message constraint remains exact.
- Read-only Cloudflare deployment check confirmed `c41d583a-af78-426e-9808-369424df1531` remains the 100% production version.
- Codex environment record before override: working directory `/home/zhizhi/projects/diaryProject`; inherited `TMP` and `TEMP` were both `/mnt/c/Users/Administrator/AppData/Local/Temp`; Node resolved that same Windows path; process identity was `uid=1000(zhizhi) gid=1000(zhizhi)`; `/tmp` was mode `1777`.
- In one shell, `TMPDIR`, `TMP`, and `TEMP` were set to `/tmp/diaryproject-codex` (mode `0700`) and Node then resolved `/tmp/diaryproject-codex`.
- `pnpm test` passed: 10 files, 42 tests. `pnpm exec tsc --noEmit` passed with no output. `pnpm build` then failed inside the Codex execution sandbox: Turbopack could not create a process/bind a port while processing `app/globals.css` (`Operation not permitted`, panic log under `/tmp/diaryproject-codex`).
- Per the approved stop rule, do not run `pnpm cf:build`, Wrangler dry-run, the direct-access matrix, or any production mutation until this Codex sandbox build failure is resolved and the entire preflight is restarted.
- The user subsequently confirmed that `pnpm build`, `pnpm cf:build`, and `pnpm exec wrangler deploy --dry-run` passed in a normal WSL terminal. Codex then prepared the direct-access runner, but it stopped before creating any fixture because this environment does not have `SUPABASE_SERVICE_ROLE_KEY`; the key is intentionally unavailable in `.env.local`. Run the operator script only from a controlled environment that injects the service-role key for mandatory cleanup, without exposing it to this repository or chat.
- DazhiWu accepted the reconstructed direct-access runner hash `e82fe7b416da6c6b4780d25cf627d7653d291a2f8330922af0d845ce096cd38d` for this production preflight; the prior unrecoverable original hash is superseded in the approved checksum manifest.
- The accepted runner began the direct-access matrix with run ID `fea9c1d8-de10-4010-8eb4-772f5c21337d`, but its first anon Data API request failed at the Codex Node network layer (`fetch failed`) before an access-control assertion. Read-only post-run verification found zero tagged database rows and zero tagged Storage objects. This is a failed direct-access preflight; stop before Storage lockdown or any other Batch 5 mutation.
- After commit `098e99e`, the full local preflight was restarted: 10 test files/42 tests passed, `pnpm exec tsc --noEmit` passed, and sandbox-exempt `pnpm build`, `pnpm cf:build`, and `pnpm exec wrangler deploy --dry-run` passed. Read-only Supabase and Cloudflare checks reconfirmed the reviewed database/Storage state and Worker version `c41d583a-af78-426e-9808-369424df1531`. Production guest/viewer/admin login and read-role regression passed. Local workerd guest reads passed, while Cookie login returned the expected fail-closed `503` because local preview does not supply the production-only Cloudflare client-IP context required by the rate-limit binding; production Cookie login passed.
- Pre-change runner ID `4fed039b-5c54-416e-ac2e-f9a220abc5cd` reached production and confirmed the initial anon diary/AI/health operations, then stopped on its invalid `yearly_summaries.year` fixture because production constrains the field to four characters. Its cleanup reported complete, and an independent read-only query confirmed zero run-ID rows across all target tables and zero Storage objects. The runner now uses a four-digit audit year and ordered, ID-based cleanup; rerun and checksum acceptance remain required before any Batch 5 mutation.
- Corrected runner ID `41e68d22-ab22-4b58-a969-b5062af30738` then confirmed anon baseline access through the yearly-summary child tables before the existing media-invariants trigger rejected its nonconforming yearly-image path. Cleanup reported complete; independent read-only checks found zero run-ID rows, zero matching Storage objects, and no four-digit audit-year summary. The runner now uses the deployed `yearly/<positive-integer>.webp` and root-level `<name>.mp3` path contracts. A new checksum and successful full rerun remain required.
- Media-correct runner ID `df15eee6-0617-4d41-9b60-a7d3fa9f0b6f` completed the Data API and Storage baseline rows, then stopped because the production latest-five diary window contained no image-bearing row and the runner's own future diary fixture had no image. Cleanup reported complete; independent checks returned zero tagged rows and objects. The runner now provisions a valid, uniquely owned diary image for its latest-five fixture, uses an existing image only for the historical outside-window denial/viewer checks, and verifies persistence after nominally successful RLS/Storage negative operations.
- Hardened runner ID `2b3be848-309b-43ea-8ad7-cfc0f59f4eec` passed every Data API, Storage-persistence, and proxy assertion and reported cleanup complete. Independent read-only verification found zero tagged rows, zero audit-year summary, and zero matching Storage objects. The Node process remained open only because client keep-alive handles were still active and was manually terminated after recording the complete result; the runner now exits explicitly after successful cleanup. One final exit-zero rerun remains required before mutation approval.
- Final pre-change runner ID `2ef26a54-0c79-49ff-9a54-e46397dab65b` exited `0` with every assertion passed and cleanup complete. Independent read-only verification found zero tagged rows, zero audit-year summary, and zero matching Storage objects. The immediate pre-approval audit reconfirmed three public target buckets, exactly two Storage object policies, no Storage bucket policy, ten target tables with RLS enabled, eleven target public-table policies, and no column ACLs. Cloudflare still serves Worker version `c41d583a-af78-426e-9808-369424df1531` at 100%. No Batch 5 production mutation has occurred.
- DazhiWu approved phased execution. The first Storage migration attempt dropped the two audited policies and revoked grants as the active `postgres` role, but postflight failed because the effective grants were originally issued by `supabase_storage_admin`. The exact rollback restored both policies; a corrective `REVOKE ... GRANTED BY postgres` then removed only duplicate grants introduced by rollback. Read-only verification confirmed three public buckets, the two original policies, effective pre-change access, and exactly one ACL grantor (`supabase_storage_admin`) for anon, authenticated, and service_role. No bucket, application-table RLS/grant, or Worker change occurred.
- The revised Storage migration now changes only the two RLS policies. It intentionally preserves the platform-owned ACL grants on the RLS-enabled `storage.objects` and `storage.buckets` relations; postflight verifies RLS, zero policies, the exact `supabase_storage_admin` ACL baseline, service-role access, and direct Storage behavior. The rollback recreates only the two audited policies. Revised checksum review and explicit reapproval are required before retrying the Storage phase.
- DazhiWu approved the revised phase. Migration `batch5_private_media_storage_policies_v2` and its fail-closed postflight passed. Behavior run `e11cedab-49d3-4192-9ea3-3d6e185d4d02` exited `0`: anon list/upload/overwrite were denied; nominal delete responses did not remove service-role-seeded objects; all three direct public URLs remained `200` while buckets stayed public; proxies returned diary guest-current `200`, guest-historical `403`, viewer-historical `200`, yearly guest `200`, and admin audio Range `206`; cleanup completed. Independent verification found zero tagged rows/objects, zero Storage policies, both Storage relations with RLS enabled, three public buckets, exact 16-entry `supabase_storage_admin` ACL baselines for anon/authenticated/service_role, and no unexpected grantor. Bucket visibility has not yet changed.
- DazhiWu separately approved the bucket update. The service-role Storage API set all three target buckets to `public=false`, and the private-bucket postflight passed. Final Storage run `2dcc7fcf-8b2a-4572-a511-1cb726346231` exited `0`: all three direct public URLs returned `400`; anon list/upload/overwrite/delete did not expose or mutate objects; proxies remained diary guest-current `200`, guest-historical `403`, viewer-historical `200`, yearly guest `200`, and admin audio Range `206`; cleanup completed. Independent verification found zero tagged rows/objects, three private buckets, zero Storage policies, both relations with RLS enabled, exact 16-entry platform ACL baselines, and no unexpected grantor. The Storage phase is complete; application-table migrations remain unapplied.

## Verification commands

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm build
pnpm cf:build
pnpm exec wrangler deploy --dry-run
pnpm preview
```

Do not run a Supabase mutation until the approval record is complete and the draft SQL has been converted into reviewed, exact migrations.
