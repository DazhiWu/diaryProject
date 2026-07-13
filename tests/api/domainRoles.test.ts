import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/server/supabaseAdmin', () => ({
  getSupabaseAdmin: async () => ({
    from: () => ({ select: () => ({ order: async () => ({ data: [], error: null }) }) }),
  }),
}))

import { GET as healthGet, POST as healthPost } from '@/app/api/health/route'
import { createSession } from '@/lib/server/session'

const originalEnv = { ...process.env }
afterEach(() => { process.env = { ...originalEnv } })
async function cookie(role: 'viewer' | 'admin') { process.env.SESSION_SECRET = 'a'.repeat(32); process.env.SESSION_VERSION = '1'; const session = await createSession(role); return `diary_session=${session.token}` }
function request(method: string, value?: unknown, session?: string) { return new Request('http://localhost/api/health', { method, headers: { Origin: 'http://localhost', 'Content-Type': 'application/json', ...(session ? { Cookie: session } : {}) }, body: value ? JSON.stringify(value) : undefined }) }

describe('remaining domain roles', () => {
  it('allows health reads and restricts mutations to admins', async () => {
    expect((await healthGet()).status).toBe(200)
    expect((await healthPost(request('POST', { condition: 'test', startDate: '2026-01-01', endDate: '2026-01-02', color: '#000000' }, await cookie('viewer')))).status).toBe(403)
  })

  it('keeps anonymous messages limited to list and insert exports', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'anon-key'
    const module = await import('@/lib/messageBoardApi')
    expect(Object.keys(module)).not.toEqual(expect.arrayContaining(['updateAnonymousMessage', 'deleteAnonymousMessage']))
  })
})
