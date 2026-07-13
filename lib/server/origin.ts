import 'server-only'

import { isProductionEnvironment, requireServerEnv } from '@/lib/server/env'
import { HttpError } from '@/lib/server/session'

export async function assertAllowedOrigin(request: Request): Promise<void> {
  const origin = request.headers.get('origin')
  if (!origin) throw new HttpError(403, 'Forbidden')

  if (isProductionEnvironment()) {
    if (origin !== await requireServerEnv('APP_ORIGIN')) throw new HttpError(403, 'Forbidden')
    return
  }

  try {
    const url = new URL(origin)
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return
  } catch {
    // Reject malformed origins below.
  }
  throw new HttpError(403, 'Forbidden')
}
