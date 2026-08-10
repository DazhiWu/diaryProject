# ModelScope Fallback Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch models only for explicitly identified provider/model failures and return safe reasons for configuration, request, database, and unexpected project-side failures.

**Architecture:** Centralize the allowlist and typed model-response failures in `lib/server/modelScopeClient.ts`. Validate analysis and factual-answer contracts inside each model attempt so expected provider-output failures can advance without making unknown program errors retryable.

**Tech Stack:** TypeScript, OpenAI-compatible ModelScope responses, Next.js App Router, Vitest

## Global Constraints

- Every model attempt reserves one daily quota slot; quota failure stops before the next HTTP call.
- Unknown errors default to terminal.
- Never log diary text, prompts, provider output, credentials, or database content.
- Do not change the database schema, environment-variable names, quota limit, or deployment mechanism.

---

### Task 1: Classify request and response failures

**Files:**
- Modify: `lib/server/modelScopeClient.ts`
- Test: `tests/server/modelScopeClient.test.ts`

- [ ] Add RED tests for retryable HTTP/model codes and terminal ambiguous request statuses.
- [ ] Add typed retryable errors for missing/blank content and invalid analysis/factual-answer contracts.
- [ ] Implement the allowlist and safe terminal HTTP feedback.
- [ ] Run `TMPDIR=/tmp pnpm exec vitest run tests/server/modelScopeClient.test.ts` and verify GREEN.

### Task 2: Validate each model attempt

**Files:**
- Modify: `lib/aiAnalysis.ts`
- Modify: `lib/server/knowledgeAnswer.ts`
- Test: `tests/server/aiAnalysis.test.ts`
- Test: `tests/server/knowledgeAnswer.test.ts`

- [ ] Add RED tests proving empty/invalid analysis output and invalid factual citations advance to a second model and reserve twice.
- [ ] Move analysis parsing and factual-answer parsing/citation validation inside fallback attempts.
- [ ] Preserve valid output and valid `insufficient` behavior.
- [ ] Run both focused test files and verify GREEN.

### Task 3: Surface terminal project-side failures

**Files:**
- Modify: `app/api/diaries/[id]/analysis/route.ts`
- Modify: `app/api/knowledge/answer/route.ts`
- Test: `tests/api/diaryAnalysisRoute.test.ts`
- Test: `tests/api/knowledgeAnswerRoute.test.ts`

- [ ] Add RED tests for safe request-contract, unexpected program, and database persistence feedback.
- [ ] Map known terminal failures to bounded `HttpError`/provider reasons without exposing internal messages.
- [ ] Verify terminal failures do not make another model attempt.

### Task 4: Document and verify

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/DEPLOY.md`

- [ ] Replace broad HTTP fallback wording with the explicit allowlist and terminal default.
- [ ] Run `TMPDIR=/tmp pnpm test`, `pnpm lint`, `pnpm build`, and `pnpm cf:build`.
- [ ] Run `git diff --check`, inspect the final diff, and commit the verified change.
