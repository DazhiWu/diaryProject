import 'server-only'

import { createRequestRateLimiter } from '@/lib/server/cloudflareRateLimit'

export const checkAiRateLimit = createRequestRateLimiter({
  bindingName: 'AI_RATE_LIMITER',
  limit: 5,
  prefix: 'modelscope',
  serviceUnavailableMessage: 'AI service unavailable',
})
