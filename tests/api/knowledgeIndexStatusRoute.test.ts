import { afterEach, describe, expect, it, vi } from 'vitest'

const status = {
  totalSources: 598,
  indexedSources: 40,
  totalChunks: 559,
  pending: 558,
  processing: 0,
  failed: 0,
  completed: 40,
  excluded: 0,
  lastIndexedAt: '2026-07-23T02:54:07.000Z',
}
const mocks = vi.hoisted(() => ({ getKnowledgeIndexStatus: vi.fn() }))

vi.mock('@/lib/server/knowledgeIndex', () => ({
  getKnowledgeIndexStatus: mocks.getKnowledgeIndexStatus,
  processKnowledgeIndexBatch: vi.fn(),
  queueKnowledgeRebuild: vi.fn(),
  retryFailedKnowledgeJobs: vi.fn(),
}))

import { GET } from '@/app/api/knowledge/index/route'
import { createSession } from '@/lib/server/session'

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
  vi.clearAllMocks()
})

describe('knowledge index status route', () => {
  it('returns current progress with explicit no-store caching', async () => {
    process.env.SESSION_SECRET = 'k'.repeat(32)
    process.env.SESSION_VERSION = '1'
    mocks.getKnowledgeIndexStatus.mockResolvedValue(status)
    const admin = await createSession('admin')

    const response = await GET(new Request('http://localhost/api/knowledge/index', {
      headers: { Cookie: `diary_session=${admin.token}` },
    }))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    await expect(response.json()).resolves.toEqual(status)
  })
})
