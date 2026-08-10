# ModelScope Successful-Response Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Return an explicit terminal 502 when ModelScope returns HTTP success without usable `choices`, instead of leaking a `TypeError` as generic 500.

**Architecture:** Keep fallback classification unchanged. Add one private response-content reader in `lib/aiAnalysis.ts` and use it for analysis and translation so HTTP-success response validation remains terminal and consistent.

**Tech Stack:** TypeScript, OpenAI-compatible ModelScope responses, Next.js App Router, Vitest

## Global Constraints

- Only timeouts, network failures, and HTTP non-2xx responses may advance to the next configured model.
- Missing, empty, or content-less `choices` must return `HttpError(502, '模型返回结果为空')` without another model attempt.
- Logs must not contain diary text, translation text, model output, credentials, or raw provider responses.
- Do not change database, quota, environment-variable, or deployment behavior.

---

### Task 1: Harden successful ModelScope response handling

**Files:**
- Modify: `tests/server/aiAnalysis.test.ts`
- Modify: `lib/aiAnalysis.ts`

**Interfaces:**
- Consumes: the OpenAI-compatible completion result returned by `client.chat.completions.create`.
- Produces: private `readModelScopeResponseContent(response, operation, model): string`, which returns trimmed content or throws the existing terminal empty-result `HttpError`.

- [ ] **Step 1: Write the failing regression tests**

Add analysis and translation cases whose completion mock resolves to `{ id, object, created, model }` without `choices`. Assert rejection with status `502` and message `模型返回结果为空`. Preserve the existing fallback double and assert the completion is called once, proving no second model is tried.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm exec vitest run tests/server/aiAnalysis.test.ts`

Expected: both new cases fail because the current direct `response.choices[0]` access becomes a `TypeError` without status 502.

- [ ] **Step 3: Implement the minimal shared reader**

Use a bounded structural type with optional `choices`, safely read `response?.choices?.[0]?.message?.content`, and trim only strings. For missing `choices`, log fixed metadata:

```ts
console.error('[modelscope]', {
  operation,
  outcome: 'invalid-success-response',
  model,
  reason: 'missing-choices',
})
```

Throw `new HttpError(502, '模型返回结果为空')` for absent or blank content. Replace both unsafe analysis and translation reads with the helper.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `pnpm exec vitest run tests/server/aiAnalysis.test.ts`

Expected: all cases pass with no unexpected warnings or errors.

- [ ] **Step 5: Run complete verification**

Run in order:

```bash
pnpm test
pnpm lint
pnpm build
pnpm cf:build
git diff --check
```

Expected: every command exits 0. Inspect `git diff` and confirm only the plan, regression tests, and response hardening code changed.

- [ ] **Step 6: Commit the implementation**

```bash
git add docs/superpowers/plans/2026-08-10-modelscope-success-response-hardening.md tests/server/aiAnalysis.test.ts lib/aiAnalysis.ts
git commit -m "fix: handle malformed ModelScope success responses"
```
