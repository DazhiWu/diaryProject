import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchKnowledgeIndexStatus, searchKnowledge } from '@/lib/knowledgeApi'

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
})
