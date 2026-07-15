-- Final reviewed policy SQL. Do not execute until the Batch 5 approval record is complete.
-- Bucket `public` flags are changed separately through the documented Storage updateBucket API.
BEGIN;

DROP POLICY "Enable Insert access for all users" ON storage.objects;
DROP POLICY "Public read images 13zwbcf_0" ON storage.objects;
REVOKE ALL PRIVILEGES ON TABLE storage.objects, storage.buckets FROM anon, authenticated;

COMMIT;
