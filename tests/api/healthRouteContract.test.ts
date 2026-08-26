import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/server/supabaseAdmin', () => ({
  getSupabaseAdmin: async () => ({
    from: () => ({
      select: () => ({
        order: async () => ({
          data: [{
            id: 'condition-1',
            condition: '感冒',
            start_date: '2026-08-20',
            end_date: '2026-08-23',
            color: '#FFD700',
            created_at: '2026-08-20T00:00:00.000Z',
          }],
          error: null,
        }),
      }),
    }),
  }),
}))

import { GET } from '@/app/api/health/route'
import { createSession } from '@/lib/server/session'

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('health route response contract', () => {
  it('maps database date columns to camelCase browser fields', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32)
    process.env.SESSION_VERSION = '1'
    const session = await createSession('viewer')

    const response = await GET(new Request('http://localhost/api/health', {
      headers: { Cookie: `diary_session=${session.token}` },
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([{
      id: 'condition-1',
      condition: '感冒',
      startDate: '2026-08-20',
      endDate: '2026-08-23',
      color: '#FFD700',
      created_at: '2026-08-20T00:00:00.000Z',
    }])
  })
})
