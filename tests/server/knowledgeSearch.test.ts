import { describe, expect, it } from 'vitest'

import { mergeAndDiversifyKnowledgeResults, type KnowledgeSearchResult } from '@/lib/server/knowledgeSearch'

function result(overrides: Partial<KnowledgeSearchResult> & Pick<KnowledgeSearchResult, 'chunkId' | 'sourceId' | 'chunkIndex' | 'content' | 'charStart' | 'charEnd'>): KnowledgeSearchResult {
  return {
    chunkEndIndex: overrides.chunkIndex,
    sourceDate: '2026-07-23',
    sourceTitle: null,
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
