import 'server-only'

import { getCloudflareContext } from '@opennextjs/cloudflare'

import { isProductionEnvironment } from '@/lib/server/env'
import { HttpError } from '@/lib/server/session'

export type RateLimitDecision = { allowed: boolean; retryAfterSeconds: number }

type MemoryRateLimiterOptions = {
  limit: number
  periodSeconds: number
  now?: () => number
}

export function createMemoryRateLimiter({ limit, periodSeconds, now = Date.now }: MemoryRateLimiterOptions) {
  const attempts = new Map<string, { count: number; windowStartedAt: number }>()
  return {
    async limit(key: string): Promise<RateLimitDecision> {
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

export type RateLimitBinding = {
  limit(input: { key: string }): Promise<{ success: boolean }>
}

type RateLimitOptions = {
  binding?: RateLimitBinding
  production?: boolean
}

export function createRequestRateLimiter(configuration: {
  bindingName: string
  limit: number
  prefix: string
  serviceUnavailableMessage: string
}) {
  const localLimiter = createMemoryRateLimiter({ limit: configuration.limit, periodSeconds: 60 })

  return async (request: Request, options: RateLimitOptions = {}): Promise<RateLimitDecision> => {
    const production = options.production ?? isProductionEnvironment()
    const clientIp = production
      ? request.headers.get('cf-connecting-ip')
      : request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1'
    if (!clientIp) throw new HttpError(503, configuration.serviceUnavailableMessage)
    if (!production) return localLimiter.limit(`${configuration.prefix}:${clientIp}`)

    let binding = options.binding
    if (!binding) {
      try {
        const { env } = await getCloudflareContext({ async: true })
        const candidate = (env as Record<string, unknown>)[configuration.bindingName]
        if (candidate && typeof (candidate as RateLimitBinding).limit === 'function') binding = candidate as RateLimitBinding
      } catch {
        binding = undefined
      }
    }
    if (!binding) throw new HttpError(503, configuration.serviceUnavailableMessage)

    const result = await binding.limit({ key: `${configuration.prefix}:${clientIp}` })
    return { allowed: result.success, retryAfterSeconds: 60 }
  }
}
