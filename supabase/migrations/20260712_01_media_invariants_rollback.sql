-- Reverts 20260712_01_media_invariants.sql only when every recorded object is unchanged.
BEGIN;

DO $$
DECLARE s private.media_invariants_20260712_01_state%ROWTYPE;
BEGIN
  SELECT * INTO STRICT s FROM private.media_invariants_20260712_01_state WHERE singleton;
  IF 'public.diary_image_paths'::regclass <> s.diary_paths_oid OR 'private.diary_image_sequences'::regclass <> s.diary_sequences_oid OR 'public.yearly_images_storage_path_unique_idx'::regclass <> s.yearly_index_oid OR 'public.audio_messages_audio_path_unique_idx'::regclass <> s.audio_index_oid THEN RAISE EXCEPTION 'media-invariants relation was replaced; refusing rollback'; END IF;
  IF 'public.enforce_diary_image_invariants()'::regprocedure <> s.diary_function_oid OR 'public.enforce_yearly_image_path()'::regprocedure <> s.yearly_function_oid OR 'public.enforce_audio_path()'::regprocedure <> s.audio_function_oid THEN RAISE EXCEPTION 'media-invariants function was replaced; refusing rollback'; END IF;
  IF (SELECT oid FROM pg_trigger WHERE tgrelid = 'public."diaryContent"'::regclass AND tgname = 'diary_image_invariants_trigger') <> s.diary_trigger_oid OR (SELECT oid FROM pg_trigger WHERE tgrelid = 'public.yearly_images'::regclass AND tgname = 'yearly_image_path_trigger') <> s.yearly_trigger_oid OR (SELECT oid FROM pg_trigger WHERE tgrelid = 'public.audio_messages'::regclass AND tgname = 'audio_path_trigger') <> s.audio_trigger_oid THEN RAISE EXCEPTION 'media-invariants trigger was replaced; refusing rollback'; END IF;
  IF md5(pg_get_functiondef(s.diary_function_oid)) <> s.diary_function_hash OR md5(pg_get_functiondef(s.yearly_function_oid)) <> s.yearly_function_hash OR md5(pg_get_functiondef(s.audio_function_oid)) <> s.audio_function_hash OR md5(pg_get_triggerdef(s.diary_trigger_oid)) <> s.diary_trigger_hash OR md5(pg_get_triggerdef(s.yearly_trigger_oid)) <> s.yearly_trigger_hash OR md5(pg_get_triggerdef(s.audio_trigger_oid)) <> s.audio_trigger_hash OR md5(pg_get_indexdef(s.yearly_index_oid)) <> s.yearly_index_hash OR md5(pg_get_indexdef(s.audio_index_oid)) <> s.audio_index_hash OR md5((SELECT relrowsecurity::text || ':' || relforcerowsecurity::text FROM pg_class WHERE oid = s.diary_paths_oid) || COALESCE((SELECT string_agg(attnum || ':' || attname || ':' || atttypid || ':' || atttypmod || ':' || attnotnull, '|' ORDER BY attnum) FROM pg_attribute WHERE attrelid = s.diary_paths_oid AND attnum > 0 AND NOT attisdropped), '') || COALESCE((SELECT string_agg(conname || ':' || pg_get_constraintdef(oid), '|' ORDER BY conname) FROM pg_constraint WHERE conrelid = s.diary_paths_oid), '')) <> s.diary_paths_table_hash OR md5((SELECT relrowsecurity::text || ':' || relforcerowsecurity::text FROM pg_class WHERE oid = s.diary_sequences_oid) || COALESCE((SELECT string_agg(attnum || ':' || attname || ':' || atttypid || ':' || atttypmod || ':' || attnotnull, '|' ORDER BY attnum) FROM pg_attribute WHERE attrelid = s.diary_sequences_oid AND attnum > 0 AND NOT attisdropped), '') || COALESCE((SELECT string_agg(conname || ':' || pg_get_constraintdef(oid), '|' ORDER BY conname) FROM pg_constraint WHERE conrelid = s.diary_sequences_oid), '')) <> s.diary_sequences_table_hash THEN RAISE EXCEPTION 'media-invariants definition changed; refusing rollback'; END IF;

  EXECUTE 'ALTER TABLE public."diaryContent" ALTER COLUMN image_paths ' || CASE WHEN s.diary_image_paths_default IS NULL THEN 'DROP DEFAULT' ELSE 'SET DEFAULT ' || s.diary_image_paths_default END;
  EXECUTE 'ALTER TABLE public.yearly_images ALTER COLUMN storage_path ' || CASE WHEN s.yearly_storage_path_default IS NULL THEN 'DROP DEFAULT' ELSE 'SET DEFAULT ' || s.yearly_storage_path_default END;
  EXECUTE 'ALTER TABLE public.audio_messages ALTER COLUMN audio_path ' || CASE WHEN s.audio_path_default IS NULL THEN 'DROP DEFAULT' ELSE 'SET DEFAULT ' || s.audio_path_default END;
  IF s.diary_image_paths_not_null THEN ALTER TABLE public."diaryContent" ALTER COLUMN image_paths SET NOT NULL; ELSE ALTER TABLE public."diaryContent" ALTER COLUMN image_paths DROP NOT NULL; END IF;
  IF s.yearly_storage_path_not_null THEN ALTER TABLE public.yearly_images ALTER COLUMN storage_path SET NOT NULL; ELSE ALTER TABLE public.yearly_images ALTER COLUMN storage_path DROP NOT NULL; END IF;
  IF s.audio_path_not_null THEN ALTER TABLE public.audio_messages ALTER COLUMN audio_path SET NOT NULL; ELSE ALTER TABLE public.audio_messages ALTER COLUMN audio_path DROP NOT NULL; END IF;
END $$;

DROP TRIGGER diary_image_invariants_trigger ON public."diaryContent";
DROP TRIGGER yearly_image_path_trigger ON public.yearly_images;
DROP TRIGGER audio_path_trigger ON public.audio_messages;
DROP FUNCTION public.enforce_diary_image_invariants();
DROP FUNCTION public.enforce_yearly_image_path();
DROP FUNCTION public.enforce_audio_path();
DROP INDEX public.yearly_images_storage_path_unique_idx;
DROP INDEX public.audio_messages_audio_path_unique_idx;
DROP TABLE public.diary_image_paths;
DROP TABLE private.diary_image_sequences;
DROP TABLE private.media_invariants_20260712_01_state;
COMMIT;
