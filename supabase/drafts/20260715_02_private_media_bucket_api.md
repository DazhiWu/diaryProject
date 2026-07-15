# Approved-interface runbook: private media buckets

**Production execution remains pending approval.** Run from an operator-only environment that initializes a server-side Supabase client; do not add a credential to this repository.

Supabase documents `storage.updateBucket(id, { public: false })` as the JavaScript API for updating a bucket. Use it for each of the three bucket flags; do not issue `UPDATE storage.buckets`.

```ts
for (const bucket of ['2024To2025_diary_images', '2025_Summary_Images', 'audio_messages']) {
  const { error } = await supabase.storage.updateBucket(bucket, { public: false })
  if (error) throw error
}
```

The Dashboard's equivalent bucket visibility toggle is acceptable only if the operator records the same three resulting `public = false` values. After approval, apply `20260715_02_private_media_storage_policies.sql` first, run `20260715_storage_policy_lockdown_postflight.sql` and the anonymous Storage write/list checks, then update the three bucket flags and run `20260715_storage_access_postflight.sql`. The policy migration intentionally preserves the platform-owned `supabase_storage_admin` ACL grants; enabled RLS with no anon/authenticated policy denies Storage API operations.

For rollback, first call `updateBucket(bucket, { public: true })` for the same three IDs, then apply `20260715_02_private_media_storage_policies_rollback.sql`. Do not restore a broader policy.
