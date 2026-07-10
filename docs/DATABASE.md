# Database and Storage

## Overview

The project uses Supabase PostgreSQL for diary content, AI results, health records, messages, audio metadata, and yearly summaries. Supabase Storage holds diary images, yearly-summary images, and audio. Most operations run directly from browser-facing code through a shared anonymous client; the CSV export route imports the same client on the server. Because the repository has no complete migration history, production constraints and policies must be checked in Supabase before schema or authorization changes.

## Supabase configuration

- `lib/supabaseClient.ts` creates one `@supabase/supabase-js` client from `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
- `next.config.mjs` injects both variables because browser code imports this client.
- `app/api/diary-download/route.ts` uses the same client indirectly through `lib/diaryApi.ts`; there is no privileged server client.
- The app does not establish a Supabase Auth session. `/api/auth` compares runtime passwords and stores the returned UI level in browser `localStorage`.
- Requests therefore use the Supabase anon role. No service-role variable or client exists in the repository.

Never place a service-role key in the shared client, `next.config.mjs`, browser code, or committed files. Actual project settings and credentials need confirmation in the Supabase dashboard and must not be recorded here.

## Tables

The details below distinguish code-used fields from SQL-defined constraints. Where repository SQL is absent, database types, nullability, defaults, indexes, and constraints remain unconfirmed.

### `diaryContent`

Purpose: diary entries and relative diary-image paths.

| Field | Type | Purpose | Notes |
|---|---|---|---|
| `id` | `BIGINT` in README example | Diary identifier | Code uses `number`; README declares an identity primary key |
| `date` | `DATE` in README example | Diary date | Frequently ordered/filtered |
| `subtitle` | `TEXT` in README example | Optional title | Included in text search |
| `content` | `TEXT` in README example | Diary body | Required by TypeScript model |
| `image_paths` | `TEXT[]` in README example | Relative Storage paths | Nullable in code |
| `modifiedAt` | Timestamp in README example | Modification time | Mixed-case field used verbatim |
| `created_at` | Timestamp in README example | Creation time | README shows default `NOW()` |

Related code: `lib/diaryApi.ts`, `app/page.tsx`, and `components/diary-detail.tsx`.

Code implements CRUD, date ranges, calendar queries, exact-count pagination, descending date order, and `content`/`subtitle` `ilike` search. README suggests date/subtitle indexes, but their production existence needs confirmation.

> Complete table structure needs confirmation in the Supabase dashboard or authoritative database migrations.

### `diary_AI_analysis`

Purpose: latest generated title/summary and emotion result for a diary.

| Field | Type | Purpose | Notes |
|---|---|---|---|
| `id` | `BIGINT` in README example | Analysis identifier | README declares identity primary key |
| `diary_id` | `BIGINT` in README example | Related diary | README references `diaryContent(id)` |
| `summary` | `TEXT` in README example | Generated title/summary | Required by code |
| `emotion` | `TEXT` in README example | Emotion text | Required by code |
| `created_at` | Timestamp in README example | Creation time | Used for range queries/order |

Related code: `lib/diaryApi.ts`, `components/diary-detail.tsx`, and `app/api/ai-analysis/route.ts`.

Before insert, code deletes older rows for the same `diary_id`. Diary deletion also explicitly deletes analysis rows. Foreign-key delete behavior, uniqueness, and index existence need confirmation.

### `health_conditions`

Purpose: date ranges used to annotate calendar health conditions.

| Field | Type | Purpose | Notes |
|---|---|---|---|
| `id` | `TEXT` | Identifier | Primary key; client generates `Date.now()` string |
| `condition` | `TEXT` | Label | `NOT NULL` |
| `start_date` | `DATE` | Range start | `NOT NULL` |
| `end_date` | `DATE` | Range end | `NOT NULL` |
| `color` | `TEXT` | Display color | `NOT NULL` |
| `created_at` | `TIMESTAMPTZ` | Creation time | Defaults to `NOW()` |

Related code: `lib/diaryApi.ts`, `hooks/useHealthConditions.ts`, and `test_extra/CREATE_HEALTH_CONDITIONS_TABLE.sql`.

Repository SQL enables RLS, then creates SELECT and ALL policies with unconditional `true` expressions. Despite names mentioning authenticated/admin access, they do not test a role or claim. Treat them as permissive examples and confirm production policies.

### `anonymous_messages`

Purpose: public anonymous message-board posts.

| Field | Type | Purpose | Notes |
|---|---|---|---|
| `id` | `BIGSERIAL` | Identifier | Primary key |
| `content` | `TEXT` | Message | `NOT NULL`; client accepts 2–1000 characters |
| `created_at` | `TIMESTAMPTZ` | Creation time | `NOT NULL`, defaults to `NOW()` |
| `user_agent` | `TEXT` | Optional browser metadata | Submitted by client |
| `ip_address` | `TEXT` | Optional address metadata | Not populated by current client |

Related code: `lib/messageBoardApi.ts` and `test_extra/CREATE_ANONYMOUS_MESSAGE_TABLE.sql`.

SQL creates `idx_anonymous_messages_created_at`, enables RLS, and permits public SELECT and INSERT. It defines no UPDATE/DELETE policy. Code performs paginated reads and inserts only.

### `audio_messages`

Purpose: metadata for audio objects in the same-named Storage bucket.

| Field | Type | Purpose | Notes |
|---|---|---|---|
| `id` | Unconfirmed | Identifier | TypeScript uses `string` |
| `title` | Unconfirmed | Display title | Written by client |
| `author` | Unconfirmed | Display author | Written by client |
| `date` | Unconfirmed | Associated date | TypeScript uses `string` |
| `audio_path` | Unconfirmed | Relative object path | Used for public URL |
| `duration` | Unconfirmed | Seconds | Calculated in browser |
| `created_at` | Unconfirmed | Creation time | Used for descending order |

Related code: `lib/audioApi.ts`, `lib/audioHandler.ts`, and audio/message components. Code supports read, insert, metadata update, and delete. On insert failure it removes the uploaded object; on delete it removes the row before the object. No schema/RLS migration is present.

> Complete table structure needs confirmation in the Supabase dashboard or authoritative database migrations.

### Yearly-summary tables

All types and constraints below need confirmation because no repository migration defines them.

#### `yearly_summaries`

Parent per year. Code uses `id` and `year`, looks up by year, and creates the row on demand. A unique constraint on `year` is not confirmed.

#### `important_events`

Fields used: `id`, `yearly_summary_id`, `start_date`, `end_date`, and `description`. Code implements full CRUD in `lib/yearlySummaryApi.ts`.

#### `ai_analysis_sections`

Fields used: `id`, `yearly_summary_id`, `title`, `content`, and optionally `created_at`. Code implements full CRUD and embedded opinion reads.

#### `ai_analysis_opinions`

Fields used: `id`, `ai_analysis_section_id`, `content`, `analysis`, and `created_at`. Code implements full CRUD and ascending creation-time ordering. A code comment expects cascade deletion with its section, but the actual foreign key/cascade rule needs confirmation.

#### `yearly_images`

Fields used: `id`, `yearly_summary_id`, `storage_path`, and `created_at`. It maps yearly summaries to relative Storage paths. Deleting its database row does not remove the corresponding object.

Related code for all five tables: `lib/yearlySummaryApi.ts`.

## Relationships

Confirmed in README SQL example:

- `diary_AI_analysis.diary_id` → `diaryContent.id`.

Confirmed as application-level relationships, with database foreign keys still requiring confirmation:

- `important_events.yearly_summary_id` → `yearly_summaries.id`
- `ai_analysis_sections.yearly_summary_id` → `yearly_summaries.id`
- `ai_analysis_opinions.ai_analysis_section_id` → `ai_analysis_sections.id`
- `yearly_images.yearly_summary_id` → `yearly_summaries.id`

Media path fields refer to Storage objects rather than database foreign keys.

## Row Level Security

- Repository SQL explicitly enables RLS only for `health_conditions` and `anonymous_messages`.
- Anonymous-message policies allow anon SELECT/INSERT and no UPDATE/DELETE.
- Health-condition policies are unconditional despite their authenticated/admin names.
- RLS state/policies for all other tables and Storage policies are absent and need confirmation.
- The app's guest/viewer/admin `localStorage` state is not a Supabase identity and cannot satisfy trusted JWT/`auth.uid()` policies.
- No service-role key is used. If introduced, keep it in a server-only runtime secret and server-only module; service-role requests bypass normal RLS.

Browser code performs direct writes with the anon client. UI visibility is not authorization, so production RLS and Storage policies must enforce operations independently.

## Storage

### `2024To2025_diary_images`

- Diary images; code expects public readability through `getPublicUrl()`.
- Path: `<year>/<yyyymmdd>_<index>.webp`, starting at index 1.
- Browser canvas limits width to 1920px and converts to WebP at quality `0.8`.
- Relative paths are stored in `diaryContent.image_paths`.
- Upload uses `upsert: true`; diary update/delete does not remove obsolete objects.
- Code: `lib/imageHandler.ts`, `lib/diaryApi.ts`, `app/page.tsx`, `components/diary-detail.tsx`.

### `2025_Summary_Images`

- Yearly-summary images; code expects public readability.
- Path: `yearly/<index>.webp`; database path is `yearly_images.storage_path`.
- Upload uses `upsert: true`; deleting the row does not remove the object.
- The path omits year/summary ID, so additional years could collide.
- Code: `lib/imageHandler.ts`, `lib/yearlySummaryApi.ts`.

### `audio_messages`

- MP3, WAV, OGG, AAC, WebM, M4A, or FLAC, limited by code to 50 MB.
- Code expects public readability.
- Path: `<timestamp>_<random>.<extension>` at bucket root.
- Database path: `audio_messages.audio_path`.
- Upload uses `upsert: false`; audio deletion removes row then object.
- Code: `lib/audioHandler.ts`, `lib/audioApi.ts`.

Actual bucket visibility and policies need confirmation in Supabase. The project generates public URLs, not signed URLs.

## Image data flow

```text
User selects images
→ browser resizes and converts to WebP
→ browser uploads to Supabase Storage
→ database stores relative path(s)
→ page query returns paths
→ `getPublicUrl()` generates addresses
→ browser displays public URLs
```

Diary uploads accept up to 18 images in the UI. Yearly-summary images follow the same compression/upload pattern through their metadata table.

## Database access patterns

- Browser-direct: diary CRUD, health, messages, audio, yearly summaries, and Storage use the shared anon client.
- Server route: `/api/diary-download` performs a date-range query through `lib/diaryApi.ts`; other API routes do not write Supabase.
- Pagination: diaries/messages use exact counts and `.range()`.
- Ordering: diary date, message/audio creation time, and yearly child fields.
- Search: diary `content`/`subtitle` use OR `ilike` filters.
- Batch media: diary image upload uses `Promise.all`; no database transaction/RPC exists.
- Cache: diary fallback uses compressed `localStorage`; yearly summaries use a five-minute in-memory cache.

## Scripts and migrations

| Script | Purpose | Usage notes |
|---|---|---|
| `test_extra/CREATE_HEALTH_CONDITIONS_TABLE.sql` | Creates health table, enables RLS, adds example policies | Tighten before production; policy names do not match unconditional expressions |
| `test_extra/CREATE_ANONYMOUS_MESSAGE_TABLE.sql` | Creates message table/index and public read/insert policies | No update/delete grant |

There is no complete migration directory or checked-in Storage policy definition. `test_extra/add_diary.py` is UI automation, not a migration.

## Known issues and risks

- Production schemas, constraints, indexes, RLS, and Storage policies are only partially represented.
- Direct anon writes rely entirely on RLS/Storage policy; UI roles are not trusted authorization.
- README's old architecture diagram names `yearly_summary_events`/`yearly_summary_analysis`, but code uses the five yearly tables documented above.
- Diary/yearly image changes can leave orphaned Storage objects.
- Yearly image paths can collide across years.
- The shared client throws during module initialization when URL/key variables are absent.
- Public unoptimized media can increase bandwidth and gallery load time.
- `modifiedAt` is mixed-case and requires coordinated migration/query changes if normalized.
- No service-role key exists; adding one to the shared client would expose privileged access.

## Change checklist

After database or Storage changes, verify:

- Type definitions and conversion functions.
- All queries, writes, filters, ordering, and caches using changed fields.
- Constraints, indexes, foreign keys, cascade behavior, and migrations.
- RLS for anon/future authenticated roles and Storage access/delete policies.
- Client/server boundaries and environment-variable needs.
- Existing stored paths, orphan cleanup, and media visibility.
- This document, `AGENTS.md`, and relevant README guidance.
