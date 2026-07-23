import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchKnowledgeIndexStatus } from '@/lib/knowledgeApi'

afterEach(() => vi.restoreAllMocks())

describe('knowledge API client', () => {
  it('bypasses browser caches when refreshing index status', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))
    await fetchKnowledgeIndexStatus()
    expect(fetchMock).toHaveBeenCalledWith('/api/knowledge/index', { cache: 'no-store' })
  })
})
