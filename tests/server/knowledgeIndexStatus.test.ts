import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getSupabaseAdmin: vi.fn() }))

vi.mock('@/lib/server/supabaseAdmin', () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }))

import { getKnowledgeIndexStatus } from '@/lib/server/knowledgeIndex'

function queryFor(table: string) {
  let statusFilter: string | undefined
  const query: Record<string, unknown> & PromiseLike<{ count: number; error: null }> = {
    select: () => query,
    eq: (_column: string, value: string) => {
      statusFilter = value
      return query
    },
    not: () => query,
    order: () => query,
    limit: () => query,
    maybeSingle: async () => ({ data: { last_indexed_at: '2026-07-23T02:54:07.000Z' }, error: null }),
    then: (resolve, reject) => {
      const jobCounts: Record<string, number> = { pending: 558, processing: 0, failed: 0, completed: 40 }
      const count = table === 'knowledge_source_settings' ? 598 : table === 'knowledge_chunks' ? 559 : jobCounts[statusFilter ?? ''] ?? 0
      return Promise.resolve({ count, error: null }).then(resolve, reject)
    },
  }
  return query
}

describe('knowledge index status', () => {
  beforeEach(() => {
    mocks.getSupabaseAdmin.mockReset()
    mocks.getSupabaseAdmin.mockResolvedValue({ from: (table: string) => queryFor(table) })
  })

  it('uses currently completed jobs for indexed source progress', async () => {
    await expect(getKnowledgeIndexStatus()).resolves.toMatchObject({
      totalSources: 598,
      indexedSources: 40,
      totalChunks: 559,
      pending: 558,
      processing: 0,
      failed: 0,
      completed: 40,
    })
  })
})
