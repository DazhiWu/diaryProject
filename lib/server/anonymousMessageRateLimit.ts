import 'server-only'

import { createRequestRateLimiter } from '@/lib/server/cloudflareRateLimit'

export const checkAnonymousMessageRateLimit = createRequestRateLimiter({
  bindingName: 'ANONYMOUS_MESSAGE_RATE_LIMITER',
  limit: 3,
  prefix: 'anonymous-message',
  serviceUnavailableMessage: 'Message service unavailable',
})
