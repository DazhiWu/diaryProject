-- Requires every result set in supabase/verification/20260712_media_preflight.sql to be empty.
-- This migration intentionally does not repair or coerce production data.
BEGIN;

DO $$
DECLARE diary_date_is_unique boolean;
BEGIN
  IF to_regnamespace('private') IS NULL THEN RAISE EXCEPTION 'private schema is required to record rollback state'; END IF;
  IF to_regclass('public.diary_image_paths') IS NOT NULL OR to_regclass('public.diary_image_sequences') IS NOT NULL OR to_regclass('private.media_invariants_20260712_01_state') IS NOT NULL THEN RAISE EXCEPTION 'a media-invariants table already exists'; END IF;
  IF to_regprocedure('public.enforce_diary_image_invariants()') IS NOT NULL OR to_regprocedure('public.enforce_yearly_image_path()') IS NOT NULL OR to_regprocedure('public.enforce_audio_path()') IS NOT NULL THEN RAISE EXCEPTION 'a media-invariants function already exists'; END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid IN ('public."diaryContent"'::regclass, 'public.yearly_images'::regclass, 'public.audio_messages'::regclass) AND t.tgname IN ('diary_image_invariants_trigger', 'yearly_image_path_trigger', 'audio_path_trigger')) THEN RAISE EXCEPTION 'a media-invariants trigger already exists'; END IF;
  IF to_regclass('public.yearly_images_storage_path_unique_idx') IS NOT NULL OR to_regclass('public.audio_messages_audio_path_unique_idx') IS NOT NULL THEN RAISE EXCEPTION 'a media-invariants index already exists'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = 'public."diaryContent"'::regclass AND i.indisunique AND i.indpred IS NULL
      AND i.indnkeyatts = 1 AND (SELECT a.attname FROM pg_attribute a WHERE a.attrelid = i.indrelid AND a.attnum = i.indkey[0]) = 'date'
  ) INTO diary_date_is_unique;
  IF NOT diary_date_is_unique THEN RAISE EXCEPTION 'diaryContent.date must already have a non-partial unique index'; END IF;

  IF EXISTS (SELECT 1 FROM public."diaryContent" GROUP BY date HAVING count(*) > 1) THEN RAISE EXCEPTION 'diaryContent.date contains duplicates'; END IF;
  IF EXISTS (SELECT 1 FROM public."diaryContent" WHERE image_paths IS NULL OR jsonb_typeof(image_paths) <> 'array') THEN RAISE EXCEPTION 'diaryContent.image_paths contains null or non-array values'; END IF;
  IF EXISTS (SELECT 1 FROM public."diaryContent" d CROSS JOIN LATERAL jsonb_array_elements(d.image_paths) p(value) WHERE jsonb_typeof(p.value) <> 'string') THEN RAISE EXCEPTION 'diaryContent.image_paths contains a non-string value'; END IF;
  IF EXISTS (
    SELECT 1 FROM public."diaryContent" d CROSS JOIN LATERAL jsonb_array_elements_text(d.image_paths) p(path)
    WHERE p.path !~ '^[0-9]{4}/[0-9]{8}_[0-9]+\.webp$' OR split_part(p.path, '/', 1) <> to_char(d.date, 'YYYY') OR substring(split_part(p.path, '/', 2) FROM 1 FOR 8) <> to_char(d.date, 'YYYYMMDD')
  ) THEN RAISE EXCEPTION 'diaryContent.image_paths contains an invalid or date-mismatched path'; END IF;
  IF EXISTS (
    SELECT 1 FROM public."diaryContent" d CROSS JOIN LATERAL jsonb_array_elements_text(d.image_paths) p(path) GROUP BY d.id, p.path HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'a diary repeats an image path'; END IF;
  IF EXISTS (
    SELECT 1 FROM public."diaryContent" d CROSS JOIN LATERAL jsonb_array_elements_text(d.image_paths) p(path) GROUP BY p.path HAVING count(DISTINCT d.id) > 1
  ) THEN RAISE EXCEPTION 'a diary image path belongs to more than one diary'; END IF;
  IF EXISTS (SELECT 1 FROM public.yearly_images WHERE storage_path IS NULL OR storage_path !~ '^yearly/[1-9][0-9]*\.webp$') THEN RAISE EXCEPTION 'yearly_images.storage_path violates the preflight'; END IF;
  IF EXISTS (SELECT 1 FROM public.yearly_images WHERE storage_path IS NOT NULL GROUP BY storage_path HAVING count(*) > 1) THEN RAISE EXCEPTION 'yearly_images.storage_path contains duplicates'; END IF;
  IF EXISTS (SELECT 1 FROM public.audio_messages WHERE audio_path IS NULL OR audio_path !~ '^[^/\\?%#]+\.mp3$') THEN RAISE EXCEPTION 'audio_messages.audio_path violates the preflight'; END IF;
  IF EXISTS (SELECT 1 FROM public.audio_messages WHERE audio_path IS NOT NULL GROUP BY audio_path HAVING count(*) > 1) THEN RAISE EXCEPTION 'audio_messages.audio_path contains duplicates'; END IF;
END $$;

CREATE TABLE private.media_invariants_20260712_01_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  diary_image_paths_not_null boolean NOT NULL, diary_image_paths_default text,
  yearly_storage_path_not_null boolean NOT NULL, yearly_storage_path_default text,
  audio_path_not_null boolean NOT NULL, audio_path_default text,
  diary_paths_oid oid, diary_sequences_oid oid, yearly_index_oid oid, audio_index_oid oid,
  diary_function_oid oid, yearly_function_oid oid, audio_function_oid oid,
  diary_trigger_oid oid, yearly_trigger_oid oid, audio_trigger_oid oid,
  diary_function_hash text, yearly_function_hash text, audio_function_hash text,
  diary_trigger_hash text, yearly_trigger_hash text, audio_trigger_hash text,
  yearly_index_hash text, audio_index_hash text
);

INSERT INTO private.media_invariants_20260712_01_state (
  diary_image_paths_not_null, diary_image_paths_default, yearly_storage_path_not_null, yearly_storage_path_default, audio_path_not_null, audio_path_default
)
SELECT d.attnotnull, pg_get_expr(dd.adbin, dd.adrelid), y.attnotnull, pg_get_expr(yd.adbin, yd.adrelid), a.attnotnull, pg_get_expr(ad.adbin, ad.adrelid)
FROM pg_attribute d
LEFT JOIN pg_attrdef dd ON dd.adrelid = d.attrelid AND dd.adnum = d.attnum
CROSS JOIN pg_attribute y LEFT JOIN pg_attrdef yd ON yd.adrelid = y.attrelid AND yd.adnum = y.attnum
CROSS JOIN pg_attribute a LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
WHERE d.attrelid = 'public."diaryContent"'::regclass AND d.attname = 'image_paths' AND NOT d.attisdropped
  AND y.attrelid = 'public.yearly_images'::regclass AND y.attname = 'storage_path' AND NOT y.attisdropped
  AND a.attrelid = 'public.audio_messages'::regclass AND a.attname = 'audio_path' AND NOT a.attisdropped;

CREATE TABLE public.diary_image_paths (
  path text PRIMARY KEY,
  diary_id bigint NOT NULL REFERENCES public."diaryContent"(id) ON DELETE CASCADE,
  diary_date date NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0)
);
ALTER TABLE public.diary_image_paths ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.diary_image_sequences (
  date date PRIMARY KEY,
  last_sequence integer NOT NULL CHECK (last_sequence >= 0)
);

INSERT INTO public.diary_image_paths (path, diary_id, diary_date, sequence)
SELECT p.path, d.id, d.date, (substring(p.path FROM '_([0-9]+)\.webp$'))::integer
FROM public."diaryContent" d CROSS JOIN LATERAL jsonb_array_elements_text(d.image_paths) p(path);

INSERT INTO public.diary_image_sequences (date, last_sequence)
SELECT d.date, COALESCE(max(m.sequence), 0)
FROM public."diaryContent" d LEFT JOIN public.diary_image_paths m ON m.diary_id = d.id
GROUP BY d.date;

CREATE FUNCTION public.enforce_diary_image_invariants() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE image_path text; max_sequence integer := 0;
BEGIN
  IF jsonb_typeof(NEW.image_paths) <> 'array' THEN RAISE EXCEPTION 'image_paths must be a JSON array'; END IF;
  IF TG_OP = 'UPDATE' AND NEW.date IS DISTINCT FROM OLD.date AND jsonb_array_length(OLD.image_paths) > 0 THEN RAISE EXCEPTION 'a diary with images cannot change date'; END IF;
  FOR image_path IN SELECT jsonb_array_elements_text(NEW.image_paths) LOOP
    IF image_path !~ '^[0-9]{4}/[0-9]{8}_[0-9]+\.webp$' OR split_part(image_path, '/', 1) <> to_char(NEW.date, 'YYYY') OR substring(split_part(image_path, '/', 2) FROM 1 FOR 8) <> to_char(NEW.date, 'YYYYMMDD') THEN RAISE EXCEPTION 'diary image path does not match its diary date'; END IF;
    max_sequence := GREATEST(max_sequence, (substring(image_path FROM '_([0-9]+)\.webp$'))::integer);
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(NEW.image_paths) p(path) GROUP BY p.path HAVING count(*) > 1) THEN RAISE EXCEPTION 'a diary cannot repeat an image path'; END IF;
  DELETE FROM public.diary_image_paths WHERE diary_id = NEW.id;
  INSERT INTO public.diary_image_paths (path, diary_id, diary_date, sequence)
  SELECT p.path, NEW.id, NEW.date, (substring(p.path FROM '_([0-9]+)\.webp$'))::integer FROM jsonb_array_elements_text(NEW.image_paths) p(path);
  INSERT INTO public.diary_image_sequences (date, last_sequence) VALUES (NEW.date, max_sequence)
  ON CONFLICT (date) DO UPDATE SET last_sequence = GREATEST(public.diary_image_sequences.last_sequence, EXCLUDED.last_sequence);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_diary_image_invariants() FROM PUBLIC;

CREATE TRIGGER diary_image_invariants_trigger BEFORE INSERT OR UPDATE OF date, image_paths ON public."diaryContent" FOR EACH ROW EXECUTE FUNCTION public.enforce_diary_image_invariants();

ALTER TABLE public."diaryContent" ALTER COLUMN image_paths SET DEFAULT '[]'::jsonb;
ALTER TABLE public."diaryContent" ALTER COLUMN image_paths SET NOT NULL;
ALTER TABLE public.yearly_images ALTER COLUMN storage_path SET NOT NULL;
CREATE UNIQUE INDEX yearly_images_storage_path_unique_idx ON public.yearly_images (storage_path);
CREATE FUNCTION public.enforce_yearly_image_path() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$ BEGIN IF NEW.storage_path !~ '^yearly/[1-9][0-9]*\.webp$' THEN RAISE EXCEPTION 'invalid yearly image path'; END IF; RETURN NEW; END $$;
CREATE TRIGGER yearly_image_path_trigger BEFORE INSERT OR UPDATE OF storage_path ON public.yearly_images FOR EACH ROW EXECUTE FUNCTION public.enforce_yearly_image_path();
ALTER TABLE public.audio_messages ALTER COLUMN audio_path SET NOT NULL;
CREATE UNIQUE INDEX audio_messages_audio_path_unique_idx ON public.audio_messages (audio_path);
CREATE FUNCTION public.enforce_audio_path() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$ BEGIN IF NEW.audio_path !~ '^[^/\\?%#]+\.mp3$' THEN RAISE EXCEPTION 'invalid audio path'; END IF; RETURN NEW; END $$;
CREATE TRIGGER audio_path_trigger BEFORE INSERT OR UPDATE OF audio_path ON public.audio_messages FOR EACH ROW EXECUTE FUNCTION public.enforce_audio_path();

UPDATE private.media_invariants_20260712_01_state s SET
  diary_paths_oid = 'public.diary_image_paths'::regclass, diary_sequences_oid = 'public.diary_image_sequences'::regclass,
  yearly_index_oid = 'public.yearly_images_storage_path_unique_idx'::regclass, audio_index_oid = 'public.audio_messages_audio_path_unique_idx'::regclass,
  diary_function_oid = 'public.enforce_diary_image_invariants()'::regprocedure, yearly_function_oid = 'public.enforce_yearly_image_path()'::regprocedure, audio_function_oid = 'public.enforce_audio_path()'::regprocedure,
  diary_trigger_oid = (SELECT oid FROM pg_trigger WHERE tgrelid = 'public."diaryContent"'::regclass AND tgname = 'diary_image_invariants_trigger'),
  yearly_trigger_oid = (SELECT oid FROM pg_trigger WHERE tgrelid = 'public.yearly_images'::regclass AND tgname = 'yearly_image_path_trigger'),
  audio_trigger_oid = (SELECT oid FROM pg_trigger WHERE tgrelid = 'public.audio_messages'::regclass AND tgname = 'audio_path_trigger'),
  diary_function_hash = md5(pg_get_functiondef('public.enforce_diary_image_invariants()'::regprocedure)), yearly_function_hash = md5(pg_get_functiondef('public.enforce_yearly_image_path()'::regprocedure)), audio_function_hash = md5(pg_get_functiondef('public.enforce_audio_path()'::regprocedure)),
  diary_trigger_hash = md5(pg_get_triggerdef((SELECT oid FROM pg_trigger WHERE tgrelid = 'public."diaryContent"'::regclass AND tgname = 'diary_image_invariants_trigger'))), yearly_trigger_hash = md5(pg_get_triggerdef((SELECT oid FROM pg_trigger WHERE tgrelid = 'public.yearly_images'::regclass AND tgname = 'yearly_image_path_trigger'))), audio_trigger_hash = md5(pg_get_triggerdef((SELECT oid FROM pg_trigger WHERE tgrelid = 'public.audio_messages'::regclass AND tgname = 'audio_path_trigger'))),
  yearly_index_hash = md5(pg_get_indexdef('public.yearly_images_storage_path_unique_idx'::regclass)), audio_index_hash = md5(pg_get_indexdef('public.audio_messages_audio_path_unique_idx'::regclass));

COMMIT;
