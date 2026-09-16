# Private Diary Recall Assistant

## Goal and scope

The active goal is an administrator-only, on-demand diary recall assistant: find past experiences, inspect possible coping actions and outcomes, and return original-diary citations. Question planning is ephemeral. There are no stored themes, observation review queues, period-comparison records, personality profiles, or automatic long-term memory writes.

The former Phase 3 understanding/digital-twin runtime has been retired. Its UI, API, review/comparison services, and Ollama integration are removed. Applied Phase 3A–3C schema and historical rows remain dormant; never-applied 3D/v4 SQL is archived outside the migration runner. This assistant uses only the existing private knowledge search and ModelScope answer infrastructure and does not call `understanding_*` tables or RPCs.

## Implemented request flow

1. `POST /api/knowledge/answer` keeps administrator Cookie authorization, Origin checks, the shared interactive limiter, and ModelScope's existing per-attempt daily budget and fallback rules. After those synchronous request-boundary checks pass, it returns an NDJSON stream immediately and emits padded start/heartbeat events every ten seconds until the final answer or safe error event. Heartbeats contain no question, excerpt, credential, or provider response. The client also accepts the former single-JSON success response for rollout compatibility.
2. The question is limited to 500 characters. Optional `context` (up to 2,000 characters) describes the current experience; it is supplied context, not historical diary evidence. It is not retained after the request.
3. Empty date fields allow a rule-based plan to recognize numeric dates, a numeric Chinese year/month, last year, or recent periods. Bare “recent” means the last 30 days, “recent three months” means 90 days, and a recent week means seven days. Relative dates use the Beijing calendar. Explicit date fields take precedence, including partial bounds. Otherwise the search spans all indexed history. This is a limited date parser, not a general natural-language temporal model.
4. Coping questions use three search directions (original question, actions, subsequent outcomes); similarity questions use two; other questions use one. No model call is used to plan searches. The primary direction completes first; supplemental directions then run sequentially. A primary failure stops expansion immediately. Each direction reuses the existing hybrid RPC and Workers AI reranking. Search text is bounded to the first 400 characters of the question/context plus a short direction suffix; the answer model receives the complete question/context.
5. Results are interleaved by rank across directions, deduplicated by overlapping source ranges, and diversified across diaries before allowing a second independent excerpt per diary. Scores from separate queries are not compared directly.
6. Coping questions additionally search the following seven days after at most two selected source dates, always within the requested bounds. These are relevant indexed excerpts, not full-diary reads or a full-period scan. The first version does not automatically expand to 30 days.
7. At most five search calls and eight excerpts / 12,000 excerpt characters reach the answer path (ordinary lookup retains a five-excerpt cap). No-candidate and missing-current-experience clarification responses do not prepare ModelScope or reserve quota. Primary failures, terminal authentication/Access failures, unknown errors, and database failures remain errors rather than false “no evidence” answers. If evidence already exists and an optional search fails with a classified timeout/network/rate-limit/upstream error, stop further expansion and mark `retrieval.partial`; both the UI and answer prompt disclose incomplete retrieval.
8. Citations are server-assigned and validated using the existing structured-output contract. Instructions distinguish explicitly helpful actions from mere temporal sequence, require similarities and differences for analogous experiences, label interpretations as AI interpretation, and forbid exhaustive coverage or causal claims unsupported by the retrieved evidence. These instructions do not prove semantic correctness; real-data quality remains an acceptance gate.
9. The response adds `retrieval` metadata: resolved dates, mode, search count, selected diary/excerpt counts, and follow-up window. An optional `clarification` identifies requests needing a current-experience description. No user content is persisted by this flow.

## Interface

The administrator navigation opens “日记回顾”. The page contains index coverage/maintenance, the recall question and optional current-experience form, citations, and the existing direct search/diagnostics. Citation excerpts are collapsed by default and expand independently. Opening a cited diary keeps the recall page mounted but hidden, so returning from the diary restores the answer, form, citations, and search state. Answer dates default to blank; direct-search date defaults remain unchanged. Index counts describe available coverage; selected excerpts are explicitly not a complete reading of the corpus.

## Operational boundaries

- No new table, migration, model-provider credential, binding, or dependency is required.
- Local `pnpm dev` uses the loopback Qwen3 FastAPI service for query Embedding and vector ordering, so recall testing does not initialize the Workers AI development proxy. Production Workers AI waits are bounded per call: query Embedding 20 seconds and reranking eight seconds.
- Safe server diagnostics include reason, stage, elapsed milliseconds, and available HTTP status, never raw upstream messages, vectors, query text, or credentials. API failures carry a stable `code` and an actionable Chinese message. See the local/deployed provider boundary in [deployment guidance](DEPLOY.md#local-and-deployed-knowledge-query-providers).
- Authorization, request validation, and interactive rate-limit failures occur before streaming and preserve their HTTP status. Once the answer stream has started with HTTP `200`, later retrieval, quota, configuration, and provider failures are delivered as a final safe NDJSON error event with the original application status; the browser converts that event back into the existing error message flow.
- Document indexing still requires the local Next.js and FastAPI environment. This change does not run backlog jobs or rebuild vectors.
- The 598-source frozen fingerprint belongs to paused Phase 3 only; recall searches the current eligible index through the existing RPC.
- The retired understanding API and its client/runtime modules are absent from deployable source. Historical material is indexed from [the Phase 3 archive](archive/phase3/README.md).
- Test/lint/Next.js/OpenNext validation does not deploy the change. Browser fixtures validate interaction and presentation, not live-provider retrieval quality. Real diary/provider acceptance should check genuinely helpful retrieval, missing follow-up evidence, incorrect causal claims, and citation fidelity before claiming quality acceptance.

## Future work boundary

Improve recall quality against concrete user questions first. Consider fuller on-demand reading only when excerpt retrieval demonstrably misses necessary context. Do not reintroduce theme timelines, manual observation review, cross-month comparison features, or persistent derived-knowledge maintenance as prerequisites.
