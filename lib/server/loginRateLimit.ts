import 'server-only'

import { getCloudflareContext } from '@opennextjs/cloudflare'

import { isProductionEnvironment } from '@/lib/server/env'
import { HttpError } from '@/lib/server/session'

export type LoginRateLimitDecision = { allowed: boolean; retryAfterSeconds: number }

type RateLimitBinding = {
  limit(input: { key: string }): Promise<{ success: boolean }>
}

type MemoryLoginLimiterOptions = {
  limit: number
  periodSeconds: number
  now?: () => number
}

export function createMemoryLoginLimiter({ limit, periodSeconds, now = Date.now }: MemoryLoginLimiterOptions) {
  const attempts = new Map<string, { count: number; windowStartedAt: number }>()

  return {
    async limit(key: string): Promise<LoginRateLimitDecision> {
      const currentTime = now()
      const current = attempts.get(key)
      const windowDuration = periodSeconds * 1_000
      const active = current && currentTime < current.windowStartedAt + windowDuration
        ? current
        : { count: 0, windowStartedAt: currentTime }

      active.count += 1
      attempts.set(key, active)
      return { allowed: active.count <= limit, retryAfterSeconds: periodSeconds }
    },
  }
}

const localLimiter = createMemoryLoginLimiter({ limit: 5, periodSeconds: 60 })

function localClientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1'
}

async function cloudflareBinding(): Promise<RateLimitBinding | undefined> {
  const { env } = await getCloudflareContext({ async: true })
  const binding = (env as Record<string, unknown>).LOGIN_RATE_LIMITER
  return binding && typeof (binding as RateLimitBinding).limit === 'function'
    ? binding as RateLimitBinding
    : undefined
}

export async function checkLoginRateLimit(
  request: Request,
  options: { binding?: RateLimitBinding; production?: boolean } = {},
): Promise<LoginRateLimitDecision> {
  const production = options.production ?? isProductionEnvironment()

  if (!production) {
    return localLimiter.limit(`auth:${localClientIp(request)}`)
  }

  const clientIp = request.headers.get('cf-connecting-ip')
  if (!clientIp) throw new HttpError(503, 'Login service unavailable')

  let binding = options.binding
  if (!binding) {
    try {
      binding = await cloudflareBinding()
    } catch {
      binding = undefined
    }
  }
  if (!binding) throw new HttpError(503, 'Login service unavailable')

  const result = await binding.limit({ key: `auth:${clientIp}` })
  return { allowed: result.success, retryAfterSeconds: 60 }
}
