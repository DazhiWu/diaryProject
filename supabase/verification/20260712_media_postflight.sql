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

SELECT c.conname, c.contype, pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.conrelid = 'public.diary_image_paths'::regclass
ORDER BY c.conname;

SELECT event_object_table AS table_name, trigger_name
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND trigger_name IN ('diary_image_invariants_trigger', 'yearly_image_path_trigger', 'audio_path_trigger')
GROUP BY event_object_table, trigger_name
ORDER BY table_name, trigger_name;

SELECT to_regclass('private.diary_image_paths_backup_20260713') AS preserved_backup_table;
