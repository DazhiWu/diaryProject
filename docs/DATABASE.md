# Database and Storage

## Overview

The application uses Supabase PostgreSQL and Storage through a shared browser-visible anon client. Production metadata, policies, grants, constraints, indexes, and buckets were inspected read-only on 2026-07-12. The repository still lacks a complete migration history, so future schema changes must be exported as authoritative migrations rather than inferred from this document.

The application does not create a Supabase Auth session. `/api/auth` authenticates the configured viewer/admin passwords and writes a signed HttpOnly Cookie; `/api/auth/session` exposes only the resolved role to the browser. Cookie-authorized server routes use the server-only service-role client, while `anonymous_messages` remains the deliberate browser anon SELECT/INSERT exception. The Cookie role does not change the Supabase role for the anon client.

## Production tables

All listed production tables have RLS enabled.

### Diary

`diaryContent`:

| Field | Production type | Notes |
|---|---|---|
| `id` | `BIGINT` | Identity primary key |
| `date` | `DATE` | Unique; indexed descending as `idx_diary_date_desc` |
| `subtitle` | `TEXT` | Nullable; included in search |
| `content` | `TEXT` | Nullable in production, required by the TypeScript model |
| `modifiedAt` | `TIMESTAMP` | Nullable mixed-case field |
| `created_at` | `TIMESTAMPTZ` | Defaults to `now()` |
| `image_paths` | `JSONB` | Defaults to `[]`; TypeScript treats it as a string array |

`diary_AI_analysis` uses a `BIGINT` identity primary key plus nullable `diary_id`, `summary`, and `emotion`, with `created_at TIMESTAMPTZ DEFAULT now()`. Its foreign key to `diaryContent.id` uses `ON DELETE NO ACTION`; application code explicitly removes analysis rows before deleting a diary.

The application assumes one diary per date and handles PostgreSQL `23505`; production confirms the `diaryContent_date_key` unique constraint.

### Health and anonymous messages

`health_conditions` has `TEXT` primary key `id`, required `condition`, `start_date`, `end_date`, and `color`, plus nullable `created_at TIMESTAMPTZ DEFAULT now()`.

`anonymous_messages` has a `BIGINT` primary key, required `content`, required `created_at TIMESTAMPTZ DEFAULT now()`, and nullable `user_agent`/`ip_address`. The 2026-07-12 migration added a database check requiring trimmed content length from 2 through 1000 characters.

### Audio

`audio_messages` has a UUID primary key defaulting to `gen_random_uuid()`, required `title`, `author`, `date DATE`, `audio_path`, and `duration NUMERIC`, plus nullable `created_at TIMESTAMPTZ DEFAULT now()`.

### Yearly summaries

- `yearly_summaries`: integer primary key, unique required `year VARCHAR`, created/updated timestamps.
- `important_events`: integer primary key; required summary ID, start/end dates, description; indexed summary ID.
- `ai_analysis_sections`: integer primary key; required summary ID, title, content; indexed summary ID.
- `ai_analysis_opinions`: integer primary key; required section ID, content, analysis; indexed section ID.
- `yearly_images`: integer primary key; required summary ID, optional `storage_path`, required legacy `alt`, timestamps; indexed summary ID.

Production foreign keys from events, sections, and images to `yearly_summaries`, and from opinions to sections, all use `ON DELETE CASCADE`.

### Other production tables

The inspected Supabase project also contains `diaryInfo` and `rss_articles`. Current application source does not query them, so they are outside this application's documented data flow. `diaryInfo` has RLS enabled but no policy; `rss_articles` has a public read policy.

## Row Level Security and grants

Batch 5 is being applied to production one approved domain at a time. `diaryContent` and `diary_AI_analysis` now have no anon/authenticated table grants and no RLS policies; RLS remains enabled and service-role CRUD remains available to the authorized APIs. Health, yearly-summary, audio, and anonymous-message grants/policies retain their pre-change state until their own phases are approved.

`anonymous_messages` is intentionally limited to:

- `SELECT` for `anon` and `authenticated`.
- `INSERT` for `anon` and `authenticated`, subject to the 2–1000 character check.
- No UPDATE or DELETE policy, so client updates/deletes are blocked.

Health, yearly-summary, and audio tables still have a `PUBLIC FOR ALL USING (true)` policy. This permits direct anon reads and writes despite guest/viewer/admin UI restrictions, although current application clients use the service-role server boundary. `anonymous_messages` remains the deliberate anon SELECT/INSERT exception. Each remaining Batch 5 domain requires its own postflight and deployed role regression before the next domain starts.

The pre-Batch-5 Supabase security-advisor findings still requiring a final rerun include:

- broad permissive ALL policies on the not-yet-migrated health/yearly/audio tables;
- a `public.rls_auto_enable()` SECURITY DEFINER function executable by anon/authenticated;

These findings are tracked by the approved design in [`superpowers/specs/2026-07-12-stateless-session-backend-authorization-design.md`](superpowers/specs/2026-07-12-stateless-session-backend-authorization-design.md). Apply only the reviewed, separately approved domain migrations and rerun advisors after the final phase. Advisor remediation: [Supabase Database Linter](https://supabase.com/docs/guides/database/database-linter).

## Storage

Production confirms all three buckets are private. No bucket-specific `file_size_limit` or `allowed_mime_types` is configured, so project/platform limits apply.

The `20260712_01_media_invariants.sql` migration was applied to production on 2026-07-13 after an empty Batch 0 preflight. Its postflight passed and the preflight was repeated with all violation result sets empty. It enforces diary date/path and media-path invariants, uses `public.diary_image_paths` for concurrency-safe path ownership, and maintains the internal `private.diary_image_sequences` ledger. The authorized diary-image route reads the public path index for its next candidate and does not query the private ledger through the Data API. Keep `20260712_01_media_invariants_rollback.sql` for emergency recovery only; do not run it after later schema changes without separate approval.

The two former global `storage.objects` policies were removed in Batch 5. Platform-owned relation ACLs remain unchanged, but RLS is enabled with no anon/authenticated policy:

- direct public object URLs are denied because the buckets are private;
- browser anon listing, upload, overwrite, and delete do not expose or mutate objects;
- authorized service-role APIs retain read/write/delete access;
- diary/yearly/audio proxy behavior remains unchanged.

### `2024To2025_diary_images`

- Diary images use `<year>/<yyyymmdd>_<index>.webp`.
- Browser compression limits width to 1920px and writes WebP at quality `0.8`.
- Relative paths are stored in `diaryContent.image_paths`.
- Upload uses `upsert: false`; a duplicate path fails instead of overwriting.
- Authorized diary replace/delete routes perform Storage cleanup and report residual paths when cleanup fails.

### `2025_Summary_Images`

- Yearly images use `yearly/<uuid>_<index>.webp` for insert-only uniqueness.
- Relative paths are stored in `yearly_images.storage_path`.
- Replacing an image uploads a new object and updates the database reference through the authorized API.
- Authorized delete routes perform DB-first deletion and report any object path that still needs cleanup.

### `audio_messages`

- The client accepts MP3, WAV, OGG, AAC, WebM, M4A, or FLAC and imposes a 50 MB limit.
- Object paths use `<timestamp>_<random>.<extension>`.
- Upload uses `upsert: false`.
- Authorized APIs compensate failed metadata writes and perform DB-first deletion with residual-path reporting.

Database-row and Storage-object changes are not transactional. Failed metadata writes can leave orphaned objects, and failed object cleanup must be handled manually.

## Access patterns

- Server APIs: diary reads/CRUD, AI analysis, translation, CSV, and media reads. Diary media has latest-five/viewer/admin authorization; yearly media is readable by every role; audio is admin-only and supports a single HTTP Range.
- Authorized APIs: media write/replace/delete, health, and yearly-summary metadata require an admin Cookie plus Origin validation. Upload metadata failures trigger storage compensation; DB-first deletes report remaining object paths when cleanup fails. `anonymous_messages` remains the deliberate browser anon `SELECT`/`INSERT` exception.
- CSV export: `/api/diary-download` is admin-only and queries through the server service-role client.
- Pagination: diary/messages use exact counts and `.range()`.
- Search: diary `content`/`subtitle` use OR `ilike`.
- Cache: diary fallback uses compressed `localStorage`; yearly summaries use a five-minute in-memory cache.

Never substitute a service-role key for `SUPABASE_ANON_KEY`. The privileged client is `lib/server/supabaseAdmin.ts`, uses the separate server-only `SUPABASE_SERVICE_ROLE_KEY`, and must be called only from authorized routes.

## Checked-in SQL

- `test_extra/CREATE_HEALTH_CONDITIONS_TABLE.sql`: partial historical health schema/policies.
- `test_extra/CREATE_ANONYMOUS_MESSAGE_TABLE.sql`: anonymous-message schema with SELECT/INSERT-only policies and the content-length check.

These files are not a complete migration set. Applied production migrations include `restrict_anonymous_messages_public_access`, the 2026-07-13 `media_invariants` migration, and the approved Batch 5 Storage plus diary/AI phases.

## Change checklist

After database or Storage changes, verify:

- types, nullability, defaults, indexes, unique constraints, and foreign-key actions;
- Data API grants separately from RLS policies;
- anon/authenticated SELECT/INSERT/UPDATE/DELETE behavior;
- bucket visibility, MIME/size settings, listing, upload, overwrite, and delete behavior;
- client/server boundary and credential exposure;
- object-path compatibility and orphan cleanup;
- Supabase security/performance advisors;
- this document, `AGENTS.md`, and relevant README/deployment guidance.
