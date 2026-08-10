# ModelScope Ordered Model Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read an ordered comma-separated ModelScope chat-model list from `MODELSCOPE_CHAT_MODEL` and fall through only on timeout, network, or HTTP failures across analysis, translation, and factual-answer generation.

**Architecture:** `lib/server/modelScopeClient.ts` becomes the single server-only boundary for model-list parsing, retryable request-error classification, per-attempt quota reservation, ordered attempts, exhaustion errors, and safe model-aware logs. Analysis, translation, and knowledge answers provide model-specific completion callbacks and keep response parsing outside the retryable error category, so empty or invalid HTTP-successful responses terminate immediately.

**Tech Stack:** Next.js 16 App Router, strict TypeScript, OpenAI SDK 6, Supabase-backed ModelScope quota RPC, Vitest 4, pnpm 10.20.0, Node.js 22+

## Global Constraints

- `MODELSCOPE_CHAT_MODEL` is server-only and contains English-comma-separated model names in priority order.
- Trim surrounding whitespace and remove empty entries while preserving order; do not deduplicate the configured list.
- Do not retain a hard-coded model default and do not edit or create `.env.local`.
- Retry only timeout, network/connection, and HTTP non-2xx failures.
- Empty content, invalid analysis format, malformed factual-answer JSON, and invalid citations are terminal and do not switch models.
- Reserve one Beijing-day ModelScope quota slot immediately before every actual upstream HTTP attempt.
- Quota denial/unavailability and configuration errors stop immediately without trying another model.
- Keep OpenAI SDK `maxRetries: 0` and the 30-second timeout per model attempt.
- Never log credentials, prompts, diary content, evidence excerpts, or raw provider responses.
- Do not deploy or invoke a production ModelScope route during this implementation.

## File map

- Create `tests/server/modelScopeClient.test.ts`: pure configuration, classification, ordered-attempt, quota, exhaustion, and safe-log contracts.
- Create `tests/server/aiAnalysis.test.ts`: analysis/translation integration with the shared executor and terminal response-validation contracts.
- Modify `lib/server/modelScopeClient.ts`: runtime model configuration and generic fallback executor.
- Modify `lib/aiAnalysis.ts`: model-aware completion callbacks and strict terminal response validation.
- Modify `lib/server/knowledgeAnswer.ts`: use the shared executor while preserving evidence validation after generation.
- Modify `app/api/knowledge/answer/route.ts`: expose a distinct all-models-failed message and a distinct invalid-response message.
- Modify `tests/server/knowledgeAnswer.test.ts`: factual-answer orchestration through the shared executor.
- Modify `tests/api/knowledgeAnswerRoute.test.ts`: user-facing error mapping.
- Modify `README.md`, `AGENTS.md`, and `docs/DEPLOY.md`: runtime configuration, fallback boundary, and per-attempt quota accounting.
- Do not edit generated ignored `cloudflare-env.d.ts`; `getRuntimeEnvValue()` uses reflective Worker binding lookup.

---

### Task 1: Shared ModelScope configuration and fallback executor

**Files:**
- Create: `tests/server/modelScopeClient.test.ts`
- Modify: `lib/server/modelScopeClient.ts:1-40`

**Interfaces:**
- Produces: `parseModelScopeChatModels(raw: string | undefined): string[]`
- Produces: `getModelScopeChatModels(): Promise<string[]>`
- Produces: `isRetryableModelScopeRequestError(error: unknown): boolean`
- Produces: `runModelScopeChatFallback<T>(options: ModelScopeFallbackOptions<T>, dependencies?: ModelScopeFallbackDependencies): Promise<T>`
- Produces: `ModelScopeConfigurationError`, `ModelScopeModelsExhaustedError`, and `MODELSCOPE_ALL_MODELS_FAILED_MESSAGE`
- Consumes: `getRuntimeEnvValue('MODELSCOPE_CHAT_MODEL')` and `reserveModelScopeApiCall()`

- [ ] **Step 1: Add failing configuration and classifier tests**

Create `tests/server/modelScopeClient.test.ts` with focused assertions equivalent to:

```ts
import { describe, expect, it, vi } from 'vitest'
import {
  isRetryableModelScopeRequestError,
  ModelScopeConfigurationError,
  parseModelScopeChatModels,
  runModelScopeChatFallback,
} from '@/lib/server/modelScopeClient'

describe('ModelScope model configuration', () => {
  it('parses an ordered comma-separated model list without deduplication', () => {
    expect(parseModelScopeChatModels(' first/model, ,second/model,first/model ')).toEqual([
      'first/model',
      'second/model',
      'first/model',
    ])
  })

  it('rejects a missing or empty model list before reserving quota', async () => {
    const reserveQuota = vi.fn()
    await expect(runModelScopeChatFallback(
      { operation: 'test', attempt: vi.fn() },
      { loadModels: async () => [], reserveQuota },
    )).rejects.toBeInstanceOf(ModelScopeConfigurationError)
    expect(reserveQuota).not.toHaveBeenCalled()
  })
})

describe('ModelScope retryable request errors', () => {
  it.each([
    [{ status: 401 }],
    [{ status: 429 }],
    [{ status: 503 }],
    [{ name: 'APIConnectionTimeoutError' }],
    [{ name: 'APIConnectionError' }],
    [{ code: 'ENOTFOUND' }],
    [{ code: 'ECONNREFUSED' }],
    [{ code: 'ECONNRESET' }],
    [{ code: 'ETIMEDOUT' }],
  ])('classifies an upstream request failure as retryable: %j', (error) => {
    expect(isRetryableModelScopeRequestError(error)).toBe(true)
  })

  it('does not classify an ordinary response-validation error as retryable', () => {
    expect(isRetryableModelScopeRequestError(new Error('invalid response'))).toBe(false)
  })
})
```

- [ ] **Step 2: Run the new test file and verify the red state**

Run: `pnpm test -- tests/server/modelScopeClient.test.ts`

Expected: FAIL because the parser, errors, classifier, and executor are not exported.

- [ ] **Step 3: Implement model parsing, typed errors, and retry classification**

In `lib/server/modelScopeClient.ts`, remove the fixed `MODELSCOPE_CHAT_MODEL` export and add these exact public shapes:

```ts
export const MODELSCOPE_ALL_MODELS_FAILED_MESSAGE = '所有模型 API 调用失败'

export class ModelScopeConfigurationError extends Error {
  constructor() {
    super('MODELSCOPE_CHAT_MODEL 未配置或没有有效模型')
    this.name = 'ModelScopeConfigurationError'
  }
}

export class ModelScopeModelsExhaustedError extends Error {
  constructor() {
    super(MODELSCOPE_ALL_MODELS_FAILED_MESSAGE)
    this.name = 'ModelScopeModelsExhaustedError'
  }
}

export function parseModelScopeChatModels(raw: string | undefined): string[] {
  return (raw ?? '').split(',').map((model) => model.trim()).filter(Boolean)
}

export async function getModelScopeChatModels(): Promise<string[]> {
  const models = parseModelScopeChatModels(await getRuntimeEnvValue('MODELSCOPE_CHAT_MODEL'))
  if (models.length === 0) throw new ModelScopeConfigurationError()
  return models
}
```

Implement `isRetryableModelScopeRequestError()` from `safeModelScopeErrorMetadata()` so a numeric SDK/response status, timeout/connection error names, and the explicit safe connection codes in Step 1 return `true`. Do not use message-text matching.

- [ ] **Step 4: Add failing ordered-attempt, quota, terminal-error, and privacy tests**

Extend `tests/server/modelScopeClient.test.ts`:

```ts
it('reserves per attempt and returns the first successful model result', async () => {
  const reserveQuota = vi.fn().mockResolvedValue({})
  const attempt = vi.fn()
    .mockRejectedValueOnce(Object.assign(new Error('private upstream body'), { status: 503 }))
    .mockResolvedValueOnce('second result')

  await expect(runModelScopeChatFallback(
    { operation: 'test', attempt },
    { loadModels: async () => ['first/model', 'second/model', 'third/model'], reserveQuota },
  )).resolves.toBe('second result')
  expect(attempt.mock.calls.map(([model]) => model)).toEqual(['first/model', 'second/model'])
  expect(reserveQuota).toHaveBeenCalledTimes(2)
})

it('does not switch models for a terminal response error', async () => {
  const terminal = new Error('invalid response')
  const attempt = vi.fn().mockRejectedValue(terminal)
  const reserveQuota = vi.fn().mockResolvedValue({})
  await expect(runModelScopeChatFallback(
    { operation: 'test', attempt },
    { loadModels: async () => ['first/model', 'second/model'], reserveQuota },
  )).rejects.toBe(terminal)
  expect(attempt).toHaveBeenCalledOnce()
  expect(reserveQuota).toHaveBeenCalledOnce()
})

it('stops immediately when quota reservation fails', async () => {
  const quotaError = new Error('quota stopped')
  const reserveQuota = vi.fn().mockRejectedValue(quotaError)
  const attempt = vi.fn()
  await expect(runModelScopeChatFallback(
    { operation: 'test', attempt },
    { loadModels: async () => ['first/model', 'second/model'], reserveQuota },
  )).rejects.toBe(quotaError)
  expect(reserveQuota).toHaveBeenCalledOnce()
  expect(attempt).not.toHaveBeenCalled()
})

it('throws exhaustion after all retryable failures without logging private detail', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const attempt = vi.fn().mockRejectedValue(Object.assign(new Error('private upstream body'), { status: 503 }))
  await expect(runModelScopeChatFallback(
    { operation: 'test', attempt },
    { loadModels: async () => ['first/model', 'second/model'], reserveQuota: vi.fn().mockResolvedValue({}) },
  )).rejects.toBeInstanceOf(ModelScopeModelsExhaustedError)
  expect(JSON.stringify(consoleError.mock.calls)).toContain('second/model')
  expect(JSON.stringify(consoleError.mock.calls)).not.toContain('private upstream body')
  consoleError.mockRestore()
})
```

- [ ] **Step 5: Run the executor tests and verify they fail**

Run: `pnpm test -- tests/server/modelScopeClient.test.ts`

Expected: FAIL because `runModelScopeChatFallback()` has not been implemented.

- [ ] **Step 6: Implement the generic ordered executor**

Add exact option/dependency contracts and implement the loop:

```ts
export type ModelScopeFallbackOptions<T> = {
  operation: 'analyze' | 'translate' | 'knowledge-answer' | 'test'
  attempt(model: string): Promise<T>
}

export type ModelScopeFallbackDependencies = {
  loadModels(): Promise<string[]>
  reserveQuota: typeof reserveModelScopeApiCall
}
```

Default dependencies use `getModelScopeChatModels` and `reserveModelScopeApiCall`. Validate even an injected empty list by throwing `ModelScopeConfigurationError`. For every model, reserve first, call `attempt(model)`, return on success, and catch only attempt errors. Rethrow non-retryable errors unchanged. For retryable errors, log `{ operation, outcome: 'failed', model, ...safeModelScopeErrorMetadata(error) }` without the error message. After the last retryable failure, throw `ModelScopeModelsExhaustedError`.

- [ ] **Step 7: Run the shared executor tests**

Run: `pnpm test -- tests/server/modelScopeClient.test.ts`

Expected: PASS with no real environment, quota, or network access.

- [ ] **Step 8: Commit the shared boundary**

```bash
git add lib/server/modelScopeClient.ts tests/server/modelScopeClient.test.ts
git commit -m "feat: add ordered ModelScope fallback executor"
```

---

### Task 2: Diary analysis and translation integration

**Files:**
- Create: `tests/server/aiAnalysis.test.ts`
- Modify: `lib/aiAnalysis.ts:1-178`

**Interfaces:**
- Consumes: `createModelScopeClient()`, `runModelScopeChatFallback()`, `ModelScopeModelsExhaustedError`, `MODELSCOPE_ALL_MODELS_FAILED_MESSAGE`, and `MODELSCOPE_TIMEOUT_MS`
- Produces unchanged: `analyzeDiaryWithAI(content: string): Promise<AIAnalysisResult>` and `translateDiaryContent(content: string): Promise<string>`
- Produces terminal `HttpError(502, ...)` messages for empty/invalid successful responses and full model exhaustion

- [ ] **Step 1: Add failing analysis and translation behavior tests**

Mock `createModelScopeClient()` and `runModelScopeChatFallback()` in `tests/server/aiAnalysis.test.ts`. Make the executor mock call the supplied `attempt` with `first/model` so request bodies can be inspected. Cover:

```ts
it('passes the executor-selected model to diary analysis', async () => {
  completionCreate.mockResolvedValue({
    choices: [{ message: { content: '{"summary":"短标题","emotion":"平静"}' } }],
  })
  await expect(analyzeDiaryWithAI('日记')).resolves.toEqual({ summary: '短标题', emotion: '平静' })
  expect(completionCreate.mock.calls[0][0].model).toBe('first/model')
})

it.each([
  ['empty', ''],
  ['malformed', 'not json'],
  ['missing emotion', '{"summary":"标题"}'],
])('returns a terminal response error without requesting fallback: %s', async (_name, content) => {
  completionCreate.mockResolvedValue({ choices: [{ message: { content } }] })
  await expect(analyzeDiaryWithAI('日记')).rejects.toMatchObject({ status: 502 })
  expect(runModelScopeChatFallback).toHaveBeenCalledOnce()
})

it('rejects empty translation content as a terminal response error', async () => {
  completionCreate.mockResolvedValue({ choices: [{ message: { content: '   ' } }] })
  await expect(translateDiaryContent('日记')).rejects.toMatchObject({ status: 502 })
})

it('maps complete model exhaustion to the required user-facing message', async () => {
  vi.mocked(runModelScopeChatFallback).mockRejectedValueOnce(new ModelScopeModelsExhaustedError())
  await expect(translateDiaryContent('日记')).rejects.toMatchObject({
    status: 502,
    message: MODELSCOPE_ALL_MODELS_FAILED_MESSAGE,
  })
})
```

- [ ] **Step 2: Run the new AI tests and verify the red state**

Run: `pnpm test -- tests/server/aiAnalysis.test.ts`

Expected: FAIL because analysis and translation still import a fixed model and reserve outside a fallback loop.

- [ ] **Step 3: Refactor both completion paths through the shared executor**

Create the OpenAI client once, then wrap only the upstream request and response-content check in:

```ts
const aiResponse = await runModelScopeChatFallback({
  operation: 'analyze',
  attempt: async (model) => {
    const response = await completionCreate({ model, messages, stream: false, extra_body }, {
      signal: AbortSignal.timeout(MODELSCOPE_TIMEOUT_MS),
    })
    const content = response.choices?.[0]?.message?.content?.trim()
    if (!content) throw new HttpError(502, '模型返回结果为空')
    return content
  },
})
```

Use `operation: 'translate'` for translation. Remove direct `reserveModelScopeApiCall()` calls and the fixed-model import. Catch `ModelScopeModelsExhaustedError` and throw `HttpError(502, MODELSCOPE_ALL_MODELS_FAILED_MESSAGE)`. Preserve quota `HttpError` values unchanged.

- [ ] **Step 4: Replace permissive placeholder analysis parsing with terminal validation**

Keep trimming optional JSON fences, but require a JSON object whose `summary` and `emotion` are non-empty strings. Return trimmed values. Throw `HttpError(502, '模型返回结果格式错误')` on JSON failure, non-object values, arrays, missing fields, or blank fields. Remove `extractInfoFromText()` and its placeholder values so malformed HTTP-successful output cannot be persisted as a successful analysis.

- [ ] **Step 5: Run focused analysis and shared executor tests**

Run: `pnpm test -- tests/server/aiAnalysis.test.ts tests/server/modelScopeClient.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit analysis and translation integration**

```bash
git add lib/aiAnalysis.ts tests/server/aiAnalysis.test.ts
git commit -m "feat: use ModelScope fallback for diary AI"
```

---

### Task 3: Factual-answer integration and route feedback

**Files:**
- Modify: `lib/server/knowledgeAnswer.ts:7-286`
- Modify: `tests/server/knowledgeAnswer.test.ts:1-220`
- Modify: `app/api/knowledge/answer/route.ts:1-62`
- Modify: `tests/api/knowledgeAnswerRoute.test.ts`

**Interfaces:**
- Consumes: `runModelScopeChatFallback()` and `ModelScopeModelsExhaustedError`
- Changes internal completion to: `type KnowledgeAnswerCompletion = (model: string, prompts: KnowledgeAnswerPrompts) => Promise<string>`
- Changes dependency seam to include: `runFallback: typeof runModelScopeChatFallback`
- Extends: `KnowledgeAnswerProviderError.reason` with `'all-models-failed'`
- Preserves: zero-candidate requests do not prepare ModelScope or reserve quota

- [ ] **Step 1: Rewrite factual-answer orchestration tests for the fallback seam**

In the `dependencies()` helper, replace direct `reserveQuota` injection with a `runFallback` mock that invokes `options.attempt('first/model')`. Update success expectations to assert `runFallback` and `complete` are called once and `complete` receives `first/model`. Keep the zero-candidate assertion that neither preparation nor fallback runs.

Add these tests:

```ts
it('passes invalid structured output through one successful model attempt without fallback', async () => {
  const deps = dependencies({ completion: 'not json' })
  await expect(answerPrivateKnowledgeQuestion({ question: '问题' }, deps))
    .rejects.toMatchObject({ reason: 'invalid-response' })
  expect(deps.runFallback).toHaveBeenCalledOnce()
  expect(deps.complete).toHaveBeenCalledOnce()
})

it('maps complete fallback exhaustion without exposing provider detail', async () => {
  const deps = dependencies({})
  deps.runFallback.mockRejectedValue(new ModelScopeModelsExhaustedError())
  await expect(answerPrivateKnowledgeQuestion({ question: '问题' }, deps))
    .rejects.toMatchObject({ reason: 'all-models-failed' })
  expect(deps.complete).not.toHaveBeenCalled()
})
```

Retain the existing malformed citation cases, prompt-injection boundary, no-persistence contract, and safe-log assertion.

- [ ] **Step 2: Run the factual-answer tests and verify the red state**

Run: `pnpm test -- tests/server/knowledgeAnswer.test.ts`

Expected: FAIL because the current dependencies reserve once and complete without a model argument.

- [ ] **Step 3: Refactor generation through the shared fallback executor**

Change `prepareModelScopeCompletion()` so its returned closure accepts `(model, prompts)` and puts that model into the OpenAI request. Add `runFallback: runModelScopeChatFallback` to default dependencies. Replace the single `reserveQuota()` plus `complete(prompts)` block with:

```ts
let raw: string
try {
  raw = await dependencies.runFallback({
    operation: 'knowledge-answer',
    attempt: (model) => complete(model, prompts),
  })
} catch (error) {
  if (error instanceof ModelScopeModelsExhaustedError) {
    throw new KnowledgeAnswerProviderError('all-models-failed')
  }
  throw error
}
```

Keep `parseKnowledgeAnswer(raw, citationsById)` after `runFallback()` resolves. This placement is the contract that malformed JSON and citations do not cause a model switch. Remove the fixed model from imports and logs; safe per-model attempt logs now belong to the shared executor.

- [ ] **Step 4: Add failing route error-message tests**

Extend `tests/api/knowledgeAnswerRoute.test.ts` so mocked `answerPrivateKnowledgeQuestion()` failures assert:

```ts
it('reports complete ModelScope model exhaustion', async () => {
  answerMock.mockRejectedValueOnce(new KnowledgeAnswerProviderError('all-models-failed'))
  const response = await knowledgeAnswer(await request({ question: '问题' }, 'admin'))
  expect(response.status).toBe(502)
  await expect(response.json()).resolves.toEqual({ error: '所有模型 API 调用失败' })
})

it('reports an invalid successful model response without claiming API exhaustion', async () => {
  answerMock.mockRejectedValueOnce(new KnowledgeAnswerProviderError('invalid-response'))
  const response = await knowledgeAnswer(await request({ question: '问题' }, 'admin'))
  expect(response.status).toBe(502)
  await expect(response.json()).resolves.toEqual({ error: '模型返回结果格式错误' })
})
```

- [ ] **Step 5: Implement distinct knowledge-answer route feedback**

In `responseFor()` map `all-models-failed` to `{ error: MODELSCOPE_ALL_MODELS_FAILED_MESSAGE }` with status 502 and `invalid-response` to `{ error: '模型返回结果格式错误' }` with status 502. Preserve the existing timeout and other provider mappings for directly injected or preparation failures.

- [ ] **Step 6: Run factual-answer and route tests**

Run: `pnpm test -- tests/server/knowledgeAnswer.test.ts tests/api/knowledgeAnswerRoute.test.ts`

Expected: PASS, including zero-candidate non-reservation and invalid-citation rejection.

- [ ] **Step 7: Commit factual-answer integration**

```bash
git add lib/server/knowledgeAnswer.ts app/api/knowledge/answer/route.ts tests/server/knowledgeAnswer.test.ts tests/api/knowledgeAnswerRoute.test.ts
git commit -m "feat: add ModelScope fallback to factual answers"
```

---

### Task 4: Runtime and deployment documentation

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/DEPLOY.md`

**Interfaces:**
- Documents: `MODELSCOPE_CHAT_MODEL=model-a,model-b,model-c`
- Documents: runtime-only configuration for local `.env.local` and deployed Cloudflare variables
- Documents: one quota reservation per attempted model and terminal response-validation behavior

- [ ] **Step 1: Update the human-facing README**

Add `MODELSCOPE_CHAT_MODEL=` beside the token in the `.env.local` example and its environment-variable table. Replace fixed DeepSeek model claims with “an ordered ModelScope chat-model list.” State that timeout/network/HTTP failures fall through in order, while empty/invalid successful responses do not. State that every attempted model consumes one daily quota slot.

- [ ] **Step 2: Update AI-agent constraints**

In `AGENTS.md`, add the variable to the environment table and update the architecture, quota, and known-risk wording. Preserve the existing 30-second timeout, `AI_RATE_LIMITER`, zero-candidate behavior, server-only token boundary, and 180-call Beijing-day limit.

- [ ] **Step 3: Update deployment guidance**

In `docs/DEPLOY.md`, add `MODELSCOPE_CHAT_MODEL` as a required non-secret server runtime variable. Update the `modelScopeClient.ts` responsibility row, configuration checklist, quota accounting, post-deployment checks, and failure-mode section. Explicitly state that changing the deployed Worker model order is a runtime-variable operation, but the Worker must already contain this feature.

- [ ] **Step 4: Check documentation consistency and accidental secrets**

Run:

```bash
rg -n "deepseek-ai/DeepSeek-V3\.2|MODELSCOPE_CHAT_MODEL|exactly once|one generation attempt|ModelScope" README.md AGENTS.md docs/DEPLOY.md
git diff --check
```

Expected: fixed-model and exactly-one-attempt claims are removed or limited to historical text; the new variable and per-attempt quota rule agree across all three documents; no credential value appears.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md AGENTS.md docs/DEPLOY.md
git commit -m "docs: configure ordered ModelScope models"
```

---

### Task 5: Full verification and final review

**Files:**
- Review only: all files changed in Tasks 1-4

**Interfaces:**
- Verifies: unit behavior, API behavior, lint, Next.js build, and OpenNext Cloudflare artifact generation

- [ ] **Step 1: Run all ModelScope-focused tests**

Run:

```bash
pnpm test -- tests/server/modelScopeClient.test.ts tests/server/aiAnalysis.test.ts tests/server/modelScopeQuota.test.ts tests/server/knowledgeAnswer.test.ts tests/api/knowledgeAnswerRoute.test.ts
```

Expected: all selected Vitest tests PASS.

- [ ] **Step 2: Run the full test suite**

Run: `pnpm test`

Expected: all Vitest tests PASS.

- [ ] **Step 3: Run lint**

Run: `pnpm lint`

Expected: exit 0 with no ESLint errors.

- [ ] **Step 4: Run the Next.js validation surface**

Run: `pnpm build`

Expected: `prebuild` regenerates ignored `cloudflare-env.d.ts`; Next.js compilation and type checking succeed. This validates the Next.js application, not the Worker artifact.

- [ ] **Step 5: Run the Cloudflare/OpenNext validation surface in WSL**

Run: `pnpm cf:build`

Expected: exit 0 and generation of `.open-next/worker.js` plus assets. This is a local artifact build only; it is not a deployment or a live ModelScope test.

- [ ] **Step 6: Inspect final scope and safety**

Run:

```bash
git status --short
git diff --stat HEAD~4..HEAD
git log -5 --oneline
```

Expected: only the planned source, tests, and documentation are changed/committed; `.env.local`, credentials, `.open-next/`, and generated Wrangler state are absent from Git changes.

- [ ] **Step 7: Record any verification-only cleanup commit if necessary**

If verification requires a source/test/doc correction, stage only those exact files and commit with a task-specific message such as:

```bash
git add path/to/exact-file.ts path/to/exact-test.test.ts
git commit -m "fix: complete ModelScope fallback validation"
```

If no correction is needed, do not create an empty commit.
