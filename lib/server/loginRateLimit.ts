import 'server-only'

import { createMemoryRateLimiter, createRequestRateLimiter } from '@/lib/server/cloudflareRateLimit'

export type { RateLimitDecision as LoginRateLimitDecision } from '@/lib/server/cloudflareRateLimit'
export const createMemoryLoginLimiter = createMemoryRateLimiter

export const checkLoginRateLimit = createRequestRateLimiter({
  bindingName: 'LOGIN_RATE_LIMITER',
  limit: 5,
  prefix: 'auth',
  serviceUnavailableMessage: 'Login service unavailable',
})
