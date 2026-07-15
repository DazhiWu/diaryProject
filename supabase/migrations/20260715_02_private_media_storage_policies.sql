-- Final reviewed policy SQL. Do not execute until the Batch 5 approval record is complete.
-- Bucket `public` flags are changed separately through the documented Storage updateBucket API.
-- Storage relation ACLs remain owned/granted by supabase_storage_admin; RLS policies are the access boundary.
BEGIN;

DROP POLICY "Enable Insert access for all users" ON storage.objects;
DROP POLICY "Public read images 13zwbcf_0" ON storage.objects;

COMMIT;
