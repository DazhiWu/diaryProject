-- Requires every result set in supabase/verification/20260712_media_preflight.sql to be empty.
-- This migration intentionally does not repair or coerce production data.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."diaryContent" GROUP BY date HAVING count(*) > 1) THEN RAISE EXCEPTION 'diaryContent.date contains duplicates; run the approved preflight and repair separately'; END IF;
  IF EXISTS (SELECT 1 FROM public."diaryContent" WHERE image_paths IS NULL OR jsonb_typeof(image_paths) <> 'array') THEN RAISE EXCEPTION 'diaryContent.image_paths contains null or non-array values'; END IF;
  IF EXISTS (SELECT 1 FROM public.yearly_images WHERE storage_path IS NULL OR storage_path !~ '^yearly/[1-9][0-9]*\.webp$') THEN RAISE EXCEPTION 'yearly_images.storage_path violates the preflight'; END IF;
  IF EXISTS (SELECT 1 FROM public.audio_messages WHERE audio_path IS NULL OR audio_path !~ '^[^/\\?%#]+\.mp3$') THEN RAISE EXCEPTION 'audio_messages.audio_path violates the preflight'; END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS diary_content_date_unique_idx ON public."diaryContent" (date);
ALTER TABLE public."diaryContent" ALTER COLUMN image_paths SET DEFAULT '[]'::jsonb;
ALTER TABLE public."diaryContent" ALTER COLUMN image_paths SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.diary_image_sequences (
  date date PRIMARY KEY,
  last_sequence integer NOT NULL CHECK (last_sequence >= 0)
);

INSERT INTO public.diary_image_sequences (date, last_sequence)
SELECT d.date, COALESCE(max((substring(p.path FROM '_([0-9]+)\.webp$'))::integer), 0)
FROM public."diaryContent" AS d
LEFT JOIN LATERAL jsonb_array_elements_text(d.image_paths) AS p(path) ON true
GROUP BY d.date
ON CONFLICT (date) DO UPDATE SET last_sequence = GREATEST(public.diary_image_sequences.last_sequence, EXCLUDED.last_sequence);

CREATE OR REPLACE FUNCTION public.enforce_diary_image_invariants() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE image_path text; image_value jsonb; max_sequence integer := 0;
BEGIN
  IF jsonb_typeof(NEW.image_paths) <> 'array' THEN RAISE EXCEPTION 'image_paths must be a JSON array'; END IF;
  IF TG_OP = 'UPDATE' AND NEW.date IS DISTINCT FROM OLD.date AND jsonb_array_length(OLD.image_paths) > 0 THEN RAISE EXCEPTION 'A diary with images cannot change date'; END IF;
  FOR image_value IN SELECT value FROM jsonb_array_elements(NEW.image_paths) LOOP
    IF jsonb_typeof(image_value) <> 'string' THEN RAISE EXCEPTION 'image_paths must contain strings'; END IF;
    image_path := image_value #>> '{}';
    IF image_path !~ '^[0-9]{4}/[0-9]{8}_[0-9]+\.webp$'
      OR split_part(image_path, '/', 1) <> to_char(NEW.date, 'YYYY')
      OR substring(split_part(image_path, '/', 2) FROM 1 FOR 8) <> to_char(NEW.date, 'YYYYMMDD') THEN RAISE EXCEPTION 'Diary image path does not match its diary date'; END IF;
    max_sequence := GREATEST(max_sequence, (substring(image_path FROM '_([0-9]+)\.webp$'))::integer);
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(NEW.image_paths) AS p(path) GROUP BY path HAVING count(*) > 1) THEN RAISE EXCEPTION 'A diary cannot repeat an image path'; END IF;
  IF EXISTS (SELECT 1 FROM public."diaryContent" AS d CROSS JOIN LATERAL jsonb_array_elements_text(d.image_paths) AS p(path) WHERE d.id IS DISTINCT FROM NEW.id AND p.path IN (SELECT jsonb_array_elements_text(NEW.image_paths))) THEN RAISE EXCEPTION 'A diary image path already belongs to another diary'; END IF;
  INSERT INTO public.diary_image_sequences (date, last_sequence) VALUES (NEW.date, max_sequence)
  ON CONFLICT (date) DO UPDATE SET last_sequence = GREATEST(public.diary_image_sequences.last_sequence, EXCLUDED.last_sequence);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS diary_image_invariants_trigger ON public."diaryContent";
CREATE TRIGGER diary_image_invariants_trigger BEFORE INSERT OR UPDATE OF date, image_paths ON public."diaryContent" FOR EACH ROW EXECUTE FUNCTION public.enforce_diary_image_invariants();

ALTER TABLE public.yearly_images ALTER COLUMN storage_path SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS yearly_images_storage_path_unique_idx ON public.yearly_images (storage_path);
CREATE OR REPLACE FUNCTION public.enforce_yearly_image_path() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$ BEGIN
  IF NEW.storage_path !~ '^yearly/[1-9][0-9]*\.webp$' THEN RAISE EXCEPTION 'Invalid yearly image path'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS yearly_image_path_trigger ON public.yearly_images;
CREATE TRIGGER yearly_image_path_trigger BEFORE INSERT OR UPDATE OF storage_path ON public.yearly_images FOR EACH ROW EXECUTE FUNCTION public.enforce_yearly_image_path();

ALTER TABLE public.audio_messages ALTER COLUMN audio_path SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS audio_messages_audio_path_unique_idx ON public.audio_messages (audio_path);
CREATE OR REPLACE FUNCTION public.enforce_audio_path() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$ BEGIN
  IF NEW.audio_path !~ '^[^/\\?%#]+\.mp3$' THEN RAISE EXCEPTION 'Invalid audio path'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audio_path_trigger ON public.audio_messages;
CREATE TRIGGER audio_path_trigger BEFORE INSERT OR UPDATE OF audio_path ON public.audio_messages FOR EACH ROW EXECUTE FUNCTION public.enforce_audio_path();

COMMIT;
