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
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) x
    WHERE n.nspname = 'storage' AND c.relname IN ('objects', 'buckets')
      AND pg_get_userbyid(x.grantee) IN ('anon', 'authenticated', 'service_role')
      AND pg_get_userbyid(x.grantor) <> 'supabase_storage_admin'
  ) THEN
    RAISE EXCEPTION 'Unexpected Storage ACL grantor remains';
  END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(c.relacl) x
      WHERE n.nspname = 'storage' AND c.relname IN ('objects', 'buckets')
        AND pg_get_userbyid(x.grantee) = 'anon' AND pg_get_userbyid(x.grantor) = 'supabase_storage_admin') <> 16
    OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(c.relacl) x
      WHERE n.nspname = 'storage' AND c.relname IN ('objects', 'buckets')
        AND pg_get_userbyid(x.grantee) = 'authenticated' AND pg_get_userbyid(x.grantor) = 'supabase_storage_admin') <> 16 THEN
    RAISE EXCEPTION 'Storage ACL baseline changed';
  END IF;
  IF NOT has_table_privilege('service_role', 'storage.objects', 'SELECT') OR NOT has_table_privilege('service_role', 'storage.objects', 'INSERT')
    OR NOT has_table_privilege('service_role', 'storage.objects', 'UPDATE') OR NOT has_table_privilege('service_role', 'storage.objects', 'DELETE')
    OR NOT has_table_privilege('service_role', 'storage.buckets', 'SELECT') THEN
    RAISE EXCEPTION 'service_role lost a required Storage privilege';
  END IF;
END $$;

SELECT id, public FROM storage.buckets WHERE id IN ('2024To2025_diary_images', '2025_Summary_Images', 'audio_messages') ORDER BY id;
