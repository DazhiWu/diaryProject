# Batch 5 Direct Access Regression Matrix

Run the pre-change rows before approval and after every approved phase. Record only status codes, selected response headers, object IDs/paths derived from the test run, and cleanup outcome—never credentials, cookies, object content, or URL query strings.

## Test fixture and cleanup protocol

1. Generate one UUID named `RUN_ID`; every direct Storage object uses `batch5-audit/<RUN_ID>/…` and every database fixture includes that run ID in a safe text field where available.
2. The operator-only service-role client provisions only the minimum valid parent rows needed to exercise foreign-key tables. It records each created ID/path.
3. After each negative test, the same service-role client queries the exact run-ID fixture and Storage prefix. If an unexpected anon/authenticated write succeeded, delete the row/object immediately and mark the regression failed; do not continue toward approval.
4. Always run the service-role cleanup pass at the end, including after a successful denial. The cleanup result is part of the record.

## Proxy and Storage matrix

| Identity | Bucket or proxy | Request | Before policy lock-down | After policy lock-down | After private buckets |
|---|---|---|---:|---:|---:|
| Guest | diary image | newest diary-image proxy | 200 | 200 | 200 |
| Guest | diary image | historical diary-image proxy outside the latest-five window | 403 | 403 | 403 |
| Viewer | diary image | historical diary-image proxy | 200 | 200 | 200 |
| Guest/viewer/admin | yearly image | yearly-summary image proxy | 200 | 200 | 200 |
| Admin | audio | audio proxy with one Range | 206 + `Content-Range` | 206 + `Content-Range` | 206 + `Content-Range` |
| Anon | `2024To2025_diary_images` | direct public object URL | normally 200 | normally 200 (bucket is still public) | non-200 |
| Anon | `2025_Summary_Images` | direct public object URL | normally 200 | normally 200 (bucket is still public) | non-200 |
| Anon | `audio_messages` | direct public object URL | normally 200 | normally 200 (bucket is still public) | non-200 |
| Anon | `2024To2025_diary_images` | list prefix `batch5-audit/<RUN_ID>/` | may be 2xx | non-2xx or 200 empty array | non-2xx or 200 empty array |
| Anon | `2025_Summary_Images` | list prefix `batch5-audit/<RUN_ID>/` | may be 2xx | non-2xx or 200 empty array | non-2xx or 200 empty array |
| Anon | `audio_messages` | list prefix `batch5-audit/<RUN_ID>/` | may be 2xx | non-2xx or 200 empty array | non-2xx or 200 empty array |
| Anon | each of the three buckets | upload a random `batch5-audit/<RUN_ID>/new` object | may be 2xx | non-2xx | non-2xx |
| Anon | each of the three buckets | overwrite the random object with `upsert: true` | may be 2xx | non-2xx | non-2xx |
| Anon | each of the three buckets | delete the random object | may be 2xx | non-2xx | non-2xx |

The public bucket flag independently permits a direct public object URL. Therefore a `200` direct URL during the middle policy lock-down phase is expected and is not a regression failure. That phase must instead demonstrate denial of list, upload, overwrite, and delete. Only after all three buckets are private must every direct public object URL be non-2xx.

## Direct Data API matrix

Run SELECT and one write attempt for every target table. For tables with foreign keys, use the service-role fixture protocol above so the request is otherwise valid; the expected denial must occur before any persistence. Cleanup every fixture regardless of result.

| Identity | Target | Direct SELECT | Direct write attempt | Expected after its RLS/grant phase |
|---|---|---|---|---:|
| anon | `diaryContent` | GET | INSERT tagged diary row | both denied |
| anon | `diary_AI_analysis` | GET | INSERT linked analysis fixture | both denied |
| anon | `health_conditions` | GET | INSERT run-ID health fixture | both denied |
| anon | `yearly_summaries` | GET | INSERT run-ID yearly fixture | both denied |
| anon | `important_events` | GET | INSERT linked event fixture | both denied |
| anon | `ai_analysis_sections` | GET | INSERT linked section fixture | both denied |
| anon | `ai_analysis_opinions` | GET | INSERT linked opinion fixture | both denied |
| anon | `yearly_images` | GET | INSERT linked image fixture | both denied |
| anon | `audio_messages` | GET | INSERT run-ID audio fixture | both denied |
| anon | `anonymous_messages` | GET | INSERT valid trimmed 2–1000 character run-ID message | both allowed |
| anon | `anonymous_messages` | — | UPDATE and DELETE the run-ID message | both denied |
| authenticated | `anonymous_messages` | GET | INSERT valid run-ID message | both denied |

This application has no Supabase Auth browser caller. Use the browser anon key only for anon rows; authenticated rows are a negative Data API check, not an application workflow.
