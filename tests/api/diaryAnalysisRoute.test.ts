import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  analyzeDiaryWithAI: vi.fn(),
  assertAllowedOrigin: vi.fn(),
  checkAiRateLimit: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  readSession: vi.fn(),
  requireAdmin: vi.fn(),
}))

vi.mock('@/lib/aiAnalysis', () => ({
  analyzeDiaryWithAI: mocks.analyzeDiaryWithAI,
}))

vi.mock('@/lib/server/origin', () => ({
  assertAllowedOrigin: mocks.assertAllowedOrigin,
}))

vi.mock('@/lib/server/aiRateLimit', () => ({
  checkAiRateLimit: mocks.checkAiRateLimit,
}))

vi.mock('@/lib/server/supabaseAdmin', () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}))

vi.mock('@/lib/server/session', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/server/session')>()
  return {
    ...original,
    readSession: mocks.readSession,
    requireAdmin: mocks.requireAdmin,
  }
})

import { POST as analyzeDiary } from '@/app/api/diaries/[id]/analysis/route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.assertAllowedOrigin.mockResolvedValue(undefined)
  mocks.readSession.mockResolvedValue({ role: 'admin' })
  mocks.requireAdmin.mockReturnValue(undefined)
  mocks.checkAiRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 60 })
  mocks.analyzeDiaryWithAI.mockResolvedValue({ summary: '标题', emotion: '平静' })
})

describe('diary analysis route failures', () => {
  it('reports a database persistence failure without retrying a model', async () => {
    const deleteEq = vi.fn().mockResolvedValue({ error: { code: 'database_error' } })
    mocks.getSupabaseAdmin.mockResolvedValue({
      from: vi.fn().mockReturnValue({
        delete: vi.fn().mockReturnValue({ eq: deleteEq }),
      }),
    })
    const request = new Request('http://localhost/api/diaries/709/analysis', {
      method: 'POST',
      headers: { Origin: 'http://localhost', 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '日记正文' }),
    })

    const response = await analyzeDiary(request, { params: Promise.resolve({ id: '709' }) })

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'AI分析结果保存失败，请稍后重试',
    })
    expect(mocks.analyzeDiaryWithAI).toHaveBeenCalledOnce()
  })

  it('reports a database-client failure without exposing its internal message', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.getSupabaseAdmin.mockRejectedValue(new Error('private database detail'))
    const request = new Request('http://localhost/api/diaries/709/analysis', {
      method: 'POST',
      headers: { Origin: 'http://localhost', 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '日记正文' }),
    })

    const response = await analyzeDiary(request, { params: Promise.resolve({ id: '709' }) })

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'AI分析结果保存失败，请稍后重试',
    })
    expect(mocks.analyzeDiaryWithAI).toHaveBeenCalledOnce()
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('private database detail')
  })
})
