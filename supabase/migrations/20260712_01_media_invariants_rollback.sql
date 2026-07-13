-- Roll back only objects introduced by 20260712_01_media_invariants.sql.
-- This does not alter diary, yearly-image, audio, or backup-table rows.
BEGIN;
DROP TRIGGER IF EXISTS diary_image_invariants_trigger ON public."diaryContent";
DROP TRIGGER IF EXISTS yearly_image_path_trigger ON public.yearly_images;
DROP TRIGGER IF EXISTS audio_path_trigger ON public.audio_messages;
DROP FUNCTION IF EXISTS public.enforce_diary_image_invariants();
DROP FUNCTION IF EXISTS public.enforce_yearly_image_path();
DROP FUNCTION IF EXISTS public.enforce_audio_path();
DROP INDEX IF EXISTS public.diary_content_date_unique_idx;
DROP INDEX IF EXISTS public.yearly_images_storage_path_unique_idx;
DROP INDEX IF EXISTS public.audio_messages_audio_path_unique_idx;
DROP TABLE IF EXISTS public.diary_image_sequences;
ALTER TABLE public."diaryContent" ALTER COLUMN image_paths DROP NOT NULL;
ALTER TABLE public."diaryContent" ALTER COLUMN image_paths DROP DEFAULT;
ALTER TABLE public.yearly_images ALTER COLUMN storage_path DROP NOT NULL;
ALTER TABLE public.audio_messages ALTER COLUMN audio_path DROP NOT NULL;
COMMIT;
