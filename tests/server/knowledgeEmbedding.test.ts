import { afterEach, describe, expect, it, vi } from 'vitest'

import { embedKnowledgeTexts, KNOWLEDGE_EMBEDDING_DIMENSIONS } from '@/lib/server/knowledgeEmbedding'

afterEach(() => vi.restoreAllMocks())

function embedding(value: number): number[] {
  return Array.from({ length: KNOWLEDGE_EMBEDDING_DIMENSIONS }, () => value)
}

describe('local knowledge embeddings', () => {
  it('uses query input type for search requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      model: 'Qwen/Qwen3-Embedding-0.6B',
      device: 'cuda',
      dimensions: 1024,
      count: 1,
      embeddings: [embedding(0.5)],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await expect(embedKnowledgeTexts(['搜索内容'], 'query')).resolves.toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/embeddings', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ texts: ['搜索内容'], input_type: 'query', batch_size: 16 }),
    }))
  })

  it('batches document requests and validates response counts', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        model: 'Qwen/Qwen3-Embedding-0.6B', dimensions: 1024, count: 16, embeddings: Array.from({ length: 16 }, () => embedding(0.1)),
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        model: 'Qwen/Qwen3-Embedding-0.6B', dimensions: 1024, count: 1, embeddings: [embedding(0.2)],
      }), { status: 200 }))

    await expect(embedKnowledgeTexts(Array.from({ length: 17 }, (_, index) => `文本 ${index}`), 'document')).resolves.toHaveLength(17)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ input_type: 'document', batch_size: 16 })
  })

  it('rejects dimension mismatches', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      model: 'Qwen/Qwen3-Embedding-0.6B', dimensions: 3, count: 1, embeddings: [[1, 2, 3]],
    }), { status: 200 }))

    await expect(embedKnowledgeTexts(['文本'], 'document')).rejects.toThrow('Embedding response has an unexpected shape')
  })
})
