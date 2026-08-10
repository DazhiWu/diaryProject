import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  answerPrivateKnowledgeQuestion: vi.fn(),
  checkAiRateLimit: vi.fn(),
}))

vi.mock('@/lib/server/aiRateLimit', () => ({
  checkAiRateLimit: mocks.checkAiRateLimit,
}))

vi.mock('@/lib/server/knowledgeAnswer', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/server/knowledgeAnswer')>()
  return {
    ...original,
    answerPrivateKnowledgeQuestion: mocks.answerPrivateKnowledgeQuestion,
  }
})

import { POST as knowledgeAnswer } from '@/app/api/knowledge/answer/route'
import { KnowledgeAnswerProviderError } from '@/lib/server/knowledgeAnswer'
import { KnowledgeEmbeddingUnavailableError } from '@/lib/server/knowledgeSearch'
import { ModelScopeConfigurationError } from '@/lib/server/modelScopeClient'
import { ModelScopeQuotaStopError } from '@/lib/server/modelScopeQuota'
import { createSession } from '@/lib/server/session'

const originalEnv = { ...process.env }

async function request(body: unknown, role?: 'viewer' | 'admin', origin = 'http://localhost') {
  process.env.SESSION_SECRET = 'k'.repeat(32)
  process.env.SESSION_VERSION = '1'
  const cookie = role ? `diary_session=${(await createSession(role)).token}` : undefined
  return new Request('http://localhost/api/knowledge/answer', {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  })
}

afterEach(() => {
  process.env = { ...originalEnv }
  vi.clearAllMocks()
})

describe('knowledge answer route boundary', () => {
  it('denies guests and viewers before rate limiting or retrieval', async () => {
    expect((await knowledgeAnswer(await request({ question: '问题' }))).status).toBe(401)
    expect((await knowledgeAnswer(await request({ question: '问题' }, 'viewer'))).status).toBe(403)
    expect(mocks.checkAiRateLimit).not.toHaveBeenCalled()
    expect(mocks.answerPrivateKnowledgeQuestion).not.toHaveBeenCalled()
  })

  it('rejects an untrusted Origin before downstream work', async () => {
    const response = await knowledgeAnswer(await request({ question: '问题' }, 'admin', 'https://evil.example'))
    expect(response.status).toBe(403)
    expect(mocks.checkAiRateLimit).not.toHaveBeenCalled()
  })

  it.each([
    [{ question: '' }],
    [{ question: 'x'.repeat(501) }],
    [{ question: '问题', startDate: '2026-02-30' }],
    [{ question: '问题', startDate: '2026-07-20', endDate: '2026-07-19' }],
  ])('validates the request before rate limiting: %j', async (body) => {
    const response = await knowledgeAnswer(await request(body, 'admin'))
    expect(response.status).toBe(400)
    expect(mocks.checkAiRateLimit).not.toHaveBeenCalled()
    expect(mocks.answerPrivateKnowledgeQuestion).not.toHaveBeenCalled()
  })

  it('rate-limits before Workers AI, Supabase, quota, or ModelScope orchestration', async () => {
    mocks.checkAiRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 })
    const response = await knowledgeAnswer(await request({ question: '问题' }, 'admin'))

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('60')
    expect(mocks.answerPrivateKnowledgeQuestion).not.toHaveBeenCalled()
  })

  it('passes validated fields to the answer service for an administrator', async () => {
    mocks.checkAiRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 60 })
    mocks.answerPrivateKnowledgeQuestion.mockResolvedValue({
      answer: '回答。[S1]',
      evidenceStatus: 'supported',
      citations: [{ citationId: 'S1', sourceId: 1 }],
      rerankApplied: true,
    })

    const response = await knowledgeAnswer(await request({
      question: '  发生了什么？  ',
      startDate: '2026-07-01',
      endDate: '',
    }, 'admin'))

    expect(response.status).toBe(200)
    expect(mocks.answerPrivateKnowledgeQuestion).toHaveBeenCalledWith({
      question: '发生了什么？',
      startDate: '2026-07-01',
      endDate: undefined,
    })
  })

  it.each([
    [new ModelScopeQuotaStopError(429, 'daily limit'), 429],
    [new ModelScopeQuotaStopError(503, 'quota unavailable'), 503],
  ])('preserves quota stop status without exposing provider calls', async (error, status) => {
    mocks.checkAiRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 60 })
    mocks.answerPrivateKnowledgeQuestion.mockRejectedValue(error)
    const response = await knowledgeAnswer(await request({ question: '问题' }, 'admin'))
    expect(response.status).toBe(status)
  })

  it('returns generic provider and embedding failures', async () => {
    mocks.checkAiRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 60 })

    mocks.answerPrivateKnowledgeQuestion.mockRejectedValueOnce(new KnowledgeEmbeddingUnavailableError())
    const embeddingResponse = await knowledgeAnswer(await request({ question: '问题' }, 'admin'))
    expect(embeddingResponse.status).toBe(503)
    await expect(embeddingResponse.json()).resolves.toEqual({ error: 'Knowledge answer is temporarily unavailable' })

    mocks.answerPrivateKnowledgeQuestion.mockRejectedValueOnce(new KnowledgeAnswerProviderError('timeout'))
    const timeoutResponse = await knowledgeAnswer(await request({ question: '问题' }, 'admin'))
    expect(timeoutResponse.status).toBe(504)
    await expect(timeoutResponse.json()).resolves.toEqual({ error: 'Knowledge answer provider is temporarily unavailable' })

    mocks.answerPrivateKnowledgeQuestion.mockRejectedValueOnce(new KnowledgeAnswerProviderError('invalid-response'))
    const malformedResponse = await knowledgeAnswer(await request({ question: '问题' }, 'admin'))
    expect(malformedResponse.status).toBe(502)
    await expect(malformedResponse.json()).resolves.toEqual({ error: '模型返回结果格式错误' })
  })

  it('reports complete ModelScope model exhaustion', async () => {
    mocks.checkAiRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 60 })
    mocks.answerPrivateKnowledgeQuestion.mockRejectedValueOnce(new KnowledgeAnswerProviderError('all-models-failed'))

    const response = await knowledgeAnswer(await request({ question: '问题' }, 'admin'))

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({ error: '所有模型 API 调用失败' })
  })

  it('reports a missing ModelScope model configuration without claiming API exhaustion', async () => {
    mocks.checkAiRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 60 })
    mocks.answerPrivateKnowledgeQuestion.mockRejectedValueOnce(new ModelScopeConfigurationError())

    const response = await knowledgeAnswer(await request({ question: '问题' }, 'admin'))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'MODELSCOPE_CHAT_MODEL 未配置或没有有效模型',
    })
  })
})
