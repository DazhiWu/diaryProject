-- Run only after the approved media-invariants migration has completed.

SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('diaryContent', 'yearly_images', 'audio_messages')
  AND column_name IN ('date', 'image_paths', 'storage_path', 'audio_path')
ORDER BY table_name, column_name;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('diaryContent', 'yearly_images', 'audio_messages')
  AND (
    indexdef ILIKE '%UNIQUE%date%'
    OR indexdef ILIKE '%UNIQUE%storage_path%'
    OR indexdef ILIKE '%UNIQUE%audio_path%'
  )
ORDER BY tablename, indexname;

SELECT date, last_sequence
FROM public.diary_image_sequences
ORDER BY date DESC
LIMIT 5;
