import { afterEach, describe, expect, it } from 'vitest'

import { validateAuthConfiguration } from '@/lib/server/env'
import { createSession, readSession } from '@/lib/server/session'

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
})

function configureSessionEnvironment() {
  process.env.SESSION_SECRET = 'a-session-secret-that-is-at-least-thirty-two-bytes'
  process.env.SESSION_VERSION = '1'
}

describe('signed sessions', () => {
  it.each([['viewer', 30 * 24 * 60 * 60], ['admin', 7 * 24 * 60 * 60]] as const)(
    '%s expires at the fixed role duration',
    async (role, maxAge) => {
      configureSessionEnvironment()
      const created = await createSession(role, 1_000)
      expect(created.maxAge).toBe(maxAge)
      await expect(readSession(`diary_session=${created.token}`, 1_000 + maxAge * 1_000 - 1)).resolves.toMatchObject({ role })
      await expect(readSession(`diary_session=${created.token}`, 1_000 + maxAge * 1_000)).resolves.toBeNull()
    },
  )

  it('rejects a modified signature and mismatched session version', async () => {
    configureSessionEnvironment()
    const { token } = await createSession('viewer', 1_000)
    await expect(readSession(`diary_session=${token}x`, 1_001)).resolves.toBeNull()
    process.env.SESSION_VERSION = '2'
    await expect(readSession(`diary_session=${token}`, 1_001)).resolves.toBeNull()
  })

  it('fails configuration for empty or equal passwords', () => {
    expect(() => validateAuthConfiguration({ viewer: '', admin: 'a' })).toThrow('AUTH_PASSWORD_VIEWER')
    expect(() => validateAuthConfiguration({ viewer: 'same', admin: 'same' })).toThrow('distinct')
  })
})
