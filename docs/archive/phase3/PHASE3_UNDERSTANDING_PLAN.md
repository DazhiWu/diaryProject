# Phase 3 Auditable Understanding Development Plan

> Historical / paused: the active product is now the [Private Diary Recall Assistant](../../PRIVATE_RECALL_ASSISTANT.md). Do not execute the rollout or development sequence below without a new explicit decision to resume it. Runtime code has been removed; applied Phase 3A–3C data remains dormant, and never-applied 3D/v4 SQL is archived outside the migration runner.

## Purpose

Phase 3 adds an administrator-only, auditable understanding layer over multiple private diaries. It addresses questions that the synchronous Fact Layer cannot answer reliably with a fixed Top-K evidence window, including recurring themes, time-bounded change, cross-diary synthesis, and reproducible frequency summaries.

This is the handoff document for the Phase 3 development conversation. Read it with [`FACT_LAYER_PLAN.md`](../../FACT_LAYER_PLAN.md), [`DIGITAL_TWIN_ROADMAP.md`](DIGITAL_TWIN_ROADMAP.md), [`DATABASE.md`](../../DATABASE.md), [`DEPLOY.md`](../../DEPLOY.md), and [`AGENTS.md`](../../../AGENTS.md).

## Entry state

As of 2026-07-30:

- Phase 2 is committed on `main` as `0bc4b45`, deployed as Worker version `b258ef8d-e303-42f2-941b-2dd72a2391ea`, and accepted in production.
- The immediate Worker rollback version is `b897c9f4-0e65-41d9-b5ae-2aafc0245b89`.
- The production checkpoint contains 605 diaries/settings, 773 chunks, 598 completed knowledge-index jobs, 7 pending jobs, and no processing, failed, or excluded sources.
- The seven pending sources have no chunks or indexed-content hash.
- The operator has approved the current 598 completed indexed sources as the fixed initial development corpus. Daily diary writes may continue to accumulate pending jobs while Phase 3 is under development.

Phase 3 may begin. The pending backlog is intentionally deferred until the feature is complete and does not block development.

## Current implementation state

Batches 3A and 3B are implemented and accepted by the operator in local use. Batch 3C is implemented and its production pilot rollout is accepted. Batch 3D is development-complete in source but has not been migrated or deployed. The 3C source migration was applied as `20260803025058_phase3_corpus_aggregation`, and Worker `cd1f5f09-a607-4781-8be0-36eba039762f` serves the 3A–3C API/client/administrator UI. Final refreshed full-corpus Phase 3 acceptance remains pending:

- migration `20260730071934_phase3_theme_timeline.sql`, applied to production as `20260730080402_phase3_theme_timeline`, adds locked versioned runs, exact frozen source snapshots, proposed observations, immutable chunk evidence, versioned summaries, and review-history links;
- run creation verifies both the approved 598 count and corpus fingerprint `f5fc43c2927ce4413cff073e580cd4ce`, then stores all exact source IDs/hashes while marking only the selected date-range subset eligible;
- local processing claims one source per request, calls the run's frozen local Ollama model once, validates structured extractor output, and atomically stores zero or one observation plus cited current chunks;
- invalid structured outputs are explicit and retryable; their bounded structured diagnostics classify the validation failure and may include administrator-only, credential-redacted diary/model excerpts. Ollama timeout/unavailability returns the claimed source to pending and stops, ten-minute processing claims are resumable, and uniqueness prevents duplicate observations;
- each extraction request constrains Ollama decoding to the exact chunk indexes present for that source, and each summary request constrains it to the exact stored observation IDs. The server parser and database RPC continue to reject any value outside those sets;
- final summary generation is proposed-only, uses validated observation IDs, and exact coverage/month/first/last/distinct-diary values come from stored rows rather than model counting;
- immutable extractor/summary rules prohibit inferring causality from chronology, co-occurrence, repetition, or adjacent text; unsupported relationships must remain neutral or explicitly limited inference;
- the administrator UI exposes one paged observation/evidence card at a time, failed-source diagnostics, per-observation confirm/edit/reject with append-only before/after history, and versioned summary review. Editing or rejecting an observation moves linked active summaries to history; actual source/index/model/Prompt drift and incomplete/failed coverage both block review, but the UI reports those causes separately;
- an irrelevant extraction with null statement and empty evidence is canonicalized to the all-null/empty form even if Ollama retains a recognized classification label. It persists no observation; non-empty statement/evidence or an unknown classification remains a bounded retryable failure;
- after every observation reaches confirmed/edited/rejected, a local-only action summarizes only confirmed/edited observations with one Ollama call when any remain, emits a deterministic fixed statement when none remain, excludes rejected observations, and atomically links the proposed replacement to the previous summary history head without rerunning diary extraction;
- GET, review, and deterministic aggregate regeneration can operate online after the matching database migration and Worker source are deployed, while create/process/retry/regenerate-summary remain local-only.
- the UI configures and freezes Ollama model, `num_ctx`, temperature, `top_p`, `top_k`, thinking, extraction/summary output limits, and two custom system prompts. Server-owned evidence, anti-injection, and JSON-schema rules remain mandatory. Migration `20260731015350_phase3_ollama_run_config.sql` stores that configuration and was applied to production as `20260731024031_phase3_ollama_run_config`.

The last accepted 3A/3B checkpoint passed 196 tests, lint, TypeScript, the Next.js production build, and the OpenNext Cloudflare build. Its base schema, FK indexes, Ollama configuration, observation-review, and summary-regeneration migrations/postflights passed. Two v3 one-month runs each completed 31/31 sources with zero failed/pending/stale sources after the evidence-index schema correction; their initial summaries were operator-confirmed. Phase 3B migrations were applied as production migrations `20260731063023_phase3_observation_review` and `20260731071402_phase3_summary_regeneration`. Least-privilege postflights, advisor comparisons, confirm/edit/reject/regenerate transaction smokes, and rollback-script smokes passed. The operator completed all observations in the latest reviewed run: 16 are confirmed/edited and 2 rejected; its summary history contains 2 superseded and 1 edited summary. A separate September 2025 run was recovered from one harmless `relevant=false` classification residue: retry completed 30/30 sources with zero failed/pending/stale sources, retained 21 observations, and generated one proposed summary. The approved 598 fingerprint remains unchanged; the live backlog has since grown from eight to 11 pending jobs, all outside every frozen run.

Phase 3C migration `20260803021419_phase3_corpus_aggregation.sql` introduces one-current-version-per-run aggregate history, monthly literal/semantic statistic rows, frozen reviewed-observation contribution rows, explicit transactional regeneration, and dynamic stale reasons. It uses no model or paid service and never merges independent runs. Production postflight/advisors, reviewed-pilot transaction generation, superseding-version logic, real rollback statements, Worker deployment, and guest/viewer/admin role acceptance passed. The current reviewed-pilot aggregate covers 31/31 sources, 16 accepted observations and 16 distinct diaries in one monthly period with no stale reasons.

Phase 3D migration `20260803034844_phase3_change_contradiction_analysis.sql` plus rollback/postflight, server orchestration, API/client/UI, and tests are implemented in source. Source verification, including the Phase 3A irrelevant-result regression, passes 218 tests across 43 files, lint, strict TypeScript, the Next.js production build, the OpenNext Cloudflare build, Wrangler `4.108.0` dry-run, and `git diff --check`. The pre-migration reader now degrades only a missing 3D comparison table to an empty comparison history, preserving 3A–3C startup while leaving every other database error fatal. Its production PostgreSQL transaction/rollback smokes, postflight, advisors, migration application, Worker deployment, role matrix, and real cross-month review acceptance have not run. Because the current reviewed pilot has only one monthly period, this batch deliberately stores no fabricated comparison. The 11 pending index jobs remain outside all runs. Refreshed full-corpus indexing/regeneration and final Phase 3 acceptance remain pending; Batch 3E has not been implemented.

The Phase 3A v4 semantic-quality hardening is development-complete in source after the September friendship pilot exposed a scope leak: the selected chunks did contain friendship evidence, but an observation centered on co-occurring airfare, travel-failure, and broken-glasses content. Migration `20260803082412_phase3_theme_semantic_quality_v4.sql` freezes a structured ThemeSpec, permits multiple exact sentence ranges per chunk, stores relevant/uncertain scope decisions, and introduces `awaiting_review` before the first summary. The 4B pipeline now classifies every server-owned sentence ID into complete disjoint relevant/uncertain/irrelevant buckets, validates the partition, and gives the synthesis call only the relevant bucket (or the uncertain bucket when no relevant unit exists). A real local `qwen3.5:4b` spot check showed why this is necessary: a single selected-ID list produced reasoning that rejected the travel sentence while still returning its ID; the complete-bucket contract plus explicit friendship include/exclude rules returned only the friendship unit. Existing v3 runs are retained as stale history and are not rewritten. The migration, guarded rollback, read-only postflight, route/client/UI, static regression fixtures, and migration contracts are checked in. Source verification passes 229 tests across 45 files, lint, strict TypeScript, `git diff --check`, the Next.js production build, OpenNext Cloudflare build, and Wrangler `4.108.0` deployment dry-run. An isolated, unlinked Supabase CLI `2.111.0` PostgreSQL 17 environment passed the real migration and read-only postflight; transaction fixtures passed exact-evidence rejection, all relevant/uncertain/irrelevant persistence branches, `awaiting_review`, review-filtered first-summary finalization, real rollback, pre-v4 restoration checks, reapplication, and repeat postflight/functional smoke. All fixture rows rolled back. Production advisors, migration application, Worker deployment, role acceptance, and a newly generated reviewed v4 pilot remain separate gates. No production data was changed.

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

Implementation status: **development-complete and operator-accepted locally, with the database schema and stored-run read/review route deployed; refreshed full-corpus acceptance remains pending**. The finalized first type is `theme_timeline`; exact schema and lifecycle are documented in [`DATABASE.md`](../../DATABASE.md).

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

Implementation status: **production pilot rollout accepted; refreshed full-corpus regeneration and final Phase 3 acceptance remain pending**.

#### Phase 3C implemented contract and rollout handoff

The implementation now enforces:

1. One aggregate belongs to exactly one completed `theme_timeline` run. It cannot merge pilot and full-range runs.
2. The database refuses incomplete or live-stale source snapshots and requires every observation to be confirmed, edited, or rejected. Only confirmed/edited rows contribute.
3. `understanding_aggregates` freezes corpus coverage and extractor/model/prompt/config versions; `understanding_aggregate_periods` separates literal eligible/processed source counts from semantic reviewed-observation/distinct-diary counts; all counts and dates are computed in PostgreSQL.
4. `understanding_aggregate_observations` snapshots each contributing reviewed statement/version and evidence count while keeping the foreign-key path through immutable evidence to the source diary.
5. A partial unique index permits only one `current` aggregate per run. Regeneration supplies the previous aggregate ID, supersedes it atomically, and preserves history. Source, observation, review, or evidence drift is reported as stale rather than silently overwritten.
6. Aggregate regeneration is an Origin-checked administrator mutation but does not require local execution because it performs no provider call. Extraction and summary regeneration remain local-only.
7. All 3C tables have RLS with no browser policies or grants. Both RPCs are `SECURITY INVOKER`, service-role-only, and use an empty `search_path`. The rollback preserves diaries/index/3A/3B data; the postflight checks least privilege, indexes, current-version uniqueness, provenance, and counts.

The 2026-08-03 rollout completed:

1. Operator confirmation was obtained; no Supabase branch or billable resource was created.
2. Production migration `20260803025058_phase3_corpus_aggregation`, the read-only postflight, security/performance advisors, transaction generation, and the real rollback statements passed.
3. The reviewed monthly pilot produced exact 31/31 source coverage, 16 accepted observations, 16 distinct diaries, one monthly period, and a complete 20-evidence-row path to 16 source diaries.
4. A rollback-only observation edit produced `observation_snapshot_changed` and rollback restored an empty stale set. Explicit regeneration supplied the current aggregate ID, superseded the old version, preserved both versions, and returned no stale reasons. The final postflight retained 2 aggregate versions, 2 periods, and 32 frozen contributions while preserving 4 runs, 63 observations, and 75 evidence rows.
5. Homepage `200`, guest `401`, viewer `403`, administrator read/regenerate `200`, and production processing `409` passed on Worker `cd1f5f09-a607-4781-8be0-36eba039762f`. Pending-index completion, a refreshed full-corpus checkpoint, affected-derived-data regeneration, and final Phase 3 production acceptance remain later work.

### Batch 3D: change and contradiction analysis

- Compare selected periods using reviewed observations.
- Label direct facts, summaries, and inferences separately.
- Keep possible contradictions or turning points as proposed interpretations until reviewed.

Implementation status: **development-complete in source; database rollout, Worker deployment, and real two-month acceptance remain pending**.

#### Phase 3D implemented contract and rollout handoff

The implementation enforces:

1. A comparison belongs to exactly one current, non-stale Phase 3C aggregate and exactly two distinct chronological calendar months from that aggregate. It never stitches independent runs or aggregates.
2. Both months must contain confirmed/edited observations. Local generation uses the complete frozen observation set from both sides, with no Top-K sampling or silent truncation; if the complete prompt exceeds the 45,000-character safety bound, the request fails instead of dropping evidence.
3. One native Ollama call returns 1–12 ordered findings typed as `continuity`, `change`, `possible_contradiction`, or `turning_point`. Every finding must cite at least one server-owned aggregate observation from each period; unknown, duplicate, wrong-side, or missing IDs are rejected before persistence.
4. Every finding has a separate `fact`, `summary`, or `inference` classification. Possible contradictions and turning points are inference-only, chronology/count differences cannot be presented as causality, and the model is not asked to generate exact corpus counts.
5. All generated findings begin `proposed`. Administrator confirm/edit/reject actions are Origin-checked, retain append-only before/after history, and cannot mutate a superseded, stale, or already rejected finding. Editing an inference-only type cannot relabel it as fact/summary.
6. `understanding_comparisons` freezes the selected period metrics and analysis metadata; finding, two-sided aggregate-observation link, and review tables retain comparison → reviewed observation snapshot → immutable evidence → source diary provenance. Regeneration supersedes rather than overwrites the previous current comparison for the same aggregate/month pair.
7. Dynamic stale reasons cover comparison supersession, aggregate/source/observation drift, changed monthly snapshots, and invalid finding links. The UI displays stale/history state and opens the original source diary from either side's evidence.
8. All 3D tables have RLS with no browser policies or grants. The store/review/stale RPCs are `SECURITY INVOKER`, service-role-only, and use an empty `search_path`. The rollback preserves all source and Phase 3A–3C records; the postflight checks least privilege, indexes, current-pair uniqueness, two-sided provenance, and preservation counts.
9. Comparison generation remains local-development-only because it calls local Ollama. Stored comparison reads and finding reviews may operate online only after the 3D migration and matching Worker source are deployed.

Before 3D production acceptance: obtain a current non-stale aggregate with at least two genuinely reviewed nonempty months, apply the migration before Worker source, run the read-only postflight plus both advisor classes, transaction-test store/version/stale/review paths, execute the real rollback statements inside a rollback-only transaction, deploy, run guest/viewer/admin and local-only generation boundaries, and manually verify two-sided original-diary citations. Do not create synthetic production months or process the pending backlog only to satisfy this gate.

### Batch 3E: optional factual-answer integration

- Do not start production 3E integration until the v4 semantic-quality migration is applied and a representative reviewed pilot confirms theme scope, exact evidence, uncertain handling, and review-before-summary behavior. Phase 3D production acceptance is useful for change/contradiction answers but is not a prerequisite for a 3E path limited to confirmed theme observations/aggregates.
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
- Phase 3A extraction, non-empty summary generation, and Phase 3D period comparison use native local Ollama `/api/chat` structured output and do not reserve ModelScope quota. In v4 each eligible source costs one scope-partition call and relevant/uncertain sources cost one additional synthesis call; after every observation is terminally reviewed, a non-empty first summary costs one call. Creating another theme creates another independent pass over its eligible range. Each explicit 3D comparison generation adds one local call over the two selected periods' full reviewed observation set.
- Provider timeout/unavailability must release the current claim to pending and stop without counting it as analyzed. Invalid structured output is a bounded failed source and may be retried.
- `OLLAMA_BASE_URL` is trusted server-only configuration. Windows Ollama may need an explicitly firewalled WSL-reachable bind; never allow a public unauthenticated listener and never accept its URL from a request body.
- Batch sizing must remain under the current request limits and must not weaken citation validation to reduce call count.
- Online read/query interfaces may use stored reviewed results after their authorization and stale-data filters are implemented.

## Required verification

- Frozen-source snapshot reproducibility and accurate coverage counts.
- Interrupted-run resume, bounded failures, no duplicate observation creation, and safe retry behavior.
- Source-hash changes mark dependent observations/aggregates stale.
- Aggregate, period-snapshot, or linked-observation changes mark dependent comparisons stale; superseded/stale comparisons cannot be reviewed.
- Comparison parser/RPC tests reject one-sided, unknown, duplicate, wrong-month, malformed, or unsafe fact/inference findings and preserve complete two-sided evidence provenance.
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
