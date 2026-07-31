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

Batches 3A and 3B are implemented in the working tree and accepted by the operator in local use. Their database schema is deployed, but the Worker source and feature are not deployed or production-accepted. The repository is ready to begin Batch 3C after the Phase 3A/3B working tree and this handoff documentation are committed:

- migration `20260730071934_phase3_theme_timeline.sql`, applied to production as `20260730080402_phase3_theme_timeline`, adds locked versioned runs, exact frozen source snapshots, proposed observations, immutable chunk evidence, versioned summaries, and review-history links;
- run creation verifies both the approved 598 count and corpus fingerprint `f5fc43c2927ce4413cff073e580cd4ce`, then stores all exact source IDs/hashes while marking only the selected date-range subset eligible;
- local processing claims one source per request, calls the run's frozen local Ollama model once, validates structured extractor output, and atomically stores zero or one observation plus cited current chunks;
- invalid structured outputs are explicit and retryable; their bounded structured diagnostics classify the validation failure and may include administrator-only, credential-redacted diary/model excerpts. Ollama timeout/unavailability returns the claimed source to pending and stops, ten-minute processing claims are resumable, and uniqueness prevents duplicate observations;
- each extraction request constrains Ollama decoding to the exact chunk indexes present for that source, and each summary request constrains it to the exact stored observation IDs. The server parser and database RPC continue to reject any value outside those sets;
- final summary generation is proposed-only, uses validated observation IDs, and exact coverage/month/first/last/distinct-diary values come from stored rows rather than model counting;
- immutable extractor/summary rules prohibit inferring causality from chronology, co-occurrence, repetition, or adjacent text; unsupported relationships must remain neutral or explicitly limited inference;
- the administrator UI exposes one paged observation/evidence card at a time, failed-source diagnostics, per-observation confirm/edit/reject with append-only before/after history, and versioned summary review. Editing or rejecting an observation moves linked active summaries to history; stale source/index/model/Prompt state blocks review;
- after every observation reaches confirmed/edited/rejected, a local-only action summarizes only confirmed/edited observations with one Ollama call when any remain, emits a deterministic fixed statement when none remain, excludes rejected observations, and atomically links the proposed replacement to the previous summary history head without rerunning diary extraction;
- GET and review can operate online after the Worker source is deployed, while create/process/retry/regenerate-summary remain local-only.
- the UI configures and freezes Ollama model, `num_ctx`, temperature, `top_p`, `top_k`, thinking, extraction/summary output limits, and two custom system prompts. Server-owned evidence, anti-injection, and JSON-schema rules remain mandatory. Migration `20260731015350_phase3_ollama_run_config.sql` stores that configuration and was applied to production as `20260731024031_phase3_ollama_run_config`.

Current local verification passes 196 tests, lint, TypeScript, the Next.js production build, and the OpenNext Cloudflare build. The base schema, FK indexes, Ollama configuration, observation-review, and summary-regeneration migrations/postflights passed. Two v3 one-month runs each completed 31/31 sources with zero failed/pending/stale sources after the evidence-index schema correction; their initial summaries were operator-confirmed. Phase 3B migrations were applied as production migrations `20260731063023_phase3_observation_review` and `20260731071402_phase3_summary_regeneration`. Least-privilege postflights, advisor comparisons, confirm/edit/reject/regenerate transaction smokes, and rollback-script smokes passed. The operator completed all observations in the latest reviewed run: 16 are confirmed/edited and 2 rejected; its summary history contains 2 superseded and 1 edited summary. Production retains 63 observations, 75 evidence rows, 6 summaries, 21 observation-review rows, and 1 summary-impact row. The local environment lookup no longer opens remote Workers binding connections for configured `.env.local` values; three authenticated read-only timing samples completed in 2.6 seconds cold and 1.3–1.4 seconds warm without `Establishing remote connection` log lines, and the operator reported the final review/regeneration test working normally. The approved 598 fingerprint remains unchanged and the eight pending index jobs stay outside all runs. Batch 3C local development may begin; complete role review, Worker deployment, refreshed full-corpus regeneration, and production acceptance remain pending. Batches 3C–3E have not been implemented.

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

Implementation status: **development-complete and operator-accepted locally, with the database schema applied; Worker deployment and production acceptance remain pending**. The finalized first type is `theme_timeline`; exact schema and lifecycle are documented in [`DATABASE.md`](DATABASE.md).

The exact table and enum names must be finalized against the current schema during implementation; this document does not pre-authorize an unreviewed migration.

### Batch 3B: administrator review queue

- Display proposed records with their original diary evidence.
- Support confirm, edit, reject, and supersede actions while preserving history.
- Never let a proposed or rejected interpretation masquerade as a confirmed user fact or viewpoint.

Implementation status: **development-complete and operator-accepted locally, including theme-summary review, per-observation review, and local summary regeneration**. Observation confirm/edit/reject is administrator-only, keeps immutable evidence, appends before/after history, invalidates linked active summaries on edit/reject, and blocks stale/incomplete runs. Regeneration requires all observations to reach a terminal review state and uses only confirmed/edited observations. A general multi-type review queue remains deferred.

### Batch 3C: corpus aggregation

- Add recurring-theme and time-bounded summary generation only after the review lifecycle is reliable.
- Compute exact counts, first/last dates, and period groupings in PostgreSQL from structured evidence records rather than asking a model to count sampled excerpts.
- Distinguish literal counts from semantic extractor results. Semantic counts must show the corpus coverage and extractor/model version.
- Preserve links from an aggregate through its observations to the original diary excerpts.

Implementation status: **ready to start; no Phase 3C schema, migration, API, or UI has been implemented**.

#### Phase 3C new-conversation handoff

At the start of the new development conversation:

1. Read `README.md`, `AGENTS.md`, `docs/DATABASE.md`, `docs/DEPLOY.md`, this plan, and `docs/DIGITAL_TWIN_ROADMAP.md`; inspect `git status`, the Phase 3A/3B commit, current migrations, and the actual `understanding_*` code before designing 3C.
2. Treat the approved 598 completed-source fingerprint as the fixed development baseline. Do not process the eight pending diaries, create another full-range extraction run, or call a paid service merely to start 3C. The reviewed monthly run is sufficient for the first aggregation implementation and acceptance fixture.
3. Design the smallest independently useful aggregate contract before writing a migration. It must select only `confirmed` or `edited` observations from completed/current, non-stale runs and must exclude proposed, rejected, superseded, stale, incomplete, pending, and out-of-range records.
4. Compute literal counts, distinct diary counts, first/last dates, and calendar period groupings in PostgreSQL. Keep semantic extractor/model results in separately labeled fields with frozen corpus coverage and extractor/model/prompt versions; never present semantic occurrence counts as literal diary counts.
5. Preserve the complete provenance path from every aggregate to contributing observation IDs, immutable evidence rows, and original source diaries. Do not rewrite reviewed observations or evidence and do not silently merge independent pilot/full-range runs.
6. Keep aggregate creation and regeneration explicit and administrator-only. Any new tables/functions require RLS, no anon/authenticated access, service-role-only invoker functions, a rollback that preserves diaries/index/3A/3B data, a least-privilege postflight, and migration contract tests.
7. Do not create a Supabase branch or perform any task that can generate charges. Prepare migrations locally first; apply a 3C migration to production only after a separate operator confirmation and a verified rollback plan.
8. Finish the batch with `pnpm test`, `pnpm lint`, TypeScript, `pnpm build`, `pnpm cf:build`, and `git diff --check`, then update the durable documentation. Worker deployment, pending-index completion, a refreshed full-corpus checkpoint, affected-derived-data regeneration, and the administrator/guest/viewer production matrix remain later Phase 3 production-acceptance work.

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

Copy-ready theme wording and the immutable boundary between a small pilot and a full-range run are documented in [`THEME_TIMELINE_THEME_CATALOG.md`](THEME_TIMELINE_THEME_CATALOG.md). A pilot and a later full-range run are independent: current Phase 3A does not copy observations between runs or merge their summaries.

## Runtime and provider boundary

- Initial extraction is an explicit local administrator operation, consistent with the existing local-only document-indexing boundary.
- Do not run a hundreds-of-sources generation loop on a synchronous deployed Worker request.
- Phase 3A extraction and non-empty summary generation use native local Ollama `/api/chat` structured output and do not reserve ModelScope quota. Each eligible source costs one local call for that theme run; a run with at least one observation adds one summary call. Creating another theme creates another independent pass over its eligible range, but a single source call is not multiplied internally by the number of themes.
- Provider timeout/unavailability must release the current claim to pending and stop without counting it as analyzed. Invalid structured output is a bounded failed source and may be retried.
- `OLLAMA_BASE_URL` is trusted server-only configuration. Windows Ollama may need an explicitly firewalled WSL-reachable bind; never allow a public unauthenticated listener and never accept its URL from a request body.
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
