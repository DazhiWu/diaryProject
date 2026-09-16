import { describe, expect, it, vi } from 'vitest'
import { buildRecallPlan } from '@/lib/knowledgeRecall'
import { retrieveRecallEvidence } from '@/lib/server/knowledgeRecall'
import { KnowledgeEmbeddingUnavailableError, type KnowledgeSearchResult } from '@/lib/server/knowledgeSearch'

const now = new Date('2026-09-15T04:00:00Z')
function result(sourceId: number, sourceDate = '2026-01-10', extra: Partial<KnowledgeSearchResult> = {}): KnowledgeSearchResult {
  return { sourceId, sourceDate, chunkId: sourceId, sourceTitle: null, chunkIndex: 0, chunkEndIndex: 0,
    charStart: 0, charEnd: 10, content: '当时很难过，后来与朋友交谈。', similarity: .8, score: .8,
    vectorSimilarity: .8, rerankScore: .8, ...extra }
}

describe('ephemeral recall planning', () => {
  it('searches all indexed history for past coping and never creates a theme', () => {
    expect(buildRecallPlan({ question: '我以前怎么度过低落的时候？' }, now)).toMatchObject({
      startDate: undefined, endDate: undefined, mode: 'coping', queries: expect.any(Array),
    })
  })
  it.each([
    ['去年发生了什么', '2025-01-01', '2025-12-31'],
    ['2024年2月的经历', '2024-02-01', '2024-02-29'],
    ['从2025-12-30到2026-01-02', '2025-12-30', '2026-01-02'],
    ['最近状态怎么样', '2026-08-17', '2026-09-15'],
    ['最近三个月工作怎么样', '2026-06-18', '2026-09-15'],
  ])('resolves visible date scope for %s', (question, startDate, endDate) => {
    expect(buildRecallPlan({ question }, now)).toMatchObject({ startDate, endDate })
  })
  it('honors explicit form bounds ahead of text and preserves a partial bound', () => {
    expect(buildRecallPlan({ question: '去年', startDate: '2026-01-01' }, now)).toMatchObject({
      startDate: '2026-01-01', endDate: undefined,
    })
  })
  it('asks for an unspecified current experience without querying', async () => {
    const search = vi.fn()
    const response = await retrieveRecallEvidence({ question: '这件事情让我想起以前的哪些经历？' }, search)
    expect(response.clarification).toBeTruthy()
    expect(search).not.toHaveBeenCalled()
    expect(buildRecallPlan({ question: '这件事情让我想起以前的哪些经历？', context: '准备很久的面试没有通过' }).clarification).toBeUndefined()
  })
})

describe('bounded recall retrieval', () => {
  it('finds follow-up evidence, deduplicates overlapping excerpts, and obeys user dates', async () => {
    const search = vi.fn(async (input: { query: string; startDate?: string; endDate?: string }) => ({
      results: input.startDate === '2026-01-11'
        ? [result(2, '2026-01-12'), result(99, '2026-01-20')]
        : [result(1), result(1, '2026-01-10', { charStart: 5, charEnd: 15 })],
      rerankApplied: true,
    }))
    const response = await retrieveRecallEvidence({ question: '怎么度过低落', startDate: '2026-01-01', endDate: '2026-01-13' }, search)
    expect(search).toHaveBeenCalledTimes(4)
    expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ startDate: '2026-01-11', endDate: '2026-01-13' }))
    expect(response.results.map((item) => item.sourceId)).toEqual([1, 2])
    expect(response.trace).toMatchObject({ readDiaryCount: 2, readExcerptCount: 2, followupDays: 7 })
  })
  it('limits searches, payload, and sources while retaining multiple query directions', async () => {
    let id = 0
    const search = vi.fn(async () => ({ results: Array.from({ length: 5 }, () => result(++id, '2026-01-10')), rerankApplied: true }))
    const response = await retrieveRecallEvidence({ question: '怎么缓解压力' }, search)
    expect(search.mock.calls.length).toBeLessThanOrEqual(5)
    expect(response.results.length).toBeLessThanOrEqual(8)
    expect(response.results.slice(0, 3).map((item) => item.sourceId)).toEqual([1, 6, 11])
    expect(response.results.reduce((total, item) => total + item.content.length, 0)).toBeLessThanOrEqual(12000)
  })
  it('reports reranking failure and never disguises a search error as insufficient evidence', async () => {
    const fallback = await retrieveRecallEvidence({ question: '过去的事' }, vi.fn().mockResolvedValue({ results: [result(1)], rerankApplied: false }))
    expect(fallback.rerankApplied).toBe(false)
    await expect(retrieveRecallEvidence({ question: '过去的事' }, vi.fn().mockRejectedValue(new Error('failed')))).rejects.toThrow('failed')
  })
})

describe('recall upstream failure isolation', () => {
  it('stops after primary failure instead of starting three competing calls', async () => {
    const search = vi.fn().mockRejectedValue(new KnowledgeEmbeddingUnavailableError('access'))
    await expect(retrieveRecallEvidence({ question: '我以前怎么度过低落的时刻？' }, search)).rejects.toMatchObject({ reason: 'access' })
    expect(search).toHaveBeenCalledOnce()
  })
  it('retains evidence and stops supplemental searches on a transient failure', async () => {
    const search = vi.fn().mockResolvedValueOnce({ results: [result(1)], rerankApplied: true })
      .mockRejectedValue(new KnowledgeEmbeddingUnavailableError('timeout'))
    const response = await retrieveRecallEvidence({ question: '我以前怎么度过低落的时刻？' }, search)
    expect(response.results.map((item) => item.sourceId)).toEqual([1])
    expect(response.trace).toMatchObject({ partial: true, searchCount: 2, followupDays: 0 })
    expect(search).toHaveBeenCalledTimes(2)
  })
  it.each(['access', 'auth', 'unknown'] as const)('never hides terminal %s failure behind a partial answer', async (reason) => {
    const search = vi.fn().mockResolvedValueOnce({ results: [result(1)], rerankApplied: true })
      .mockRejectedValue(new KnowledgeEmbeddingUnavailableError(reason))
    await expect(retrieveRecallEvidence({ question: '怎么度过低落' }, search)).rejects.toMatchObject({ reason })
  })
  it('does not report insufficient evidence when supplementary retrieval failed without any evidence', async () => {
    const search = vi.fn().mockResolvedValueOnce({ results: [], rerankApplied: false })
      .mockRejectedValue(new KnowledgeEmbeddingUnavailableError('network'))
    await expect(retrieveRecallEvidence({ question: '怎么度过低落' }, search)).rejects.toMatchObject({ reason: 'network' })
  })
})
