import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/server/supabaseAdmin', () => ({
  getSupabaseAdmin: async () => ({
    from: () => ({ select: () => ({ order: async () => ({ data: [], error: null }) }) }),
  }),
}))

import { GET as healthGet, POST as healthPost } from '@/app/api/health/route'
import { PATCH as healthPatch } from '@/app/api/health/[id]/route'
import { createSession } from '@/lib/server/session'

const originalEnv = { ...process.env }
afterEach(() => { process.env = { ...originalEnv } })
async function cookie(role: 'viewer' | 'admin') { process.env.SESSION_SECRET = 'a'.repeat(32); process.env.SESSION_VERSION = '1'; const session = await createSession(role); return `diary_session=${session.token}` }
function request(method: string, value?: unknown, session?: string) { return new Request('http://localhost/api/health', { method, headers: { Origin: 'http://localhost', 'Content-Type': 'application/json', ...(session ? { Cookie: session } : {}) }, body: value ? JSON.stringify(value) : undefined }) }

describe('remaining domain roles', () => {
  it('denies guest health reads, allows viewer reads, and restricts mutations to admins', async () => {
    expect((await healthGet(request('GET'))).status).toBe(401)
    expect((await healthGet(request('GET', undefined, await cookie('viewer')))).status).toBe(200)
    expect((await healthPost(request('POST', { condition: 'test', startDate: '2026-01-01', endDate: '2026-01-02', color: '#000000' }, await cookie('viewer')))).status).toBe(403)
    expect((await healthPatch(request('PATCH', { condition: 'test', startDate: '2026-01-01', endDate: '2026-01-02', color: '#000000' }, await cookie('viewer')), { params: Promise.resolve({ id: 'test' }) })).status).toBe(403)
  })

  it('keeps anonymous messages limited to list and insert exports', async () => {
    const module = await import('@/lib/messageBoardApi')
    expect(Object.keys(module)).not.toEqual(expect.arrayContaining(['updateAnonymousMessage', 'deleteAnonymousMessage']))
    expect(module.validateMessageContent('一')).toEqual({ valid: true })
    expect(module.validateMessageContent('x'.repeat(2001))).toMatchObject({ valid: false })
  })
})
