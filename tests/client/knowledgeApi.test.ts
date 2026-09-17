import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  answerKnowledgeQuestion,
  fetchKnowledgeIndexStatus,
  openKnowledgeCitation,
  searchKnowledge,
} from '@/lib/knowledgeApi'

afterEach(() => vi.restoreAllMocks())

describe('knowledge API client', () => {
  it('bypasses browser caches when refreshing index status', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))
    await fetchKnowledgeIndexStatus()
    expect(fetchMock).toHaveBeenCalledWith('/api/knowledge/index', { cache: 'no-store' })
  })

  it('requests optional server-side diagnostics without accepting a client result count', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      results: [],
      rerankApplied: false,
    }), { status: 200 }))

    await searchKnowledge({ query: '目标', diagnostics: true })

    expect(fetchMock).toHaveBeenCalledWith('/api/knowledge/search', expect.objectContaining({
      body: JSON.stringify({ query: '目标', diagnostics: true }),
    }))
  })

  it('submits factual questions to the separate answer endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      answer: '回答。[S1]',
      evidenceStatus: 'supported',
      citations: [],
      rerankApplied: true,
    }), { status: 200 }))

    await answerKnowledgeQuestion({ question: '问题', startDate: '2026-07-01' })

    expect(fetchMock).toHaveBeenCalledWith('/api/knowledge/answer', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ question: '问题', startDate: '2026-07-01' }),
    }))
  })

  it('keeps a long answer request alive with heartbeats and returns the final result', async () => {
    const result = {
      answer: '回答。[S1]',
      evidenceStatus: 'supported' as const,
      citations: [],
      rerankApplied: true,
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response([
      JSON.stringify({ type: 'started', padding: ' ' }),
      JSON.stringify({ type: 'heartbeat', padding: ' ' }),
      JSON.stringify({ type: 'result', data: result }),
      '',
    ].join('\n'), {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
    }))

    await expect(answerKnowledgeQuestion({ question: '问题' })).resolves.toEqual(result)
  })

  it('reports explicit progress and heartbeat stages without changing the final result', async () => {
    const result = {
      answer: '回答。[S1]',
      evidenceStatus: 'supported' as const,
      citations: [],
      rerankApplied: true,
    }
    const onProgress = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response([
      JSON.stringify({ type: 'progress', data: { phase: 'retrieving', searchCount: 1, maxSearchCount: 5, kind: 'primary' } }),
      JSON.stringify({ type: 'heartbeat', data: { phase: 'generating', model: 'deepseek-ai/model', attempt: 1, totalAttempts: 2 }, padding: ' ' }),
      JSON.stringify({ type: 'heartbeat', data: { phase: 'not-allowed', private: 'ignored' }, padding: ' ' }),
      JSON.stringify({ type: 'result', data: result }),
      '',
    ].join('\n'), {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
    }))

    await expect(answerKnowledgeQuestion({ question: '问题' }, onProgress)).resolves.toEqual(result)
    expect(onProgress.mock.calls.map(([progress]) => progress.phase)).toEqual(['retrieving', 'generating'])
  })

  it('surfaces a safe error from an answer stream', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response([
      JSON.stringify({ type: 'started', padding: ' ' }),
      JSON.stringify({ type: 'error', status: 504, error: '模型请求超时' }),
      '',
    ].join('\n'), {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
    }))

    await expect(answerKnowledgeQuestion({ question: '问题' })).rejects.toThrow('模型请求超时')
  })

  it('opens a citation through its trusted source diary id', async () => {
    const onOpenDiary = vi.fn().mockResolvedValue(undefined)
    await openKnowledgeCitation({ sourceId: 604 }, onOpenDiary)
    expect(onOpenDiary).toHaveBeenCalledWith(604)
  })
})
