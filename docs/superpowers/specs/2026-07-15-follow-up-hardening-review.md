# Follow-up hardening implementation

**Status:** Implemented, deployed, and production-verified on 2026-07-15 using Worker-first, database-second ordering.

## 1. Scope yearly-summary mutations to the route year

### Problem

The nested yearly-summary mutation routes validate the `year` syntax but update or delete events, sections, opinions, and images by globally unique child ID only. A valid admin request using the wrong year can therefore mutate a record from another year and invalidate the wrong client cache entry.

### Implemented design

1. Resolve `yearly_summaries.id` from the route `year` at the start of every mutation. Return `404` when that year does not exist, except for the existing create-summary flow.
2. For events, sections, and images, require both the child ID and `yearly_summary_id` in the mutation predicate.
3. For opinions, first resolve the opinion's section and require that section's `yearly_summary_id` matches the route year. Use the same ownership check before create, update, and delete.
4. Move these checks into a small server-only repository/helper so the POST/PATCH/DELETE and image routes share one implementation.
5. Return `404` for a missing or wrong-year resource so the API does not disclose that a child ID exists elsewhere.
6. Add role tests plus wrong-year tests for event, section, opinion, and image create/update/delete. Assert that no write occurs after an ownership failure.

This proposal keeps the existing URL and response contracts. It does not require a database migration because the current foreign keys already model the ownership chain.

## 2. Add centralized server request and field limits

### Implemented enforcement layers

1. Add `lib/server/requestLimits.ts` as the single source for byte and character limits.
2. Reject an oversized declared `Content-Length` with `413` before calling `request.json()` or `request.formData()`.
3. Validate the parsed `File.size` as a second boundary because `Content-Length` may be missing or inaccurate.
4. Validate exact date formats, date ordering, field types, trimmed lengths, array sizes, and enumerated formats before any Supabase or ModelScope call.
5. Add a dedicated Cloudflare Rate Limit binding for ModelScope analysis/translation calls and add an upstream timeout/abort signal.
6. Keep database constraints for durable invariants; application validation is not a substitute for constraints.

### Approved limits

| Domain | Proposed limit |
|---|---:|
| Diary content | 200,000 characters |
| Diary subtitle | 200 characters |
| Diary images | 18 files, 12 MiB per compressed WebP |
| AI analysis/translation input | 50,000 characters, 5 calls per IP per 60 seconds |
| Audio | 50 MiB, MP3 only |
| Health condition | 200 characters; exact dates; `startDate <= endDate` |
| Yearly event/section/opinion text | title 200; each long-text field 20,000 characters |
| CSV date range | exact `YYYY-MM-DD`; `startDate <= endDate` |
| Anonymous message | implemented separately: 1–2000 characters, 3 inserts per IP per 60 seconds |

The file limits primarily stop unwanted Storage writes. Multipart parsing may still buffer a request before `File.size` is available, so the early `Content-Length` rejection and Cloudflare platform request limit remain important.

## 3. Split the page and yearly-summary monoliths without changing architecture

### Phase A: extract behavior, keep rendering stable — complete

- Move diary list/calendar/detail loading and mutations from `app/page.tsx` into `hooks/useDiaryController.ts`.
- Move diary navigation and guest latest-five decisions into pure helper functions with unit tests.
- Keep the current local React state model; do not introduce a global Context or state library.

### Phase B: extract view composition — complete

- Add a small `components/diary-app-shell.tsx` for header, navigation, auth dialog, and view switching.
- Keep each existing business component responsible only for its own view.

### Phase C: split yearly summary by domain — complete

- Add `hooks/useYearlySummaryController.ts` for loading, cache invalidation, and mutations.
- Split `components/yearly-summary.tsx` into event, analysis-section/opinion, gallery, and editor components under `components/yearly-summary/`.
- Preserve `lib/yearlySummaryApi.ts` as the transport boundary and keep the current user-visible layout.

### Verification gates

- Pure navigation and ownership/request-limit behavior has unit coverage.
- `app/page.tsx` delegates behavior to `useDiaryController` and composition to `DiaryAppShell`.
- `components/yearly-summary.tsx` delegates data operations to `useYearlySummaryController` and renders domain components from `components/yearly-summary/`.
- TypeScript and Vitest passed after the completed split. Next/OpenNext production builds are required before deployment.
