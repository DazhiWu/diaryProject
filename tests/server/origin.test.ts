import { afterEach, describe, expect, it } from 'vitest'

import { POST } from '@/app/api/auth/route'
import { GET } from '@/app/api/auth/session/route'
import { assertAllowedOrigin } from '@/lib/server/origin'

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('request Origin and session endpoint', () => {
  it('accepts only configured production Origin for writes', async () => {
    process.env = { ...process.env, NODE_ENV: 'production', APP_ORIGIN: 'https://diary.wuzhizhii.com' }
    await expect(assertAllowedOrigin(new Request('https://worker/api', { method: 'POST', headers: { Origin: 'https://diary.wuzhizhii.com' } }))).resolves.toBeUndefined()
    await expect(assertAllowedOrigin(new Request('https://worker/api', { method: 'POST', headers: { Origin: 'https://x.example' } }))).rejects.toMatchObject({ status: 403 })
  })

  it('session endpoint never returns a token', async () => {
    const response = await GET(new Request('https://worker/api/auth/session'))
    await expect(response.json()).resolves.toEqual({ role: 'guest' })
  })

  it('returns 429 before a sixth local login attempt reaches credential handling', async () => {
    process.env = {
      ...process.env,
      NODE_ENV: 'test',
      AUTH_PASSWORD_VIEWER: 'viewer-password',
      AUTH_PASSWORD_ADMIN: 'admin-password',
      SESSION_SECRET: 'a-session-secret-that-is-at-least-thirty-two-bytes',
      SESSION_VERSION: '1',
    }
    const headers = { Origin: 'http://localhost:3000', 'X-Forwarded-For': '203.0.113.200' }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(POST(new Request('http://localhost:3000/api/auth', {
        method: 'POST', headers, body: JSON.stringify({ password: 'viewer-password' }),
      }))).resolves.toHaveProperty('status', 200)
    }

    const response = await POST(new Request('http://localhost:3000/api/auth', {
      method: 'POST', headers, body: JSON.stringify({ password: 'viewer-password' }),
    }))
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('60')
  })
})
