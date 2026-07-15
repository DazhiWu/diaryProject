# Approved-interface runbook: private media buckets

**Status: completed in production on 2026-07-15. Historical runbook only; do not execute it again as a pending change.** The three buckets are private, the Storage policies were removed, and the postflight/direct-access checks passed. Keep credentials out of this repository.

Supabase documents `storage.updateBucket(id, { public: false })` as the JavaScript API for updating a bucket. Use it for each of the three bucket flags; do not issue `UPDATE storage.buckets`.

```ts
for (const bucket of ['2024To2025_diary_images', '2025_Summary_Images', 'audio_messages']) {
  const { error } = await supabase.storage.updateBucket(bucket, { public: false })
  if (error) throw error
}
```

The completed production sequence applied `20260715_02_private_media_storage_policies.sql`, ran `20260715_storage_policy_lockdown_postflight.sql` plus anonymous Storage write/list checks, updated all three bucket flags, and ran `20260715_storage_access_postflight.sql`. The policy migration intentionally preserved the platform-owned `supabase_storage_admin` ACL grants; enabled RLS with no anon/authenticated policy denies Storage API operations.

For rollback, first call `updateBucket(bucket, { public: true })` for the same three IDs, then apply `20260715_02_private_media_storage_policies_rollback.sql`. Do not restore a broader policy.
