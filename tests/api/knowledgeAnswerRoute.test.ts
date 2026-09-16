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

import { POST as knowledgeAnswer, streamAnswer } from '@/app/api/knowledge/answer/route'
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

async function streamEvents(response: Response) {
  return (await response.text()).trim().split('\n').map((line) => JSON.parse(line) as {
    type: string
    code?: string
    data?: unknown
    error?: string
    status?: number
  })
}

afterEach(() => {
  vi.useRealTimers()
  process.env = { ...originalEnv }
  vi.clearAllMocks()
})

describe('knowledge answer route boundary', () => {
  it('emits padded heartbeats while a long answer remains pending', async () => {
    vi.useFakeTimers()
    const response = streamAnswer(new Promise<never>(() => undefined))
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()

    const started = JSON.parse(decoder.decode((await reader.read()).value)) as { type: string; padding: string }
    expect(started).toMatchObject({ type: 'started' })
    expect(started.padding.length).toBeGreaterThanOrEqual(1_024)

    const next = reader.read()
    await vi.advanceTimersByTimeAsync(10_000)
    const heartbeat = JSON.parse(decoder.decode((await next).value)) as { type: string; padding: string }
    expect(heartbeat).toMatchObject({ type: 'heartbeat' })
    expect(heartbeat.padding.length).toBeGreaterThanOrEqual(1_024)
    await reader.cancel()
  })

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
    [{ question: '问题', context: 'x'.repeat(2001) }],
    [{ question: '问题', context: { unsafe: true } }],
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
      context: '  面试没有通过  ',
      startDate: '2026-07-01',
      endDate: '',
    }, 'admin'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('application/x-ndjson')
    await expect(streamEvents(response)).resolves.toEqual([
      expect.objectContaining({ type: 'started' }),
      expect.objectContaining({ type: 'result', data: expect.objectContaining({ answer: '回答。[S1]' }) }),
    ])
    expect(mocks.answerPrivateKnowledgeQuestion).toHaveBeenCalledWith({
      question: '发生了什么？',
      context: '面试没有通过',
      startDate: '2026-07-01',
      endDate: undefined,
    })
  })

  it.each([
    [new ModelScopeQuotaStopError(429, 'daily limit'), 429],
    [new ModelScopeQuotaStopError(503, 'quota unavailable'), 503],
  ])('streams quota stops without exposing provider calls', async (error, status) => {
    mocks.checkAiRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 60 })
    mocks.answerPrivateKnowledgeQuestion.mockRejectedValue(error)
    const response = await knowledgeAnswer(await request({ question: '问题' }, 'admin'))
    expect(response.status).toBe(200)
    await expect(streamEvents(response)).resolves.toContainEqual(expect.objectContaining({
      type: 'error', status, error: error.message,
    }))
  })

  it('returns generic provider and embedding failures', async () => {
    mocks.checkAiRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 60 })

    mocks.answerPrivateKnowledgeQuestion.mockRejectedValueOnce(new KnowledgeEmbeddingUnavailableError())
    const embeddingResponse = await knowledgeAnswer(await request({ question: '问题' }, 'admin'))
    expect(embeddingResponse.status).toBe(200)
    await expect(streamEvents(embeddingResponse)).resolves.toContainEqual(expect.objectContaining({
      type: 'error', status: 503, code: 'unknown', error: expect.any(String),
    }))

    mocks.answerPrivateKnowledgeQuestion.mockRejectedValueOnce(new KnowledgeAnswerProviderError('timeout'))
    const timeoutResponse = await knowledgeAnswer(await request({ question: '问题' }, 'admin'))
    expect(timeoutResponse.status).toBe(200)
    await expect(streamEvents(timeoutResponse)).resolves.toContainEqual(expect.objectContaining({
      type: 'error', status: 504, error: 'Knowledge answer provider is temporarily unavailable',
    }))

    mocks.answerPrivateKnowledgeQuestion.mockRejectedValueOnce(new KnowledgeAnswerProviderError('project-error'))
    const projectResponse = await knowledgeAnswer(await request({ question: '问题' }, 'admin'))
    expect(projectResponse.status).toBe(200)
    await expect(streamEvents(projectResponse)).resolves.toContainEqual(expect.objectContaining({
      type: 'error', status: 500, error: '事实问答项目处理异常，请稍后重试',
    }))
  })

  it('returns a classified Access failure with safe user guidance', async () => {
    mocks.checkAiRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 60 })
    mocks.answerPrivateKnowledgeQuestion.mockRejectedValueOnce(new KnowledgeEmbeddingUnavailableError('access'))
    const response = await knowledgeAnswer(await request({ question: '怎么度过低落' }, 'admin'))
    expect(response.status).toBe(200)
    const body = (await streamEvents(response)).find((event) => event.type === 'error')!
    expect(body.status).toBe(503)
    expect(body).toMatchObject({ code: 'access', error: expect.stringContaining('Access') })
    expect(body.error).not.toMatch(/workers\.dev|Bearer|CLIENT_SECRET/u)
  })

  it('reports complete ModelScope model exhaustion', async () => {
    mocks.checkAiRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 60 })
    mocks.answerPrivateKnowledgeQuestion.mockRejectedValueOnce(new KnowledgeAnswerProviderError('all-models-failed'))

    const response = await knowledgeAnswer(await request({ question: '问题' }, 'admin'))

    expect(response.status).toBe(200)
    await expect(streamEvents(response)).resolves.toContainEqual(expect.objectContaining({
      type: 'error', status: 502, error: '所有模型 API 调用失败',
    }))
  })

  it('reports a missing ModelScope model configuration without claiming API exhaustion', async () => {
    mocks.checkAiRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 60 })
    mocks.answerPrivateKnowledgeQuestion.mockRejectedValueOnce(new ModelScopeConfigurationError())

    const response = await knowledgeAnswer(await request({ question: '问题' }, 'admin'))

    expect(response.status).toBe(200)
    await expect(streamEvents(response)).resolves.toContainEqual(expect.objectContaining({
      type: 'error', status: 503, error: 'MODELSCOPE_CHAT_MODEL 未配置或没有有效模型',
    }))
  })
})
