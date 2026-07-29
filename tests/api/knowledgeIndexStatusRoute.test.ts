import { afterEach, describe, expect, it, vi } from 'vitest'

const status = {
  executionMode: 'local' as const,
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
const mocks = vi.hoisted(() => ({
  getKnowledgeIndexExecutionMode: vi.fn(() => 'local'),
  getKnowledgeIndexStatus: vi.fn(),
  processKnowledgeIndexBatch: vi.fn(),
  queueKnowledgeRebuild: vi.fn(),
  retryFailedKnowledgeJobs: vi.fn(),
}))

vi.mock('@/lib/server/knowledgeIndex', () => ({
  getKnowledgeIndexExecutionMode: mocks.getKnowledgeIndexExecutionMode,
  getKnowledgeIndexStatus: mocks.getKnowledgeIndexStatus,
  processKnowledgeIndexBatch: mocks.processKnowledgeIndexBatch,
  queueKnowledgeRebuild: mocks.queueKnowledgeRebuild,
  retryFailedKnowledgeJobs: mocks.retryFailedKnowledgeJobs,
}))

import { GET, POST } from '@/app/api/knowledge/index/route'
import { createSession } from '@/lib/server/session'

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
  vi.clearAllMocks()
  mocks.getKnowledgeIndexExecutionMode.mockReturnValue('local')
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

  it('rejects index maintenance from the production status-only interface', async () => {
    process.env.SESSION_SECRET = 'k'.repeat(32)
    process.env.SESSION_VERSION = '1'
    mocks.getKnowledgeIndexExecutionMode.mockReturnValue('status-only')
    const admin = await createSession('admin')

    const response = await POST(new Request('http://localhost/api/knowledge/index', {
      method: 'POST',
      headers: {
        Cookie: `diary_session=${admin.token}`,
        Origin: 'http://localhost',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'sync' }),
    }))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'Knowledge index maintenance is only available from the local development server',
    })
    expect(mocks.processKnowledgeIndexBatch).not.toHaveBeenCalled()
    expect(mocks.queueKnowledgeRebuild).not.toHaveBeenCalled()
    expect(mocks.retryFailedKnowledgeJobs).not.toHaveBeenCalled()
  })
})
