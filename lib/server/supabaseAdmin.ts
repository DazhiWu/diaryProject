import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { requireServerEnv } from '@/lib/server/env'

let client: SupabaseClient | undefined

export async function getSupabaseAdmin(): Promise<SupabaseClient> {
  if (client) return client

  const [url, serviceRoleKey] = await Promise.all([
    requireServerEnv('SUPABASE_URL'),
    requireServerEnv('SUPABASE_SERVICE_ROLE_KEY'),
  ])

  client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return client
}
