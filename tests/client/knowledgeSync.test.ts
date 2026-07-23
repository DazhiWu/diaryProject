import { describe, expect, it, vi } from 'vitest'

import { runKnowledgeSync } from '@/lib/knowledgeSync'
import type { KnowledgeIndexBatchResult, KnowledgeIndexStatus } from '@/lib/knowledgeApi'

function status(overrides: Partial<KnowledgeIndexStatus> = {}): KnowledgeIndexStatus {
  return {
    totalSources: 10,
    indexedSources: 0,
    totalChunks: 0,
    pending: 10,
    processing: 0,
    failed: 0,
    completed: 0,
    excluded: 0,
    lastIndexedAt: null,
    ...overrides,
  }
}

function batch(batchStatus: KnowledgeIndexStatus, overrides: Partial<KnowledgeIndexBatchResult> = {}): KnowledgeIndexBatchResult {
  return {
    processed: 1,
    failed: 0,
    consecutiveFailures: 0,
    stoppedForConsecutiveFailures: false,
    status: batchStatus,
    ...overrides,
  }
}

describe('knowledge sync lifecycle', () => {
  it('applies batch snapshots and always finishes with a fresh status', async () => {
    const syncBatch = vi.fn()
      .mockResolvedValueOnce(batch(status({ indexedSources: 1, completed: 1, pending: 9 })))
      .mockResolvedValueOnce(batch(status({ indexedSources: 2, completed: 2, pending: 0 })))
    const finalStatus = status({ indexedSources: 2, completed: 2, pending: 0, totalChunks: 4 })
    const refreshStatus = vi.fn().mockResolvedValue(finalStatus)
    const onStatus = vi.fn()

    const summary = await runKnowledgeSync({ syncBatch, refreshStatus, onStatus, waitForNextBatch: async () => undefined })

    expect(summary.status).toBe(finalStatus)
    expect(refreshStatus).toHaveBeenCalledOnce()
    expect(onStatus).toHaveBeenLastCalledWith(finalStatus)
  })

  it('continues beyond the former 50-batch cap until no work remains', async () => {
    const syncBatch = vi.fn(async () => {
      const completed = syncBatch.mock.calls.length
      const pending = completed < 52 ? 1 : 0
      return batch(status({ indexedSources: completed, completed, pending }))
    })
    const summary = await runKnowledgeSync({
      syncBatch,
      refreshStatus: vi.fn().mockResolvedValue(status({ indexedSources: 52, completed: 52, pending: 0 })),
      onStatus: vi.fn(),
      waitForNextBatch: async () => undefined,
    })

    expect(syncBatch).toHaveBeenCalledTimes(52)
    expect(summary).toMatchObject({ processed: 52, status: { pending: 0 } })
  })

  it('refreshes status even when a sync request fails', async () => {
    const syncError = new Error('sync failed')
    const finalStatus = status({ indexedSources: 3, completed: 3, pending: 7 })
    const refreshStatus = vi.fn().mockResolvedValue(finalStatus)
    const onStatus = vi.fn()

    await expect(runKnowledgeSync({
      syncBatch: vi.fn().mockRejectedValue(syncError),
      refreshStatus,
      onStatus,
    })).rejects.toBe(syncError)
    expect(refreshStatus).toHaveBeenCalledOnce()
    expect(onStatus).toHaveBeenLastCalledWith(finalStatus)
  })
})
