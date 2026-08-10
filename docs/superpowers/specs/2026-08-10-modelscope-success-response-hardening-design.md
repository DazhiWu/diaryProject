# ModelScope Fallback Classification Design

## Problem

ModelScope failures come from different ownership boundaries. Provider/model failures can be recovered by trying the next configured model, while configuration, quota, request-construction, database, and unexpected program errors will normally affect every model and must be surfaced without consuming more quota. HTTP status alone is not sufficient: some non-2xx responses are model availability failures, while others indicate authentication or a possibly incorrect project request.

## Decision

Fallback uses an explicit allowlist and defaults unknown errors to terminal.

The next model is allowed for network/timeout errors, HTTP 404/408/410/425/429/5xx, safe provider codes that explicitly identify model-level availability/support/access failures, missing or blank completion content, invalid analysis JSON/fields, and invalid factual-answer JSON/citations.

The request stops for authentication/configuration/quota failures, ambiguous request-contract HTTP responses, local request/auth/input `HttpError`, database persistence failures, and unexpected exceptions such as an unclassified `TypeError`. HTTP 400/403/405/409/415/422 advances only when its safe provider code is in the model-level allowlist.

Every attempted model reserves one daily quota slot. Complete allowlisted exhaustion returns `所有模型 API 调用失败`. A valid factual-answer `insufficient` result is a successful business result and never advances.

## Implementation

`lib/server/modelScopeClient.ts` owns the shared classification, bounded response-content reader, retryable response-error classes/codes, and safe terminal HTTP feedback. OpenAI SDK automatic retries remain disabled.

Analysis parsing happens inside each fallback attempt so expected empty/invalid model output can advance. Factual-answer parsing and server-owned `S1`–`S5` citation validation also happen inside each attempt. Expected contract errors use retryable typed errors; unexpected parser exceptions remain terminal.

Routes return bounded reasons for terminal request-contract, configuration, project-processing, and analysis-persistence failures. Logs contain only operation, model, category/name, safe status, and safe code. They never contain diary text, prompts, raw provider output, credentials, or database content.

## Verification

- Verify retryable and terminal HTTP/status-code matrices.
- Verify missing/blank content, invalid analysis output, and invalid factual citations advance in order and reserve once per attempt.
- Verify valid output and valid insufficient-evidence output stop immediately.
- Verify configuration, quota, request-contract, database, and unexpected program errors do not advance and return safe feedback.
- Run focused tests, the full suite, lint, Next.js build, and Cloudflare/OpenNext build.

No database schema, environment-variable name, quota limit, or deployment mechanism changes are required.
