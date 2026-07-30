# Phase 3 Auditable Understanding Development Plan

## Purpose

Phase 3 adds an administrator-only, auditable understanding layer over multiple private diaries. It addresses questions that the synchronous Fact Layer cannot answer reliably with a fixed Top-K evidence window, including recurring themes, time-bounded change, cross-diary synthesis, and reproducible frequency summaries.

This is the handoff document for the Phase 3 development conversation. Read it with [`FACT_LAYER_PLAN.md`](FACT_LAYER_PLAN.md), [`DIGITAL_TWIN_ROADMAP.md`](DIGITAL_TWIN_ROADMAP.md), [`DATABASE.md`](DATABASE.md), [`DEPLOY.md`](DEPLOY.md), and [`../AGENTS.md`](../AGENTS.md).

## Entry state

As of 2026-07-30:

- Phase 2 is committed on `main` as `0bc4b45`, deployed as Worker version `b258ef8d-e303-42f2-941b-2dd72a2391ea`, and accepted in production.
- The immediate Worker rollback version is `b897c9f4-0e65-41d9-b5ae-2aafc0245b89`.
- The production checkpoint contains 605 diaries/settings, 773 chunks, 598 completed knowledge-index jobs, 7 pending jobs, and no processing, failed, or excluded sources.
- The seven pending sources have no chunks or indexed-content hash.
- The operator has approved the current 598 completed indexed sources as the fixed initial development corpus. Daily diary writes may continue to accumulate pending jobs while Phase 3 is under development.

Phase 3 may begin. The pending backlog is intentionally deferred until the feature is complete and does not block development.

## Current implementation state

Batch 3A and the recommended theme-timeline slice are implemented in the working tree. The database schema is deployed, but the Worker source and feature are not deployed or production-accepted:

- migration `20260730071934_phase3_theme_timeline.sql`, applied to production as `20260730080402_phase3_theme_timeline`, adds locked versioned runs, exact frozen source snapshots, proposed observations, immutable chunk evidence, versioned summaries, and review-history links;
- run creation verifies both the approved 598 count and corpus fingerprint `f5fc43c2927ce4413cff073e580cd4ce`, then stores all exact source IDs/hashes while marking only the selected date-range subset eligible;
- local processing claims one source per request, reserves one ModelScope slot, validates structured extractor output, and atomically stores zero or one observation plus cited current chunks;
- failed sources are explicit and retryable, quota stops return the claimed source to pending, ten-minute processing claims are resumable, and uniqueness prevents duplicate observations;
- final summary generation is proposed-only, uses validated observation IDs, and exact coverage/month/first/last/distinct-diary values come from stored rows rather than model counting;
- the administrator UI exposes original diary evidence and supports confirm, edit, reject, and supersede while preserving summary history; stale source/index/model/Prompt state blocks confirmation;
- GET and review can operate online after the Worker source is deployed, while create/process/retry remain local-only.

Local verification currently passes 173 tests, lint, the Next.js production build, the OpenNext Cloudflare build, Wrangler dry-run, and `git diff --check`. Production migration execution, least-privilege postflight, and a transaction-only create/snapshot/claim/release rollback smoke passed on 2026-07-30 without generating model output or changing the 598 completed/7 pending index checkpoint. Follow-up migration `20260730081356_phase3_theme_timeline_fk_indexes` covers both advisor-reported foreign keys and passed its postflight while the six derived tables remained empty. Security advisors show only intentional deny-by-default RLS INFO items; performance advisors no longer report unindexed foreign keys and show only expected empty-table unused-index INFO items. Full isolated rollback, browser verification, Worker deployment, and production acceptance remain pending. Batches 3C–3E have not started.

## Development-corpus contract

- The initial Phase 3 run must snapshot the exact source IDs and indexed-content hashes of the 598 completed sources. A count alone is not a reproducible corpus identity.
- Pending, processing, failed, excluded, missing-chunk, or missing-hash sources are not eligible for development analysis.
- Every analysis run must expose its date range plus eligible, processed, failed, stale, and excluded source counts. “All diaries” may be displayed only when processed coverage equals the run's frozen eligible set.
- If an already indexed source is edited and returns to `pending`, its old chunks or derived records must not silently count as current evidence.
- Daily diary growth may increase the pending count without changing the frozen development corpus. Do not repeatedly sync merely to keep Phase 3 development aligned with the newest diary.
- Before Phase 3 production acceptance, process all remaining eligible index jobs, create a new full-corpus checkpoint, invalidate or regenerate affected derived data, and rerun coverage and source-citation verification.

## Product boundary

Keep two separate administrator workflows:

1. **Factual answer**: retain the current synchronous Embedding, hybrid Top-20 retrieval, Top-5 reranking, merge/diversification, and cited answer path for localized factual questions.
2. **Corpus analysis**: enumerate a frozen eligible source set, extract structured observations in resumable batches, aggregate them deterministically where possible, and generate reviewable conclusions with original-diary evidence.

Do not solve corpus analysis by only increasing the existing Top-K constants or by placing the entire diary corpus in one prompt.

## Recommended independent batches

### Batch 3A: versioned evidence model and run lifecycle

- Design migrations and rollback for analysis runs, proposed observations, and evidence links.
- Preserve source ID, indexed-content hash, source date, chunk/character range, analysis type, model version, prompt version, generation time, and review state.
- Use service-role-only tables/functions with RLS enabled and no anon/authenticated grants or policies.
- Add claim/resume/failure behavior for explicit local administrator processing.
- Start with one small administrator-selected date range and one understanding type.

Implementation status: **implemented locally with the database schema applied; Worker deployment and feature acceptance remain pending**. The finalized first type is `theme_timeline`; exact schema and lifecycle are documented in [`DATABASE.md`](DATABASE.md).

The exact table and enum names must be finalized against the current schema during implementation; this document does not pre-authorize an unreviewed migration.

### Batch 3B: administrator review queue

- Display proposed records with their original diary evidence.
- Support confirm, edit, reject, and supersede actions while preserving history.
- Never let a proposed or rejected interpretation masquerade as a confirmed user fact or viewpoint.

Implementation status: **minimal theme-summary review lifecycle implemented as part of the first usable slice**. A general multi-type review queue remains deferred.

### Batch 3C: corpus aggregation

- Add recurring-theme and time-bounded summary generation only after the review lifecycle is reliable.
- Compute exact counts, first/last dates, and period groupings in PostgreSQL from structured evidence records rather than asking a model to count sampled excerpts.
- Distinguish literal counts from semantic extractor results. Semantic counts must show the corpus coverage and extractor/model version.
- Preserve links from an aggregate through its observations to the original diary excerpts.

### Batch 3D: change and contradiction analysis

- Compare selected periods using reviewed observations.
- Label direct facts, summaries, and inferences separately.
- Keep possible contradictions or turning points as proposed interpretations until reviewed.

### Batch 3E: optional factual-answer integration

- Permit the Fact Layer to use confirmed understanding only after the new authorization, stale-data, and review-state filters are proven.
- Continue citing the original diaries behind every confirmed derived record.
- Preserve the existing raw-diary factual-answer path and explicit insufficient-evidence response.

## Recommended first usable slice

Build an administrator-selected **theme timeline**:

- input: one theme and an explicit date range;
- processing: the frozen eligible sources in that range, not a Top-K sample;
- output: eligible/processed/failed/stale coverage, distinct diary count, period distribution, first/last supported dates, original citation cards, and a clearly labeled proposed summary;
- review: confirm, edit, reject, or supersede the proposed summary;
- regeneration: source-hash or model/prompt-version changes make the result stale rather than silently overwriting it.

This slice proves the full-corpus and provenance contracts before introducing a general private-twin interface.

## Runtime and quota boundary

- Initial extraction is an explicit local administrator operation, consistent with the existing local-only document-indexing boundary.
- Do not run a hundreds-of-sources generation loop on a synchronous deployed Worker request.
- ModelScope-backed extraction must respect the existing Beijing-day 180-call reservation limit. Jobs must pause cleanly when quota is unavailable and resume without duplicating confirmed work.
- Batch sizing must remain under the current request limits and must not weaken citation validation to reduce call count.
- Online read/query interfaces may use stored reviewed results after their authorization and stale-data filters are implemented.

## Required verification

- Frozen-source snapshot reproducibility and accurate coverage counts.
- Interrupted-run resume, bounded failures, no duplicate observation creation, and safe retry behavior.
- Source-hash changes mark dependent observations/aggregates stale.
- Pending or excluded sources cannot influence a completed analysis run.
- Proposed, rejected, superseded, and stale records cannot influence confirmed-only answers.
- Every displayed interpretation traces to server-owned original diary evidence.
- Exact frequency results come from deterministic aggregation; semantic frequency results disclose coverage and extractor version.
- New tables/functions pass least-privilege and RLS postflight checks.
- Guest and viewer roles cannot access Phase 3 APIs or UI.
- Original diaries and existing knowledge chunks remain intact after migration rollback or derived-data regeneration.
- `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm cf:build`, and `git diff --check` pass for the completed batch.

## Phase 3 production-acceptance gate

Before declaring Phase 3 complete:

1. Finish all remaining eligible diary index jobs and capture a fresh production data checkpoint.
2. Rebuild or regenerate every derived record affected by the expanded source set.
3. Verify full eligible-source coverage and stale-record exclusion.
4. Preserve the applied migration, rollback script, and least-privilege postflight evidence; apply any later Phase 3 migrations with the same gate.
5. Deploy the intended commit, record the new Worker and immediate rollback versions, and run the administrator/guest/viewer acceptance matrix.
6. Update this plan, the roadmap, database documentation, deployment documentation, README, and `AGENTS.md` with confirmed final behavior.
