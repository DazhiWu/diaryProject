import { describe, expect, it, vi } from 'vitest'

import {
  MODELSCOPE_DAILY_CALL_LIMIT,
  reserveModelScopeApiCall,
} from '@/lib/server/modelScopeQuota'

describe('ModelScope daily quota', () => {
  it('accepts a valid reservation through the 180th call', async () => {
    const reserve = vi.fn(async () => ({
      data: [{ allowed: true, usage_date: '2026-07-20', used: 180, daily_limit: MODELSCOPE_DAILY_CALL_LIMIT }],
      error: null,
    }))

    await expect(reserveModelScopeApiCall(reserve)).resolves.toEqual({
      usageDate: '2026-07-20',
      used: 180,
      dailyLimit: 180,
    })
    expect(reserve).toHaveBeenCalledOnce()
  })

  it('returns a clear 429 without allowing a 181st call', async () => {
    const reserve = vi.fn(async () => ({
      data: [{ allowed: false, usage_date: '2026-07-20', used: 180, daily_limit: MODELSCOPE_DAILY_CALL_LIMIT }],
      error: null,
    }))

    await expect(reserveModelScopeApiCall(reserve)).rejects.toMatchObject({
      status: 429,
      message: 'ModelScope API 今日调用已达 180 次安全上限，请明日再试',
    })
  })

  it('fails closed when the shared counter cannot be verified', async () => {
    const reserve = vi.fn(async () => ({ data: null, error: { code: 'PGRST202' } }))

    await expect(reserveModelScopeApiCall(reserve)).rejects.toMatchObject({
      status: 503,
      message: '无法确认 ModelScope API 剩余额度，已停止调用',
    })
  })
})
