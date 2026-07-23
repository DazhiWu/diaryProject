import { describe, expect, it, vi } from 'vitest'

import {
  KnowledgeEmbeddingUnavailableError,
  mergeAndDiversifyKnowledgeResults,
  searchPrivateKnowledge,
  VECTOR_CANDIDATE_COUNT,
  type KnowledgeSearchResult,
} from '@/lib/server/knowledgeSearch'

function result(overrides: Partial<KnowledgeSearchResult> & Pick<KnowledgeSearchResult, 'chunkId' | 'sourceId' | 'chunkIndex' | 'content' | 'charStart' | 'charEnd'>): KnowledgeSearchResult {
  return {
    chunkEndIndex: overrides.chunkIndex,
    sourceDate: '2026-07-23',
    sourceTitle: null,
    similarity: 0.8,
    score: 0.1,
    vectorSimilarity: 0.8,
    rerankScore: 0.7,
    ...overrides,
  }
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    chunk_id: 1,
    source_id: 1,
    chunk_index: 0,
    source_date: '2026-07-23',
    source_title: null,
    content: '候选正文',
    char_start: 0,
    char_end: 4,
    similarity: 0.8,
    score: 0.1,
    ...overrides,
  }
}

describe('knowledge search result shaping', () => {
  it('merges adjacent chunks and removes overlapped text', () => {
    const results = mergeAndDiversifyKnowledgeResults([
      result({ chunkId: 11, sourceId: 1, chunkIndex: 1, content: '第一部分。重叠句。', charStart: 0, charEnd: 9 }),
      result({ chunkId: 12, sourceId: 1, chunkIndex: 2, content: '重叠句。第二部分。', charStart: 5, charEnd: 14, similarity: 0.9 }),
    ], 10)

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ sourceId: 1, chunkIndex: 1, chunkEndIndex: 2, charStart: 0, charEnd: 14, similarity: 0.9 })
    expect(results[0]!.content).toBe('第一部分。重叠句。第二部分。')
  })

  it('keeps ranking order while limiting each diary to two results', () => {
    const results = mergeAndDiversifyKnowledgeResults([
      result({ chunkId: 1, sourceId: 1, chunkIndex: 0, content: '一', charStart: 0, charEnd: 1 }),
      result({ chunkId: 2, sourceId: 1, chunkIndex: 2, content: '二', charStart: 20, charEnd: 21 }),
      result({ chunkId: 3, sourceId: 1, chunkIndex: 4, content: '三', charStart: 40, charEnd: 41 }),
      result({ chunkId: 4, sourceId: 2, chunkIndex: 0, content: '四', charStart: 0, charEnd: 1 }),
    ], 10)

    expect(results.map((item) => item.chunkId)).toEqual([1, 2, 4])
  })
})

describe('knowledge search Workers AI pipeline', () => {
  it('passes a normalized 1024-dimensional query vector to the existing RPC and reranks candidates', async () => {
    const queryEmbedding = Array.from({ length: 1024 }, (_, index) => index === 0 ? 1 : 0)
    const searchCandidates = vi.fn().mockResolvedValue({
      data: [row(), row({ chunk_id: 2, source_id: 2, similarity: 0.7 })],
      error: null,
    })
    const rerank = vi.fn().mockImplementation(async (_query, candidates) => [{
      ...candidates[1],
      candidateIndex: 1,
      vectorSimilarity: candidates[1].similarity,
      rerankScore: 0.95,
    }])

    const response = await searchPrivateKnowledge({ query: '目标' }, {
      embedQuery: vi.fn().mockResolvedValue(queryEmbedding),
      searchCandidates,
      rerank,
    })

    expect(searchCandidates).toHaveBeenCalledWith(expect.objectContaining({
      candidateCount: VECTOR_CANDIDATE_COUNT,
      queryEmbedding,
      queryText: '目标',
    }))
    expect(rerank).toHaveBeenCalledWith('目标', expect.any(Array), 5)
    expect(response).toEqual({
      rerankApplied: true,
      results: [expect.objectContaining({ chunkId: 2, vectorSimilarity: 0.7, rerankScore: 0.95 })],
    })
  })

  it('returns all three diagnostic stages without exposing the query embedding', async () => {
    const queryEmbedding = Array.from({ length: 1024 }, (_, index) => index === 0 ? 1 : 0)
    const rerank = vi.fn().mockImplementation(async (_query, candidates) => [{
      ...candidates[1],
      candidateIndex: 1,
      vectorSimilarity: candidates[1].similarity,
      rerankScore: 0.95,
    }])

    const response = await searchPrivateKnowledge({ query: '目标', diagnostics: true }, {
      embedQuery: vi.fn().mockResolvedValue(queryEmbedding),
      searchCandidates: vi.fn().mockResolvedValue({
        data: [
          row({ chunk_id: 1, source_id: 1, chunk_index: 3, content: '第一候选', similarity: 0.8, score: 0.31 }),
          row({ chunk_id: 2, source_id: 2, chunk_index: 7, content: '第二候选', similarity: 0.7, score: 0.29 }),
        ],
        error: null,
      }),
      rerank,
    })

    expect(response.diagnostics).toEqual({
      candidates: [
        expect.objectContaining({
          fusionRank: 1,
          chunkIndex: 3,
          content: '第一候选',
          vectorSimilarity: 0.8,
          rpcScore: 0.31,
        }),
        expect.objectContaining({
          fusionRank: 2,
          chunkIndex: 7,
          content: '第二候选',
          vectorSimilarity: 0.7,
          rpcScore: 0.29,
        }),
      ],
      reranked: [
        expect.objectContaining({
          rerankRank: 1,
          candidateRank: 2,
          chunkIndex: 7,
          content: '第二候选',
          rerankScore: 0.95,
        }),
      ],
    })
    expect(response.results).toEqual([
      expect.objectContaining({ chunkId: 2, content: '第二候选', rerankScore: 0.95 }),
    ])
    expect(JSON.stringify(response)).not.toContain(queryEmbedding.join(','))
  })

  it('falls back to vector-similarity order when reranking fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = await searchPrivateKnowledge({ query: '目标' }, {
      embedQuery: vi.fn().mockResolvedValue(Array.from({ length: 1024 }, () => 0.03125)),
      searchCandidates: vi.fn().mockResolvedValue({
        data: [
          row({ chunk_id: 1, source_id: 1, similarity: 0.4 }),
          row({ chunk_id: 2, source_id: 2, similarity: 0.9 }),
        ],
        error: null,
      }),
      rerank: vi.fn().mockRejectedValue(new Error('internal provider detail')),
    })

    expect(response.rerankApplied).toBe(false)
    expect(response.results.map((item) => item.chunkId)).toEqual([2, 1])
    expect(response.results.every((item) => item.rerankScore === null)).toBe(true)
    expect(consoleError).toHaveBeenCalledWith('[knowledge-search]', expect.objectContaining({
      operation: 'reranker',
      outcome: 'fallback',
    }))
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('internal provider detail')
    consoleError.mockRestore()
  })

  it('keeps candidate diagnostics and leaves the raw reranker stage empty on fallback', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = await searchPrivateKnowledge({ query: '目标', diagnostics: true }, {
      embedQuery: vi.fn().mockResolvedValue(Array.from({ length: 1024 }, () => 0.03125)),
      searchCandidates: vi.fn().mockResolvedValue({
        data: [row({ chunk_id: 1, source_id: 1, content: '召回正文', similarity: 0.4, score: 0.2 })],
        error: null,
      }),
      rerank: vi.fn().mockRejectedValue(new Error('internal provider detail')),
    })

    expect(response).toMatchObject({
      rerankApplied: false,
      diagnostics: {
        candidates: [expect.objectContaining({ fusionRank: 1, content: '召回正文' })],
        reranked: [],
      },
      results: [expect.objectContaining({ chunkId: 1, rerankScore: null })],
    })
    consoleError.mockRestore()
  })

  it('does not invoke the reranker when the RPC returns no candidates', async () => {
    const rerank = vi.fn()
    const response = await searchPrivateKnowledge({ query: '目标', diagnostics: true }, {
      embedQuery: vi.fn().mockResolvedValue(Array.from({ length: 1024 }, () => 0.03125)),
      searchCandidates: vi.fn().mockResolvedValue({ data: [], error: null }),
      rerank,
    })

    expect(response).toEqual({
      results: [],
      rerankApplied: false,
      diagnostics: { candidates: [], reranked: [] },
    })
    expect(rerank).not.toHaveBeenCalled()
  })

  it('turns embedding failures into a service-unavailable error without logging provider detail', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(searchPrivateKnowledge({ query: '目标' }, {
      embedQuery: vi.fn().mockRejectedValue(new Error('internal provider detail')),
      searchCandidates: vi.fn(),
      rerank: vi.fn(),
    })).rejects.toBeInstanceOf(KnowledgeEmbeddingUnavailableError)

    expect(consoleError).toHaveBeenCalledWith('[knowledge-search]', expect.objectContaining({
      operation: 'embedding',
      outcome: 'failed',
    }))
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('internal provider detail')
    consoleError.mockRestore()
  })
})
