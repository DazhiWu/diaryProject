import { describe, expect, it } from 'vitest'

import { checkLoginRateLimit, createMemoryLoginLimiter } from '@/lib/server/loginRateLimit'

describe('login rate limiting', () => {
  it('allows five attempts and rejects the sixth for the same client key', async () => {
    const limiter = createMemoryLoginLimiter({ limit: 5, periodSeconds: 60, now: () => 1_000 })
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(limiter.limit('auth:203.0.113.10')).resolves.toEqual({ allowed: true, retryAfterSeconds: 60 })
    }
    await expect(limiter.limit('auth:203.0.113.10')).resolves.toEqual({ allowed: false, retryAfterSeconds: 60 })
  })

  it('keeps different client keys independent', async () => {
    const limiter = createMemoryLoginLimiter({ limit: 1, periodSeconds: 60, now: () => 1_000 })
    await expect(limiter.limit('auth:203.0.113.10')).resolves.toMatchObject({ allowed: true })
    await expect(limiter.limit('auth:203.0.113.11')).resolves.toMatchObject({ allowed: true })
  })

  it('fails closed when the production binding or trusted IP header is missing', async () => {
    await expect(checkLoginRateLimit(new Request('https://worker/api/auth'), { production: true })).rejects.toMatchObject({ status: 503 })
    await expect(checkLoginRateLimit(
      new Request('https://worker/api/auth', { headers: { 'cf-connecting-ip': '203.0.113.10' } }),
      { production: true },
    )).rejects.toMatchObject({ status: 503 })
  })
})
