-- Assertions for the disposable local fixture, after migration or rollback as labelled below.
DO $$
BEGIN
  IF to_regclass('public.diary_image_paths') IS NULL OR to_regclass('public.diary_image_sequences') IS NULL THEN RAISE EXCEPTION 'migration tables are missing'; END IF;
  IF (SELECT count(*) FROM public.diary_image_paths WHERE path = '2026/20260118_1.webp' AND diary_id = 1) <> 1 THEN RAISE EXCEPTION 'initial diary path was not mapped'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.diary_image_paths'::regclass AND contype = 'p') THEN RAISE EXCEPTION 'path mapping primary key is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public."diaryContent"'::regclass AND tgname = 'diary_image_invariants_trigger') THEN RAISE EXCEPTION 'diary trigger is missing'; END IF;
END $$;
