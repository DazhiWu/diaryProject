# Personal Knowledge and Digital Twin Roadmap

## Purpose

This document preserves the long-term development direction after the administrator Fact Layer. It adapts the original personal-knowledge and digital-twin concept to the application's current Next.js, Supabase, ModelScope, and Cloudflare architecture.

It is a roadmap, not a frozen schema or prompt specification. Each phase should be designed against the implementation and production behavior available when that phase starts. Read it together with [`FACT_LAYER_PLAN.md`](FACT_LAYER_PLAN.md), [`DATABASE.md`](DATABASE.md), [`DEPLOY.md`](DEPLOY.md), and [`../AGENTS.md`](../AGENTS.md).

## Current sequence

| Phase | Capability | Status |
|---|---|---|
| 1 | Shared private knowledge index | Implemented |
| 2 | Administrator factual question answering with citations | Completed and accepted in production |
| 3 | Auditable structured understanding | Batches 3A/3B accepted locally; Batch 3C production pilot accepted; Batch 3D development-complete in source but not deployed; refreshed full-corpus acceptance pending |
| 4 | Private digital twin | Planned |
| 5 | Growth analysis and historical versions | Planned |
| 6 | Public digital twin | Planned; must wait for private boundaries and review workflows to mature |
| 7 | Long-term maintenance and additional data sources | Planned |

Do not skip directly from factual retrieval to a public or self-updating digital twin. The understanding, review, provenance, and scope controls introduced in the intermediate phases are prerequisites.

## Phase 3 entry baseline

Phase 2 commit `0bc4b45` is deployed and accepted in production. The 2026-07-30 data checkpoint contains 598 completed indexed sources and seven intentionally deferred pending sources without chunks or indexed-content hashes. The operator approved the 598 completed sources as the fixed initial Phase 3 development corpus so daily diary growth does not repeatedly reset the development baseline.

Each Phase 3 run must freeze exact eligible source IDs/content hashes and report coverage against that frozen set. Pending sources are outside development results rather than silently counted as analyzed. After the feature is complete, finish the index backlog, regenerate affected derived records, and require full eligible-source coverage before Phase 3 production acceptance. Detailed handoff and batch boundaries are in [`PHASE3_UNDERSTANDING_PLAN.md`](PHASE3_UNDERSTANDING_PLAN.md).

## Invariants across all later phases

- Original diary content remains the highest-priority source. Derived AI records never replace or silently rewrite it.
- Every durable interpretation must retain supporting source references, its generation time, and enough model/prompt version metadata to be regenerated or invalidated.
- Keep model-proposed, user-confirmed, user-edited, rejected, and superseded content distinguishable in storage and APIs.
- An AI inference is not a fact or the user's real opinion merely because it sounds plausible.
- No conversation may silently add facts, conclusions, memories, personality traits, or public knowledge.
- Private, publishable, and prohibited content scopes must be enforced by server-side data access, not only by prompts or UI filtering.
- A historical version may access only information available on or before its cutoff date.
- Every digital-twin interface must identify itself as AI and must not make real-time commitments, formal statements, or decisions on the user's behalf.
- New migrations and derived-data jobs need backup or rollback procedures, least-privilege checks, and tests appropriate to their risk.

## Phase 3: Auditable understanding

### Goal

Turn evidence from multiple diaries into structured, reviewable interpretations that can answer “what do these records collectively suggest?” without treating model output as established truth.

### Recommended first release

Start with a deliberately small set of understanding types:

- recurring themes;
- notable events;
- goals and their observed status;
- explicitly expressed viewpoints;
- possible contradictions or changes between viewpoints;
- time-bounded summaries.

Each proposed item should contain:

- a stable derived-record ID and type;
- a concise statement;
- its time range;
- supporting diary citations;
- a clear `fact`, `summary`, or `inference` classification;
- generation and version metadata;
- a review state such as `proposed`, `confirmed`, `edited`, `rejected`, or `superseded`;
- an optional user correction or replacement statement.

The first concrete implementation uses versioned `understanding_*` runs, frozen sources, observations, immutable evidence, summaries, observation review history, summary impacts, and summary-observation links for the `theme_timeline` slice. Batches 3A/3B and the local operator review/regeneration workflow are complete. Batch 3C adds versioned, deterministic per-run aggregates, monthly literal/semantic statistics, frozen reviewed-observation contributions, and stale detection while preserving original-diary provenance. Its production migration, Worker, reviewed-pilot regeneration, role matrix, and rollback smoke passed on 2026-08-03. Batch 3D is implemented in source as versioned two-month comparisons within one non-stale aggregate; its migration, deployment, and real cross-month acceptance remain pending because the accepted pilot contains one month. A later Phase 3A v4 hardening is also source-complete after a friendship pilot exposed topic leakage: it freezes structured ThemeSpec boundaries, uses exact sentence/range evidence IDs, validates complete relevant/uncertain/irrelevant partitions, separates evidence selection from observation synthesis on the same 4B model, and requires observation review before the first summary. Its migration and operational gates are not complete, so 3E must not consume legacy v3 observations as if this quality boundary were accepted. Detailed schema and remaining gates belong in [`DATABASE.md`](DATABASE.md) and [`PHASE3_UNDERSTANDING_PLAN.md`](PHASE3_UNDERSTANDING_PLAN.md).

### Recommended implementation batches

1. Batch 3A: add the versioned derived-record model and evidence links, initially for a small administrator-selected date range. **Completed locally.**
2. Batch 3B: add administrator confirm, edit, reject, supersede, history, and reviewed-observation-only regeneration. **Completed and operator-accepted locally.**
3. Batch 3C: add deterministic corpus aggregation and time-bounded summaries over confirmed/edited, non-stale observations while retaining original-diary provenance. **Production pilot rollout accepted; refreshed full-corpus acceptance pending.**
4. Batch 3D: add contradiction and change detection only after aggregate review/stale boundaries are proven. **Development-complete in source; production rollout and real two-month acceptance pending.**
5. Batch 3E: after the v4 theme-scope/evidence pilot is accepted, allow factual answers to optionally use confirmed understanding while continuing to cite the original diaries behind it. Phase 3D acceptance is required only for answer modes that consume change/contradiction findings, not for a narrower confirmed-observation/aggregate path.

Extraction should initially be an explicit administrator operation. Do not automatically process the entire corpus or write model output as confirmed knowledge.

### Completion gate

Phase 3 is complete only when every displayed interpretation is traceable to source diaries, proposed content cannot masquerade as confirmed content, edits and rejections are preserved, stale conclusions can be superseded, and deletion or regeneration of derived records cannot damage original diaries.

## Phase 4: Private digital twin

### Goal

Provide an administrator-only assistant that can analyze new questions in light of the user's history while clearly separating recorded facts, reviewed understanding, and present model speculation.

### Recommended scope

- Build the private profile only from source facts and user-confirmed understanding.
- Retrieve relevant evidence dynamically instead of placing the whole diary corpus or a static personality summary into every prompt.
- Separate background, values, recurring decision tendencies, and expression preferences rather than storing one opaque personality prompt.
- Label answer passages or claims as sourced fact, reviewed synthesis, or current inference.
- Preserve citations for factual and synthesized claims.
- Allow the user to correct the profile and immediately exclude rejected or superseded conclusions.
- Keep the interface administrator-only and explicitly identify it as an AI simulation.

Conversation history, if later desired, should be a separate feature with explicit retention and deletion controls. Conversation text must not become long-term memory until the user reviews a proposed memory record.

### Completion gate

The private twin must remain useful when unconfirmed model proposals are excluded, must not claim to be the user, must not make commitments on the user's behalf, and must pass tests proving that rejected, superseded, and out-of-scope records cannot influence responses.

## Phase 5: Growth and historical versions

### Goal

Explain how recorded themes, goals, viewpoints, emotions, and behavior patterns changed over time, and support interaction with a clearly bounded historical version.

### Recommended implementation batches

1. Generate reviewable monthly, quarterly, or yearly snapshots from the facts and understanding available at each cutoff.
2. Compare two selected periods and cite evidence for every stated change or continuity.
3. Record key turning points only as proposed interpretations until reviewed.
4. Add historical-version conversations after cutoff enforcement has been verified at the query and data-access layers.

Snapshots should be reproducible and versioned rather than silently overwritten. A corrected source diary or reviewed understanding may create a new snapshot version while preserving why the earlier version became stale.

Trend forecasts must be labeled as speculation and kept separate from observations about past change.

### Completion gate

The system must prove that a historical version cannot retrieve later diaries, later understanding, later profile revisions, or later conversation memory. Comparisons must distinguish measured source differences from interpretive conclusions.

## Phase 6: Public digital twin

### Goal

Allow visitors to learn about the user's deliberately published experiences, projects, and viewpoints without exposing the private diary corpus or creating the impression that they are speaking to the user in real time.

### Required architecture boundary

Build an independently curated public corpus and public profile. Public retrieval must begin from explicitly published records; it must never search the private corpus first and rely on a prompt or post-filter to remove sensitive results.

Publishing should be an explicit review action with:

- the exact approved content or derived statement;
- approved citations or public source material;
- publication and withdrawal state;
- review and update timestamps;
- handling for third-party personal information;
- a way to revoke content and invalidate associated indexes and caches.

### Visitor protections

- Display the AI identity, scope, and knowledge-update time.
- Apply dedicated guest rate limits, abuse controls, prompt-injection defenses, and safe generic errors.
- Prevent claims of real-time knowledge, consent, commitments, endorsements, or official statements.
- Keep necessary security audit metadata without storing unnecessary private conversation content.
- Test attempts to elicit private diary text, hidden instructions, credentials, third-party details, or withdrawn material.

### Completion gate

Public launch requires a verified private/public data-access separation, a complete publish-and-withdraw workflow, adversarial authorization and prompt-injection tests, cost controls, and an emergency shutoff that does not affect the private diary application.

## Phase 7: Long-term maintenance and expansion

Only after the earlier workflows are stable, consider:

- automatic indexing after diary mutations;
- scheduled regeneration of proposed summaries and snapshots;
- detection of conclusions made stale by new or edited evidence;
- profile and prompt-version management;
- provider/model upgrades with reproducible comparison and rollback;
- cost, latency, quota, and quality monitoring;
- export, backup, restoration, and derived-data rebuild tools;
- additional sources such as project documents, images, and audio.

Automatic maintenance may generate proposals, but it must not automatically confirm understanding, change the private profile, or publish content.

## Phase-entry checklist

Before starting any later phase:

1. Confirm the preceding phase is committed, deployed where applicable, and accepted in production.
2. Capture a production data and rollback checkpoint.
3. Reinspect the current schema, authorization boundaries, provider limits, and actual usage rather than relying only on this roadmap.
4. Define the smallest independently useful batch and its failure behavior.
5. Add migration, API, authorization, model-output validation, and UI tests before production rollout.
6. Update this roadmap when implementation evidence changes the recommended sequence or boundaries.

For Phase 3 development only, the production data checkpoint is the approved frozen 598-source corpus described above. This exception does not waive the full-index refresh and derived-data regeneration required before Phase 3 production acceptance.
