import 'server-only'

import { HttpError } from '@/lib/server/session'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'

export const MODELSCOPE_DAILY_CALL_LIMIT = 180

export class ModelScopeQuotaStopError extends HttpError {}

type QuotaReservation = {
  allowed: boolean
  usage_date: string
  used: number
  daily_limit: number
}

type QuotaRpcResult = {
  data: unknown
  error: { code?: string } | null
}

async function reserveThroughSupabase(): Promise<QuotaRpcResult> {
  return (await getSupabaseAdmin()).rpc('reserve_modelscope_api_call')
}

export async function reserveModelScopeApiCall(
  reserve: () => Promise<QuotaRpcResult> = reserveThroughSupabase,
): Promise<{ usageDate: string; used: number; dailyLimit: number }> {
  const { data, error } = await reserve()
  if (error) {
    console.error('[modelscope-quota]', { operation: 'reserve', outcome: 'failed', code: error.code })
    throw new ModelScopeQuotaStopError(503, '无法确认 ModelScope API 剩余额度，已停止调用')
  }

  const reservation = (data as QuotaReservation[] | null)?.[0]
  if (!reservation
    || typeof reservation.allowed !== 'boolean'
    || typeof reservation.usage_date !== 'string'
    || !Number.isSafeInteger(reservation.used)
    || reservation.daily_limit !== MODELSCOPE_DAILY_CALL_LIMIT) {
    console.error('[modelscope-quota]', { operation: 'reserve', outcome: 'invalid-response' })
    throw new ModelScopeQuotaStopError(503, '无法确认 ModelScope API 剩余额度，已停止调用')
  }

  if (!reservation.allowed) {
    throw new ModelScopeQuotaStopError(429, `ModelScope API 今日调用已达 ${reservation.daily_limit} 次安全上限，请明日再试`)
  }

  return {
    usageDate: reservation.usage_date,
    used: reservation.used,
    dailyLimit: reservation.daily_limit,
  }
}
