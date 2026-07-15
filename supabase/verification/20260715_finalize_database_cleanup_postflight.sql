-- Run after 20260715144158_finalize_database_cleanup.sql.
BEGIN;

DO $$
DECLARE
  role_name text;
  privilege_name text;
BEGIN
  IF to_regclass('private.diary_image_paths_backup_20260713') IS NOT NULL THEN
    RAISE EXCEPTION 'temporary media backup table still exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index
    WHERE indrelid = 'public.diary_image_paths'::regclass
      AND indexrelid = 'public.diary_image_paths_diary_id_idx'::regclass
      AND indisvalid
      AND indisready
  ) THEN
    RAISE EXCEPTION 'diary_image_paths diary_id index is missing or invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.diary_image_paths'::regclass
      AND contype = 'f'
      AND pg_get_constraintdef(oid, true) = 'FOREIGN KEY (diary_id) REFERENCES "diaryContent"(id) ON DELETE CASCADE'
  ) THEN
    RAISE EXCEPTION 'diary_image_paths diary_id foreign key is missing or changed';
  END IF;

  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH privilege_name IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege(role_name, 'public."diaryInfo"', privilege_name) THEN
        RAISE EXCEPTION '% retains % on diaryInfo', role_name, privilege_name;
      END IF;
    END LOOP;

    FOREACH privilege_name IN ARRAY ARRAY['USAGE', 'SELECT', 'UPDATE'] LOOP
      IF has_sequence_privilege(role_name, 'public."diaryInfo_id_seq"', privilege_name) THEN
        RAISE EXCEPTION '% retains % on diaryInfo_id_seq', role_name, privilege_name;
      END IF;
    END LOOP;
  END LOOP;

  IF NOT has_table_privilege('service_role', 'public."diaryInfo"', 'SELECT') THEN
    RAISE EXCEPTION 'service_role can no longer read the preserved diaryInfo table';
  END IF;
END $$;

ROLLBACK;
