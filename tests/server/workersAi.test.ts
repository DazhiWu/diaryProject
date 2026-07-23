import { describe, expect, it, vi } from 'vitest'

import {
  createWorkersAiClient,
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
  KNOWLEDGE_QUERY_INSTRUCTION,
  normalizeVector,
  type KnowledgeCandidate,
} from '@/lib/server/workersAi'

function embedding(value: number): number[] {
  return Array.from({ length: KNOWLEDGE_EMBEDDING_DIMENSIONS }, () => value)
}

function candidate(id: number, overrides: Partial<KnowledgeCandidate> = {}): KnowledgeCandidate {
  return {
    chunkId: id,
    sourceId: id,
    chunkIndex: id,
    chunkEndIndex: id,
    sourceDate: '2026-07-22',
    sourceTitle: '今天完成了模型部署',
    content: `正文 ${id}`,
    charStart: id * 10,
    charEnd: id * 10 + 4,
    similarity: 0.9 - id / 10,
    score: 0.1,
    ...overrides,
  }
}

function client(outputs: { embedding?: unknown; reranker?: unknown }) {
  const runEmbedding = vi.fn().mockResolvedValue(outputs.embedding)
  const runReranker = vi.fn().mockResolvedValue(outputs.reranker)
  return {
    client: createWorkersAiClient({ runEmbedding, runReranker }),
    runEmbedding,
    runReranker,
  }
}

describe('Workers AI knowledge embedding', () => {
  it('parses and normalizes a 1024-dimensional query embedding', async () => {
    const source = embedding(2)
    const { client: workersAi, runEmbedding } = client({ embedding: { data: [source], shape: [1, 1024] } })

    const result = await workersAi.embedKnowledgeQuery('部署是什么时候完成的？')

    expect(runEmbedding).toHaveBeenCalledWith('部署是什么时候完成的？')
    expect(result).toHaveLength(KNOWLEDGE_EMBEDDING_DIMENSIONS)
    expect(Math.hypot(...result)).toBeCloseTo(1, 12)
    expect(result[0]).toBeCloseTo(1 / Math.sqrt(KNOWLEDGE_EMBEDDING_DIMENSIONS), 12)
    expect(KNOWLEDGE_QUERY_INSTRUCTION).toContain('personal diary search query')
  })

  it('normalizes finite vectors without mutating the source', () => {
    const source = embedding(3)
    const result = normalizeVector(source)

    expect(source[0]).toBe(3)
    expect(result).not.toBe(source)
    expect(Math.hypot(...result)).toBeCloseTo(1, 12)
  })

  it('rejects invalid dimensions', () => {
    expect(() => normalizeVector([1, 2, 3])).toThrow('unexpected shape')
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite values: %s',
    (invalid) => {
      const source = embedding(1)
      source[17] = invalid
      expect(() => normalizeVector(source)).toThrow('unexpected shape')
    },
  )

  it('rejects zero vectors', () => {
    expect(() => normalizeVector(embedding(0))).toThrow('zero magnitude')
  })
})

describe('Workers AI knowledge reranker', () => {
  it('maps ids to stable candidate positions and preserves model order', async () => {
    const candidates = [candidate(10), candidate(20)]
    const { client: workersAi, runReranker } = client({
      reranker: { response: [{ id: 1, score: 0.97 }, { id: 0, score: 0.81 }] },
    })

    const result = await workersAi.rerankKnowledgeCandidates('模型部署', candidates, 2)

    expect(result.map((item) => item.chunkId)).toEqual([20, 10])
    expect(result[0]).toMatchObject({ candidateIndex: 1, vectorSimilarity: candidates[1]!.similarity, rerankScore: 0.97 })
    expect(result[1]).toMatchObject({ candidateIndex: 0, vectorSimilarity: candidates[0]!.similarity, rerankScore: 0.81 })
    expect(runReranker).toHaveBeenCalledWith('模型部署', [
      { text: '日期：2026-07-22\n标题：今天完成了模型部署\n正文：正文 10' },
      { text: '日期：2026-07-22\n标题：今天完成了模型部署\n正文：正文 20' },
    ], 2)
  })

  it('ignores invalid and duplicate ids without reading an invalid candidate', async () => {
    const candidates = [candidate(1), candidate(2)]
    const { client: workersAi } = client({
      reranker: {
        response: [
          { id: -1, score: 1 },
          { id: 99, score: 1 },
          { id: 1.5, score: 1 },
          { id: 1, score: 0.8 },
          { id: 1, score: 0.7 },
          { id: 0, score: Number.NaN },
        ],
      },
    })

    await expect(workersAi.rerankKnowledgeCandidates('查询', candidates, 2)).resolves.toEqual([
      expect.objectContaining({ chunkId: 2, candidateIndex: 1, rerankScore: 0.8 }),
    ])
  })

  it('treats an all-invalid reranker response as a controlled failure', async () => {
    const { client: workersAi } = client({ reranker: { response: [{ id: 8, score: 1 }] } })
    await expect(workersAi.rerankKnowledgeCandidates('查询', [candidate(1)], 1)).rejects.toThrow('no valid results')
  })

  it('does not invoke Workers AI when candidates are empty', async () => {
    const { client: workersAi, runReranker } = client({ reranker: { response: [] } })
    await expect(workersAi.rerankKnowledgeCandidates('查询', [], 5)).resolves.toEqual([])
    expect(runReranker).not.toHaveBeenCalled()
  })
})
