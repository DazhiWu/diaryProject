-- Disposable PostgreSQL fixture for 20260712_01_media_invariants.sql.
-- Run only in a newly created local test database.
CREATE SCHEMA private;
CREATE TABLE private.diary_image_paths_backup_20260713 (path text);

CREATE TABLE public."diaryContent" (
  id bigint PRIMARY KEY,
  date date NOT NULL UNIQUE,
  image_paths jsonb
);
CREATE TABLE public.yearly_images (
  id bigint PRIMARY KEY,
  yearly_summary_id bigint NOT NULL,
  storage_path text DEFAULT 'legacy-yearly-path'
);
CREATE TABLE public.audio_messages (
  id bigint PRIMARY KEY,
  audio_path text DEFAULT 'legacy-audio-path'
);

INSERT INTO public."diaryContent" (id, date, image_paths) VALUES
  (1, DATE '2026-01-18', '["2026/20260118_1.webp"]'::jsonb),
  (2, DATE '2026-01-19', '[]'::jsonb),
  (3, DATE '2026-01-20', '[]'::jsonb);
INSERT INTO public.yearly_images (id, yearly_summary_id, storage_path) VALUES (1, 1, 'yearly/1.webp');
INSERT INTO public.audio_messages (id, audio_path) VALUES (1, 'recording.mp3');
