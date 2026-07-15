-- Restores exactly the two audited pre-Batch-5 global Storage policies.
-- Restore bucket `public = true` separately through the documented Storage updateBucket API.
BEGIN;

GRANT ALL PRIVILEGES ON TABLE storage.objects, storage.buckets TO anon, authenticated;
CREATE POLICY "Enable Insert access for all users"
  ON storage.objects FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Public read images 13zwbcf_0"
  ON storage.objects FOR SELECT TO public USING (true);

COMMIT;
