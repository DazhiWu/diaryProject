import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executionMode: 'local' as 'local' | 'status-only',
  createThemeTimelineRun: vi.fn(),
  getThemeTimelineRun: vi.fn(),
  listThemeTimelineRuns: vi.fn(),
  processNextThemeTimelineSource: vi.fn(),
  retryThemeTimelineSources: vi.fn(),
  reviewThemeTimelineSummary: vi.fn(),
}))

vi.mock('@/lib/server/knowledgeIndex', () => ({
  getKnowledgeIndexExecutionMode: () => mocks.executionMode,
}))

vi.mock('@/lib/server/themeTimeline', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/server/themeTimeline')>()
  return {
    ...original,
    createThemeTimelineRun: mocks.createThemeTimelineRun,
    getThemeTimelineRun: mocks.getThemeTimelineRun,
    listThemeTimelineRuns: mocks.listThemeTimelineRuns,
    processNextThemeTimelineSource: mocks.processNextThemeTimelineSource,
    retryThemeTimelineSources: mocks.retryThemeTimelineSources,
    reviewThemeTimelineSummary: mocks.reviewThemeTimelineSummary,
  }
})

import { GET, POST } from '@/app/api/knowledge/understanding/route'
import { createSession } from '@/lib/server/session'

const originalEnv = { ...process.env }

async function request(body: unknown, role?: 'viewer' | 'admin') {
  process.env.SESSION_SECRET = 'k'.repeat(32)
  process.env.SESSION_VERSION = '1'
  const cookie = role ? `diary_session=${(await createSession(role)).token}` : undefined
  return new Request('http://localhost/api/knowledge/understanding', {
    method: 'POST',
    headers: {
      Origin: 'http://localhost',
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  })
}

afterEach(() => {
  process.env = { ...originalEnv }
  mocks.executionMode = 'local'
  vi.clearAllMocks()
})

describe('theme timeline route boundary', () => {
  it('keeps reads and writes administrator-only', async () => {
    process.env.SESSION_SECRET = 'k'.repeat(32)
    process.env.SESSION_VERSION = '1'
    const viewer = await createSession('viewer')
    const viewerCookie = `diary_session=${viewer.token}`
    expect((await GET(new Request('http://localhost/api/knowledge/understanding'))).status).toBe(401)
    expect((await GET(new Request('http://localhost/api/knowledge/understanding', { headers: { Cookie: viewerCookie } }))).status).toBe(403)
    expect((await POST(await request({ action: 'create', theme: '目标', startDate: '2026-07-01', endDate: '2026-07-30' }, 'viewer'))).status).toBe(403)
    expect(mocks.createThemeTimelineRun).not.toHaveBeenCalled()
  })

  it('validates theme and date ranges before creating a run', async () => {
    expect((await POST(await request({
      action: 'create',
      theme: '',
      startDate: '2026-07-01',
      endDate: '2026-07-30',
    }, 'admin'))).status).toBe(400)
    expect((await POST(await request({
      action: 'create',
      theme: '目标',
      startDate: '2026-07-31',
      endDate: '2026-07-30',
    }, 'admin'))).status).toBe(400)
    expect(mocks.createThemeTimelineRun).not.toHaveBeenCalled()
  })

  it('creates against validated fields only on the local development server', async () => {
    mocks.createThemeTimelineRun.mockResolvedValue({ id: 'run' })
    const response = await POST(await request({
      action: 'create',
      theme: '  个人知识库  ',
      startDate: '2026-07-01',
      endDate: '2026-07-30',
    }, 'admin'))
    expect(response.status).toBe(200)
    expect(mocks.createThemeTimelineRun).toHaveBeenCalledWith({
      theme: '个人知识库',
      startDate: '2026-07-01',
      endDate: '2026-07-30',
    })

    mocks.executionMode = 'status-only'
    expect((await POST(await request({
      action: 'process',
      runId: '11111111-1111-4111-8111-111111111111',
    }, 'admin'))).status).toBe(409)
    expect(mocks.processNextThemeTimelineSource).not.toHaveBeenCalled()
  })

  it('permits administrator review online while validating replacement text', async () => {
    mocks.executionMode = 'status-only'
    mocks.reviewThemeTimelineSummary.mockResolvedValue({ id: 'run' })
    const summaryId = '11111111-1111-4111-8111-111111111111'
    expect((await POST(await request({
      action: 'review',
      summaryId,
      reviewAction: 'edit',
      statement: '',
    }, 'admin'))).status).toBe(400)

    const response = await POST(await request({
      action: 'review',
      summaryId,
      reviewAction: 'supersede',
      statement: '  用户修订后的摘要  ',
    }, 'admin'))
    expect(response.status).toBe(200)
    expect(mocks.reviewThemeTimelineSummary).toHaveBeenCalledWith({
      summaryId,
      action: 'supersede',
      statement: '用户修订后的摘要',
    })
  })
})
