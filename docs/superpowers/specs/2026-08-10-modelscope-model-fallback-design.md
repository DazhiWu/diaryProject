# ModelScope Ordered Model Fallback Design

## Goal

Replace the source-code `MODELSCOPE_CHAT_MODEL` constant with a server-only runtime configuration that accepts an ordered list of ModelScope chat models. Analysis, translation, and grounded knowledge answers try the configured models in order and return as soon as one usable upstream request succeeds.

This change must let the operator change ModelScope model availability without editing or rebuilding application source. Local development reads `.env.local` through the existing runtime environment helper. A deployed Cloudflare Worker reads the same variable from its runtime configuration.

## Configuration

Use the existing name `MODELSCOPE_CHAT_MODEL`. Its value is an English-comma-separated list in priority order:

```dotenv
MODELSCOPE_CHAT_MODEL=deepseek-ai/DeepSeek-V4-Pro,ZhipuAI/GLM-5.2,Tencent-Hunyuan/Hy3
```

The parser trims surrounding whitespace, removes empty entries, and preserves the remaining order. Model names are not deduplicated because the written list is the operator's exact attempt plan.

There is no hard-coded fallback model. A missing variable or a value containing no usable entries is a server configuration error and must stop before quota reservation or any ModelScope request.

## Architecture

`lib/server/modelScopeClient.ts` owns three related responsibilities:

1. Load and validate the ordered model list from the server runtime environment.
2. Classify upstream failures as retryable across models or terminal.
3. Run a shared ordered-attempt helper that records safe per-model diagnostics and returns the first successful result.

The helper accepts the operation-specific completion callback. `lib/aiAnalysis.ts` uses it for diary analysis and translation. `lib/server/knowledgeAnswer.ts` uses it for factual-answer generation while retaining its existing structured answer and citation validation.

This central boundary avoids three separate retry loops with subtly different quota, logging, and error-classification behavior.

## Attempt and quota flow

For each configured model, in order:

1. Reserve one ModelScope daily quota slot immediately before the upstream HTTP attempt.
2. Submit one request with that model and the existing 30-second per-attempt timeout.
3. Return immediately if the upstream request succeeds.
4. Continue to the next model only for a timeout, network/connection error, or HTTP non-2xx response.

The OpenAI SDK keeps `maxRetries: 0`. Explicit model fallback is the only retry mechanism, so each upstream attempt has exactly one matching quota reservation. A request whose first model fails and second model succeeds consumes two daily slots.

Quota reservation failures and the daily-limit response are terminal. They happen before an upstream attempt and must not be treated as a model-specific failure or cause another reservation.

## Terminal response failures

An HTTP-successful response does not switch models when its content is unusable. The following failures return immediately:

- empty completion content;
- an unusable diary-analysis result;
- malformed factual-answer JSON;
- invalid or inconsistent factual-answer citations;
- any other operation-specific response validation failure.

Translation keeps its current non-empty-content requirement. Diary analysis must validate that the response can produce a meaningful title and emotion rather than treating placeholder extraction values as a successful model result.

This boundary distinguishes provider/API availability from response-quality or contract failures, as requested.

## Exhaustion and user-facing errors

If every configured model ends in a retryable provider/API failure, the route returns a user-facing error meaning `所有模型 API 调用失败`. Existing route-specific status handling may preserve a suitable 5xx status, but the message must clearly identify complete model-list exhaustion.

Configuration, quota, and response-validation errors retain distinct messages and do not claim all model APIs failed.

## Logging and privacy

Safe logs include the operation, attempted model name, outcome, failure category, and safe HTTP status/code. They must not include API credentials, prompts, diary text, evidence excerpts, or raw provider responses.

Successful fallback may log the selected model so operators can diagnose model availability. Factual-answer logs must stop referring to a single fixed model constant.

## Tests

Add focused tests for:

- parsing and ordering comma-separated models;
- missing and empty configuration;
- first-model success without further attempts;
- retryable first-model failure followed by success;
- all configured models failing;
- one quota reservation per actual upstream attempt;
- quota failure stopping before another model;
- empty or otherwise invalid successful output not switching models;
- factual-answer JSON/citation validation remaining terminal;
- safe logs identifying models without exposing private response content.

Run the related Vitest suites, `pnpm lint`, `pnpm build`, and `pnpm cf:build`. The final report must identify each validation surface separately. No deployment or production ModelScope request is part of this change.

## Documentation impact

Update:

- `README.md` with the local `.env.local` example and ordered-list behavior;
- `AGENTS.md` with the runtime variable, fallback boundary, and per-attempt quota rule;
- `docs/DEPLOY.md` with Cloudflare runtime configuration, attempt accounting, and operational failure behavior.

Do not create or edit `.env.local`, and never record real tokens or passwords.
