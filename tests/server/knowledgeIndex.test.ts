import { afterEach, describe, expect, it, vi } from 'vitest'

import { knowledgeSourceText, sha256Hex } from '@/lib/server/knowledgeChunks'
import {
  processKnowledgeIndexBatch,
  type KnowledgeIndexStatus,
} from '@/lib/server/knowledgeIndex'

type Diary = {
  id: number
  date: string
  subtitle: string | null
  content: string | null
}

type Setting = {
  source_id: number
  usage_scope: 'private' | 'excluded'
  indexed_content_hash: string | null
  indexed_model: string | null
}

type JobUpdate = {
  values: Record<string, unknown>
  filter: 'eq' | 'in'
  sourceIds: number[]
}

function status(overrides: Partial<KnowledgeIndexStatus> = {}): KnowledgeIndexStatus {
  return {
    executionMode: 'local',
    totalSources: 3,
    indexedSources: 0,
    totalChunks: 0,
    pending: 3,
    processing: 0,
    failed: 0,
    completed: 0,
    excluded: 0,
    lastIndexedAt: null,
    ...overrides,
  }
}

function diary(id: number): Diary {
  return {
    id,
    date: '2026-07-29',
    subtitle: `日记 ${id}`,
    content: `第 ${id} 篇日记。${'正文内容。'.repeat(90)}`,
  }
}

function setting(sourceId: number, overrides: Partial<Setting> = {}): Setting {
  return {
    source_id: sourceId,
    usage_scope: 'private',
    indexed_content_hash: null,
    indexed_model: null,
    ...overrides,
  }
}

function createSupabaseFixture(input: {
  claimed: number[]
  diaries?: Diary[]
  settings?: Setting[]
  existingChunkSourceIds?: number[]
}) {
  const jobUpdates: JobUpdate[] = []
  const replacements: Record<string, unknown>[] = []
  const diaries = input.diaries ?? input.claimed.map(diary)
  const settings = input.settings ?? input.claimed.map((sourceId) => setting(sourceId))
  const existingChunks = (input.existingChunkSourceIds ?? []).map((sourceId) => ({ source_id: sourceId }))

  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === 'claim_knowledge_index_jobs') {
      return { data: input.claimed.map((sourceId) => ({ source_id: sourceId })), error: null }
    }
    if (name === 'replace_diary_knowledge_chunks') {
      replacements.push(args)
      return { data: null, error: null }
    }
    throw new Error(`Unexpected RPC: ${name}`)
  })

  const from = vi.fn((table: string) => {
    if (table === 'diaryContent' || table === 'knowledge_source_settings' || table === 'knowledge_chunks') {
      const rows = table === 'diaryContent' ? diaries : table === 'knowledge_source_settings' ? settings : existingChunks
      return {
        select: () => ({
          in: async () => ({ data: rows, error: null }),
        }),
      }
    }
    if (table === 'knowledge_index_jobs') {
      return {
        update: (values: Record<string, unknown>) => ({
          eq: async (_column: string, sourceId: number) => {
            jobUpdates.push({ values, filter: 'eq', sourceIds: [sourceId] })
            return { error: null }
          },
          in: async (_column: string, sourceIds: number[]) => {
            jobUpdates.push({ values, filter: 'in', sourceIds })
            return { error: null }
          },
        }),
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })

  return {
    client: { rpc, from },
    jobUpdates,
    replacements,
    rpc,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('knowledge index batch state machine', () => {
  it('clamps claims to ten and returns a fresh status when the queue is empty', async () => {
    const fixture = createSupabaseFixture({ claimed: [] })
    const finalStatus = status({ pending: 0 })
    const getStatus = vi.fn().mockResolvedValue(finalStatus)

    const result = await processKnowledgeIndexBatch(99, 1, {
      getSupabase: async () => fixture.client as never,
      getStatus,
    })

    expect(fixture.rpc).toHaveBeenCalledWith('claim_knowledge_index_jobs', { p_limit: 10 })
    expect(result).toEqual({
      processed: 0,
      failed: 0,
      consecutiveFailures: 1,
      stoppedForConsecutiveFailures: false,
      status: finalStatus,
    })
    expect(getStatus).toHaveBeenCalledOnce()
  })

  it('completes an unchanged source without requesting another embedding', async () => {
    const source = diary(1)
    const sourceHash = await sha256Hex(knowledgeSourceText(source.date, source.subtitle, source.content ?? ''))
    const fixture = createSupabaseFixture({
      claimed: [1],
      diaries: [source],
      settings: [setting(1, {
        indexed_content_hash: sourceHash,
        indexed_model: 'Qwen/Qwen3-Embedding-0.6B',
      })],
      existingChunkSourceIds: [1],
    })
    const embedTexts = vi.fn()

    const result = await processKnowledgeIndexBatch(10, 0, {
      getSupabase: async () => fixture.client as never,
      embedTexts,
      getStatus: async () => status({ completed: 1, pending: 0 }),
    })

    expect(result).toMatchObject({ processed: 1, failed: 0, consecutiveFailures: 0 })
    expect(embedTexts).not.toHaveBeenCalled()
    expect(fixture.replacements).toHaveLength(0)
    expect(fixture.jobUpdates).toEqual([
      expect.objectContaining({
        filter: 'eq',
        sourceIds: [1],
        values: expect.objectContaining({ status: 'completed', last_error: null }),
      }),
    ])
  })

  it('continues after an isolated failure and resets the consecutive count after success', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const fixture = createSupabaseFixture({ claimed: [1, 2] })
    const embedTexts = vi.fn()
      .mockRejectedValueOnce(new Error('local embedding unavailable'))
      .mockResolvedValueOnce([[0.2]])
    const wait = vi.fn().mockResolvedValue(undefined)

    const result = await processKnowledgeIndexBatch(10, 0, {
      getSupabase: async () => fixture.client as never,
      embedTexts,
      getStatus: async () => status({ completed: 1, failed: 1, pending: 0 }),
      wait,
    })

    expect(result).toMatchObject({
      processed: 1,
      failed: 1,
      consecutiveFailures: 0,
      stoppedForConsecutiveFailures: false,
    })
    expect(wait).toHaveBeenCalledOnce()
    expect(fixture.replacements).toHaveLength(1)
    expect(fixture.replacements[0]).toMatchObject({ p_source_id: 2 })
    expect(fixture.jobUpdates[0]).toMatchObject({
      filter: 'in',
      sourceIds: [1],
      values: { status: 'failed' },
    })
  })

  it('carries failure state between batches and requeues the unprocessed claimed tail', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const fixture = createSupabaseFixture({ claimed: [1, 2, 3] })
    const embedTexts = vi.fn().mockRejectedValue(new Error('local embedding unavailable'))

    const result = await processKnowledgeIndexBatch(10, 2, {
      getSupabase: async () => fixture.client as never,
      embedTexts,
      getStatus: async () => status({ failed: 1, pending: 2 }),
      wait: async () => undefined,
    })

    expect(result).toMatchObject({
      processed: 0,
      failed: 1,
      consecutiveFailures: 3,
      stoppedForConsecutiveFailures: true,
    })
    expect(embedTexts).toHaveBeenCalledOnce()
    expect(fixture.replacements).toHaveLength(0)
    expect(fixture.jobUpdates).toHaveLength(2)
    expect(fixture.jobUpdates[0]).toMatchObject({
      sourceIds: [1],
      values: { status: 'failed' },
    })
    expect(fixture.jobUpdates[1]).toMatchObject({
      sourceIds: [2, 3],
      values: expect.objectContaining({
        status: 'pending',
        started_at: null,
        completed_at: null,
      }),
    })
  })
})
