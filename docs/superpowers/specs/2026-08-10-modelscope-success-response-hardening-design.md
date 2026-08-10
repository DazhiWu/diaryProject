# ModelScope Successful-Response Hardening Design

## Problem

ModelScope can return an HTTP-success response that does not contain the OpenAI-compatible `choices` array. Diary analysis and translation currently read `response.choices[0]`, so this response shape throws a `TypeError`. The fallback executor treats that `TypeError` as terminal, and the route hides it behind a generic `500 Request failed` response.

## Required behavior

- Treat a successful HTTP response with a missing, empty, or content-less `choices` value as the existing terminal `502 模型返回结果为空` condition.
- Do not try the next configured model for this condition.
- Continue trying the next model only for timeouts, network failures, and HTTP non-2xx responses.
- Preserve the existing terminal `502 模型返回结果格式错误` behavior for non-empty analysis output that fails JSON validation.
- Never log diary text, translation text, model output, credentials, or raw provider responses.

## Implementation

Add a small response-content reader in `lib/aiAnalysis.ts`. It safely traverses `choices?.[0]?.message?.content`, trims string content, and throws the existing `HttpError(502, '模型返回结果为空')` for every absent or blank value. Analysis and translation will share this reader so their response handling cannot drift.

When the response is structurally missing `choices`, emit bounded metadata containing only the operation, selected model, outcome, and a fixed reason such as `missing-choices`. The `HttpError` remains terminal under the existing fallback classifier.

## Verification

- Add regression coverage for analysis and translation responses with no `choices` field.
- Assert the returned error is the explicit terminal 502 and that only one model attempt occurs.
- Run the focused tests, the full test suite, lint, the Next.js build, and the Cloudflare/OpenNext build.

No database, environment-variable, quota, or deployment documentation changes are required.
