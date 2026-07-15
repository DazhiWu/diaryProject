-- Read-only assertion between the policy migration and the bucket public-flag update.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'storage' AND c.relname IN ('objects', 'buckets') AND NOT c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Storage RLS is disabled';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename IN ('objects', 'buckets')) THEN
    RAISE EXCEPTION 'Storage policy remains after the policy lock-down migration';
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
    RAISE EXCEPTION 'service_role lost a required Storage object privilege';
  END IF;
END $$;
