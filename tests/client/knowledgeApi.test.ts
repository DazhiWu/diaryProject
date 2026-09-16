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

  it('opens a citation through its trusted source diary id', async () => {
    const onOpenDiary = vi.fn().mockResolvedValue(undefined)
    await openKnowledgeCitation({ sourceId: 604 }, onOpenDiary)
    expect(onOpenDiary).toHaveBeenCalledWith(604)
  })
})
