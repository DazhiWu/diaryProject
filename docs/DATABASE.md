# Database and Storage

## Overview

The application uses Supabase PostgreSQL and Storage through a shared browser-visible anon client. Production metadata, policies, grants, constraints, indexes, and buckets were inspected read-only on 2026-07-12. The repository still lacks a complete migration history, so future schema changes must be exported as authoritative migrations rather than inferred from this document.

The current app does not create a Supabase Auth session. `/api/auth` only returns a UI level stored in browser `localStorage`; it does not change the Supabase role. Browser and shared-server-client requests therefore use the anon role. A future approved redesign will add a server-signed Cookie Session and a server-only privileged client; that redesign is not implemented yet.

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

Production Data API grants give anon/authenticated broad table privileges. RLS is therefore the effective row-operation boundary.

`anonymous_messages` is intentionally limited to:

- `SELECT` for `anon` and `authenticated`.
- `INSERT` for `anon` and `authenticated`, subject to the 2–1000 character check.
- No UPDATE or DELETE policy, so client updates/deletes are blocked.

Most other application tables currently have a `PUBLIC FOR ALL USING (true)` policy. This permits anon reads and writes despite guest/viewer/admin UI restrictions. The approved future design will move these operations behind server APIs before tightening policies; until then, the current UI roles are not authorization.

Supabase security advisors additionally report:

- broad permissive ALL policies on the remaining browser-direct tables;
- a `public.rls_auto_enable()` SECURITY DEFINER function executable by anon/authenticated;
- broad Storage SELECT policy that allows listing all three public buckets.

These findings are tracked by the approved future design in [`superpowers/specs/2026-07-12-stateless-session-backend-authorization-design.md`](superpowers/specs/2026-07-12-stateless-session-backend-authorization-design.md). Do not apply the final tightening piecemeal before the replacement APIs are live. Advisor remediation: [Supabase Database Linter](https://supabase.com/docs/guides/database/database-linter).

## Storage

Production confirms all three buckets are public. No bucket-specific `file_size_limit` or `allowed_mime_types` is configured, so project/platform limits apply.

The shared `storage.objects` policies allow `PUBLIC INSERT` and broad `PUBLIC SELECT`. There is no UPDATE or DELETE policy:

- public object URLs and listing work;
- new object paths can be uploaded;
- existing objects cannot be overwritten;
- application-side object deletion is blocked and cleanup is manual.

### `2024To2025_diary_images`

- Diary images use `<year>/<yyyymmdd>_<index>.webp`.
- Browser compression limits width to 1920px and writes WebP at quality `0.8`.
- Relative paths are stored in `diaryContent.image_paths`.
- Upload uses `upsert: false`; a duplicate path fails instead of overwriting.
- Diary update/delete does not remove old objects.

### `2025_Summary_Images`

- Yearly images use `yearly/<uuid>_<index>.webp` for insert-only uniqueness.
- Relative paths are stored in `yearly_images.storage_path`.
- Replacing an image uploads a new object and updates the database reference; the old object remains for manual cleanup.
- Deleting a metadata row does not remove the Storage object.

### `audio_messages`

- The client accepts MP3, WAV, OGG, AAC, WebM, M4A, or FLAC and imposes a 50 MB limit.
- Object paths use `<timestamp>_<random>.<extension>`.
- Upload uses `upsert: false`.
- Code attempts object cleanup after metadata failures/deletes, but production Storage DELETE policy blocks that cleanup; manual deletion is required.

Database-row and Storage-object changes are not transactional. Failed metadata writes can leave orphaned objects, and failed object cleanup must be handled manually.

## Access patterns

- Browser-direct: diary CRUD, health, messages, audio, yearly summaries, and Storage.
- Shared server client: `/api/diary-download` uses the same anon client through `lib/diaryApi.ts`.
- Pagination: diary/messages use exact counts and `.range()`.
- Search: diary `content`/`subtitle` use OR `ilike`.
- Cache: diary fallback uses compressed `localStorage`; yearly summaries use a five-minute in-memory cache.

Never substitute a service-role key for `SUPABASE_ANON_KEY`. A future privileged client must use a separate server-only variable and module.

## Checked-in SQL

- `test_extra/CREATE_HEALTH_CONDITIONS_TABLE.sql`: partial historical health schema/policies.
- `test_extra/CREATE_ANONYMOUS_MESSAGE_TABLE.sql`: anonymous-message schema with SELECT/INSERT-only policies and the content-length check.

These files are not a complete migration set. The applied production migration is recorded in Supabase migration history as `restrict_anonymous_messages_public_access`.

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
