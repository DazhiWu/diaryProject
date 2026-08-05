import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executionMode: 'local' as 'local' | 'status-only',
  createThemeTimelineRun: vi.fn(),
  generateThemeTimelinePeriodComparison: vi.fn(),
  getThemeTimelineRun: vi.fn(),
  listThemeTimelineRuns: vi.fn(),
  processNextThemeTimelineSource: vi.fn(),
  regenerateThemeTimelineAggregate: vi.fn(),
  regenerateThemeTimelineSummary: vi.fn(),
  retryThemeTimelineSources: vi.fn(),
  reviewThemeTimelineObservation: vi.fn(),
  reviewThemeTimelineComparisonFinding: vi.fn(),
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
    generateThemeTimelinePeriodComparison: mocks.generateThemeTimelinePeriodComparison,
    getThemeTimelineRun: mocks.getThemeTimelineRun,
    listThemeTimelineRuns: mocks.listThemeTimelineRuns,
    processNextThemeTimelineSource: mocks.processNextThemeTimelineSource,
    regenerateThemeTimelineAggregate: mocks.regenerateThemeTimelineAggregate,
    regenerateThemeTimelineSummary: mocks.regenerateThemeTimelineSummary,
    retryThemeTimelineSources: mocks.retryThemeTimelineSources,
    reviewThemeTimelineObservation: mocks.reviewThemeTimelineObservation,
    reviewThemeTimelineComparisonFinding: mocks.reviewThemeTimelineComparisonFinding,
    reviewThemeTimelineSummary: mocks.reviewThemeTimelineSummary,
  }
})

import { GET, POST } from '@/app/api/knowledge/understanding/route'
import { createSession } from '@/lib/server/session'
import { DEFAULT_THEME_TIMELINE_GENERATION_CONFIG } from '@/lib/themeTimelineConfig'
import { buildDefaultThemeTimelineThemeSpec } from '@/lib/themeTimelineThemeSpec'
import { ThemeTimelineMigrationRequiredError } from '@/lib/server/themeTimeline'

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

  it('rejects invalid Ollama controls before creating a run', async () => {
    const response = await POST(await request({
      action: 'create',
      theme: '目标',
      startDate: '2026-07-01',
      endDate: '2026-07-30',
      generationConfig: {
        ...DEFAULT_THEME_TIMELINE_GENERATION_CONFIG,
        temperature: 9,
      },
    }, 'admin'))
    expect(response.status).toBe(400)
    expect(mocks.createThemeTimelineRun).not.toHaveBeenCalled()
  })

  it('creates against validated fields only on the local development server', async () => {
    mocks.createThemeTimelineRun.mockResolvedValue({ id: 'run' })
    const themeSpec = buildDefaultThemeTimelineThemeSpec('个人知识库')
    const response = await POST(await request({
      action: 'create',
      theme: '  个人知识库  ',
      themeSpec,
      startDate: '2026-07-01',
      endDate: '2026-07-30',
      generationConfig: DEFAULT_THEME_TIMELINE_GENERATION_CONFIG,
    }, 'admin'))
    expect(response.status).toBe(200)
    expect(mocks.createThemeTimelineRun).toHaveBeenCalledWith({
      theme: '个人知识库',
      themeSpec,
      startDate: '2026-07-01',
      endDate: '2026-07-30',
      generationConfig: DEFAULT_THEME_TIMELINE_GENERATION_CONFIG,
    })

    mocks.executionMode = 'status-only'
    expect((await POST(await request({
      action: 'process',
      runId: '11111111-1111-4111-8111-111111111111',
    }, 'admin'))).status).toBe(409)
    expect(mocks.processNextThemeTimelineSource).not.toHaveBeenCalled()
  })

  it('returns an explicit conflict when v4 source is ahead of the database migration', async () => {
    const themeSpec = buildDefaultThemeTimelineThemeSpec('友情:朋友之间的联系')
    mocks.createThemeTimelineRun.mockRejectedValue(new ThemeTimelineMigrationRequiredError())
    const response = await POST(await request({
      action: 'create',
      theme: '友情:朋友之间的联系',
      themeSpec,
      startDate: '2025-09-01',
      endDate: '2025-09-30',
      generationConfig: DEFAULT_THEME_TIMELINE_GENERATION_CONFIG,
    }, 'admin'))
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'Apply the Phase 3A v4 database migration before creating a new theme timeline run',
    })
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

  it('keeps summary regeneration local-only and validates its run id', async () => {
    const runId = '44444444-4444-4444-8444-444444444444'
    mocks.regenerateThemeTimelineSummary.mockResolvedValue({ id: runId })

    mocks.executionMode = 'status-only'
    expect((await POST(await request({
      action: 'regenerate-summary',
      runId,
    }, 'admin'))).status).toBe(409)
    expect(mocks.regenerateThemeTimelineSummary).not.toHaveBeenCalled()

    mocks.executionMode = 'local'
    expect((await POST(await request({
      action: 'regenerate-summary',
      runId: 'invalid',
    }, 'admin'))).status).toBe(400)

    const response = await POST(await request({
      action: 'regenerate-summary',
      runId,
    }, 'admin'))
    expect(response.status).toBe(200)
    expect(mocks.regenerateThemeTimelineSummary).toHaveBeenCalledWith(runId)
  })

  it('permits deterministic aggregate regeneration online for an administrator', async () => {
    const runId = '55555555-5555-4555-8555-555555555555'
    mocks.executionMode = 'status-only'
    mocks.regenerateThemeTimelineAggregate.mockResolvedValue({ id: runId })

    const response = await POST(await request({
      action: 'regenerate-aggregate',
      runId,
    }, 'admin'))

    expect(response.status).toBe(200)
    expect(mocks.regenerateThemeTimelineAggregate).toHaveBeenCalledWith(runId)
  })

  it('validates and submits observation review without enabling local extraction', async () => {
    mocks.executionMode = 'status-only'
    mocks.reviewThemeTimelineObservation.mockResolvedValue({ id: 'run' })
    const observationId = '33333333-3333-4333-8333-333333333333'

    expect((await POST(await request({
      action: 'review-observation',
      observationId,
      reviewAction: 'edit',
      statement: '修改后的观察',
      classification: 'opinion',
    }, 'admin'))).status).toBe(400)
    expect(mocks.reviewThemeTimelineObservation).not.toHaveBeenCalled()

    const response = await POST(await request({
      action: 'review-observation',
      observationId,
      reviewAction: 'edit',
      statement: '  修改后的观察  ',
      classification: 'inference',
    }, 'admin'))
    expect(response.status).toBe(200)
    expect(mocks.reviewThemeTimelineObservation).toHaveBeenCalledWith({
      observationId,
      action: 'edit',
      statement: '修改后的观察',
      classification: 'inference',
    })
  })

  it('keeps period comparison generation local-only and validates both months', async () => {
    const runId = '66666666-6666-4666-8666-666666666666'
    const aggregateId = '77777777-7777-4777-8777-777777777777'
    mocks.executionMode = 'status-only'
    expect((await POST(await request({
      action: 'generate-comparison',
      runId,
      aggregateId,
      leftPeriod: '2026-01',
      rightPeriod: '2026-02',
    }, 'admin'))).status).toBe(409)
    expect(mocks.generateThemeTimelinePeriodComparison).not.toHaveBeenCalled()

    mocks.executionMode = 'local'
    expect((await POST(await request({
      action: 'generate-comparison',
      runId,
      aggregateId,
      leftPeriod: '2026-13',
      rightPeriod: '2026-02',
    }, 'admin'))).status).toBe(400)

    mocks.generateThemeTimelinePeriodComparison.mockResolvedValue({ id: runId })
    const response = await POST(await request({
      action: 'generate-comparison',
      runId,
      aggregateId,
      leftPeriod: '2026-01',
      rightPeriod: '2026-02',
    }, 'admin'))
    expect(response.status).toBe(200)
    expect(mocks.generateThemeTimelinePeriodComparison).toHaveBeenCalledWith({
      runId,
      aggregateId,
      leftPeriod: '2026-01',
      rightPeriod: '2026-02',
    })
  })

  it('permits comparison finding review online with bounded classification', async () => {
    const findingId = '88888888-8888-4888-8888-888888888888'
    mocks.executionMode = 'status-only'
    expect((await POST(await request({
      action: 'review-comparison',
      findingId,
      reviewAction: 'edit',
      statement: '修订结论',
      classification: 'opinion',
    }, 'admin'))).status).toBe(400)

    mocks.reviewThemeTimelineComparisonFinding.mockResolvedValue({ id: 'run' })
    const response = await POST(await request({
      action: 'review-comparison',
      findingId,
      reviewAction: 'edit',
      statement: '  修订后的有限推断  ',
      classification: 'inference',
    }, 'admin'))
    expect(response.status).toBe(200)
    expect(mocks.reviewThemeTimelineComparisonFinding).toHaveBeenCalledWith({
      findingId,
      action: 'edit',
      statement: '修订后的有限推断',
      classification: 'inference',
    })
  })
})
