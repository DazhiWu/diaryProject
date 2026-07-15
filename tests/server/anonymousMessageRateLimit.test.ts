import { describe, expect, it } from 'vitest'

import { checkAnonymousMessageRateLimit } from '@/lib/server/anonymousMessageRateLimit'

describe('anonymous message rate limiting', () => {
  it('uses the production binding with the trusted Cloudflare client IP', async () => {
    const keys: string[] = []
    const decision = await checkAnonymousMessageRateLimit(
      new Request('https://worker/api/anonymous-messages', { headers: { 'cf-connecting-ip': '203.0.113.10' } }),
      { production: true, binding: { limit: async ({ key }) => { keys.push(key); return { success: true } } } },
    )
    expect(decision).toEqual({ allowed: true, retryAfterSeconds: 60 })
    expect(keys).toEqual(['anonymous-message:203.0.113.10'])
  })

  it('fails closed when the production IP or binding is unavailable', async () => {
    await expect(checkAnonymousMessageRateLimit(new Request('https://worker/api/anonymous-messages'), { production: true }))
      .rejects.toMatchObject({ status: 503 })
    await expect(checkAnonymousMessageRateLimit(
      new Request('https://worker/api/anonymous-messages', { headers: { 'cf-connecting-ip': '203.0.113.10' } }),
      { production: true },
    )).rejects.toMatchObject({ status: 503 })
  })
})
