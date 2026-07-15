-- Read-only assertion between the policy migration and the bucket public-flag update.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename IN ('objects', 'buckets')) THEN
    RAISE EXCEPTION 'Storage policy remains after the policy lock-down migration';
  END IF;
  IF has_table_privilege('anon', 'storage.objects', 'SELECT') OR has_table_privilege('anon', 'storage.objects', 'INSERT')
    OR has_table_privilege('anon', 'storage.objects', 'UPDATE') OR has_table_privilege('anon', 'storage.objects', 'DELETE')
    OR has_table_privilege('authenticated', 'storage.objects', 'SELECT') OR has_table_privilege('authenticated', 'storage.objects', 'INSERT')
    OR has_table_privilege('authenticated', 'storage.objects', 'UPDATE') OR has_table_privilege('authenticated', 'storage.objects', 'DELETE')
    OR has_table_privilege('anon', 'storage.buckets', 'SELECT') OR has_table_privilege('authenticated', 'storage.buckets', 'SELECT') THEN
    RAISE EXCEPTION 'anon or authenticated retains an effective Storage privilege';
  END IF;
  IF NOT has_table_privilege('service_role', 'storage.objects', 'SELECT') OR NOT has_table_privilege('service_role', 'storage.objects', 'INSERT')
    OR NOT has_table_privilege('service_role', 'storage.objects', 'UPDATE') OR NOT has_table_privilege('service_role', 'storage.objects', 'DELETE')
    OR NOT has_table_privilege('service_role', 'storage.buckets', 'SELECT') THEN
    RAISE EXCEPTION 'service_role lost a required Storage object privilege';
  END IF;
END $$;
