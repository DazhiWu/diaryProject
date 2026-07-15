import { describe, expect, it } from 'vitest'

import { checkAiRateLimit } from '@/lib/server/aiRateLimit'

describe('AI rate limiting', () => {
  it('uses the production binding with the trusted Cloudflare client IP', async () => {
    const keys: string[] = []
    const decision = await checkAiRateLimit(
      new Request('https://worker/api/translate', { headers: { 'cf-connecting-ip': '203.0.113.11' } }),
      { production: true, binding: { limit: async ({ key }) => { keys.push(key); return { success: true } } } },
    )
    expect(decision).toEqual({ allowed: true, retryAfterSeconds: 60 })
    expect(keys).toEqual(['modelscope:203.0.113.11'])
  })
})
