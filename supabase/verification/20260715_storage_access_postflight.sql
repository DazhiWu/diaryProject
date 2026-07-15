-- Read-only assertion after the approved policy lock-down and bucket API updates.
DO $$
DECLARE bucket_id text;
BEGIN
  FOREACH bucket_id IN ARRAY ARRAY['2024To2025_diary_images', '2025_Summary_Images', 'audio_messages'] LOOP
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = bucket_id AND public = false) THEN
      RAISE EXCEPTION 'Bucket % is missing or remains public', bucket_id;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname IN ('Enable Insert access for all users', 'Public read images 13zwbcf_0')) THEN
    RAISE EXCEPTION 'An audited legacy Storage policy remains';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename IN ('objects', 'buckets')) THEN
    RAISE EXCEPTION 'A Storage RLS policy remains and requires separate review';
  END IF;
  IF has_table_privilege('anon', 'storage.objects', 'SELECT') OR has_table_privilege('anon', 'storage.objects', 'INSERT')
    OR has_table_privilege('anon', 'storage.objects', 'UPDATE') OR has_table_privilege('anon', 'storage.objects', 'DELETE')
    OR has_table_privilege('authenticated', 'storage.objects', 'SELECT') OR has_table_privilege('authenticated', 'storage.objects', 'INSERT')
    OR has_table_privilege('authenticated', 'storage.objects', 'UPDATE') OR has_table_privilege('authenticated', 'storage.objects', 'DELETE')
    OR has_table_privilege('anon', 'storage.buckets', 'SELECT') OR has_table_privilege('authenticated', 'storage.buckets', 'SELECT') THEN
    RAISE EXCEPTION 'anon or authenticated retains an effective Storage table privilege';
  END IF;
  IF NOT has_table_privilege('service_role', 'storage.objects', 'SELECT') OR NOT has_table_privilege('service_role', 'storage.objects', 'INSERT')
    OR NOT has_table_privilege('service_role', 'storage.objects', 'UPDATE') OR NOT has_table_privilege('service_role', 'storage.objects', 'DELETE')
    OR NOT has_table_privilege('service_role', 'storage.buckets', 'SELECT') THEN
    RAISE EXCEPTION 'service_role lost a required Storage privilege';
  END IF;
END $$;

SELECT id, public FROM storage.buckets WHERE id IN ('2024To2025_diary_images', '2025_Summary_Images', 'audio_messages') ORDER BY id;
