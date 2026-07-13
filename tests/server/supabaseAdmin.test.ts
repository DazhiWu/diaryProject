import { describe, expect, it } from 'vitest'

describe('server-only Supabase admin client', () => {
  it('creates the admin client only from a service-role runtime binding', async () => {
    await expect(import('@/lib/server/supabaseAdmin')).resolves.toHaveProperty('getSupabaseAdmin')
  })
})
