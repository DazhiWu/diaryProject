import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  checkAiRateLimit: vi.fn(),
  searchPrivateKnowledge: vi.fn(),
}))

vi.mock('@/lib/server/aiRateLimit', () => ({
  checkAiRateLimit: mocks.checkAiRateLimit,
}))

vi.mock('@/lib/server/knowledgeSearch', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/server/knowledgeSearch')>()
  return {
    ...original,
    searchPrivateKnowledge: mocks.searchPrivateKnowledge,
  }
})

import { POST as knowledgeSearch } from '@/app/api/knowledge/search/route'
import { KnowledgeEmbeddingUnavailableError } from '@/lib/server/knowledgeSearch'
import { createSession } from '@/lib/server/session'

const originalEnv = { ...process.env }

async function adminRequest(body: unknown) {
  process.env.SESSION_SECRET = 'k'.repeat(32)
  process.env.SESSION_VERSION = '1'
  const admin = await createSession('admin')
  return new Request('http://localhost/api/knowledge/search', {
    method: 'POST',
    headers: {
      Origin: 'http://localhost',
      'Content-Type': 'application/json',
      Cookie: `diary_session=${admin.token}`,
    },
    body: JSON.stringify(body),
  })
}

afterEach(() => {
  process.env = { ...originalEnv }
  vi.clearAllMocks()
})

describe('knowledge search route Workers AI behavior', () => {
  it('continues to require an administrator session', async () => {
    const response = await knowledgeSearch(new Request('http://localhost/api/knowledge/search', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: '目标', diagnostics: true }),
    }))

    expect(response.status).toBe(401)
    expect(mocks.checkAiRateLimit).not.toHaveBeenCalled()
    expect(mocks.searchPrivateKnowledge).not.toHaveBeenCalled()
  })

  it('passes the explicit diagnostic flag to the existing search service', async () => {
    mocks.checkAiRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 60 })
    mocks.searchPrivateKnowledge.mockResolvedValue({
      rerankApplied: true,
      results: [],
      diagnostics: { candidates: [], reranked: [] },
    })

    const response = await knowledgeSearch(await adminRequest({ query: '目标', diagnostics: true }))

    expect(response.status).toBe(200)
    expect(mocks.searchPrivateKnowledge).toHaveBeenCalledWith({
      query: '目标',
      startDate: undefined,
      endDate: undefined,
      diagnostics: true,
    })
  })

  it('rejects a non-boolean diagnostic flag before rate limiting', async () => {
    const response = await knowledgeSearch(await adminRequest({ query: '目标', diagnostics: 'true' }))

    expect(response.status).toBe(400)
    expect(mocks.checkAiRateLimit).not.toHaveBeenCalled()
    expect(mocks.searchPrivateKnowledge).not.toHaveBeenCalled()
  })

  it('continues to enforce AI rate limiting before embedding', async () => {
    mocks.checkAiRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 })

    const response = await knowledgeSearch(await adminRequest({ query: '目标' }))

    expect(response.status).toBe(429)
    expect(mocks.checkAiRateLimit).toHaveBeenCalledOnce()
    expect(mocks.searchPrivateKnowledge).not.toHaveBeenCalled()
  })

  it('returns a generic 503 when query embedding fails', async () => {
    mocks.checkAiRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 60 })
    mocks.searchPrivateKnowledge.mockRejectedValue(new KnowledgeEmbeddingUnavailableError())

    const response = await knowledgeSearch(await adminRequest({ query: '目标' }))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ error: 'Knowledge search is temporarily unavailable' })
  })

  it('returns vector results when the service reports reranker fallback', async () => {
    mocks.checkAiRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 60 })
    mocks.searchPrivateKnowledge.mockResolvedValue({
      rerankApplied: false,
      results: [{ chunkId: 1, vectorSimilarity: 0.8, rerankScore: null }],
    })

    const response = await knowledgeSearch(await adminRequest({ query: '目标' }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      rerankApplied: false,
      results: [{ chunkId: 1, vectorSimilarity: 0.8, rerankScore: null }],
    })
  })
})
