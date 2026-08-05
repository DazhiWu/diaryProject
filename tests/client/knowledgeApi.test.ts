import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  answerKnowledgeQuestion,
  createThemeTimeline,
  fetchKnowledgeIndexStatus,
  fetchThemeTimelineRuns,
  generateThemeTimelineComparison,
  openKnowledgeCitation,
  processThemeTimeline,
  regenerateThemeTimelineAggregate,
  regenerateThemeTimelineSummary,
  reviewThemeTimelineObservation,
  reviewThemeTimelineComparisonFinding,
  reviewThemeTimelineSummary,
  searchKnowledge,
} from '@/lib/knowledgeApi'
import { DEFAULT_THEME_TIMELINE_GENERATION_CONFIG } from '@/lib/themeTimelineConfig'
import { buildDefaultThemeTimelineThemeSpec } from '@/lib/themeTimelineThemeSpec'

afterEach(() => vi.restoreAllMocks())

describe('knowledge API client', () => {
  it('bypasses browser caches when refreshing index status', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))
    await fetchKnowledgeIndexStatus()
    expect(fetchMock).toHaveBeenCalledWith('/api/knowledge/index', { cache: 'no-store' })
  })

  it('requests optional server-side diagnostics without accepting a client result count', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      results: [],
      rerankApplied: false,
    }), { status: 200 }))

    await searchKnowledge({ query: '目标', diagnostics: true })

    expect(fetchMock).toHaveBeenCalledWith('/api/knowledge/search', expect.objectContaining({
      body: JSON.stringify({ query: '目标', diagnostics: true }),
    }))
  })

  it('submits factual questions to the separate answer endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      answer: '回答。[S1]',
      evidenceStatus: 'supported',
      citations: [],
      rerankApplied: true,
    }), { status: 200 }))

    await answerKnowledgeQuestion({ question: '问题', startDate: '2026-07-01' })

    expect(fetchMock).toHaveBeenCalledWith('/api/knowledge/answer', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ question: '问题', startDate: '2026-07-01' }),
    }))
  })

  it('opens a citation through its trusted source diary id', async () => {
    const onOpenDiary = vi.fn().mockResolvedValue(undefined)
    await openKnowledgeCitation({ sourceId: 604 }, onOpenDiary)
    expect(onOpenDiary).toHaveBeenCalledWith(604)
  })

  it('uses a separate uncached Phase 3 endpoint and explicit lifecycle actions', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }))
    await fetchThemeTimelineRuns()
    expect(fetchMock).toHaveBeenLastCalledWith('/api/knowledge/understanding', { cache: 'no-store' })

    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ id: 'run' }), { status: 200 }))
    const themeSpec = buildDefaultThemeTimelineThemeSpec('目标')
    await createThemeTimeline({
      theme: '目标',
      themeSpec,
      startDate: '2026-07-01',
      endDate: '2026-07-30',
      generationConfig: DEFAULT_THEME_TIMELINE_GENERATION_CONFIG,
    })
    expect(fetchMock).toHaveBeenLastCalledWith('/api/knowledge/understanding', expect.objectContaining({
      body: JSON.stringify({
        action: 'create',
        theme: '目标',
        themeSpec,
        startDate: '2026-07-01',
        endDate: '2026-07-30',
        generationConfig: DEFAULT_THEME_TIMELINE_GENERATION_CONFIG,
      }),
    }))

    await processThemeTimeline('11111111-1111-4111-8111-111111111111')
    expect(fetchMock).toHaveBeenLastCalledWith('/api/knowledge/understanding', expect.objectContaining({
      body: JSON.stringify({
        action: 'process',
        runId: '11111111-1111-4111-8111-111111111111',
      }),
    }))

    await regenerateThemeTimelineSummary('11111111-1111-4111-8111-111111111111')
    expect(fetchMock).toHaveBeenLastCalledWith('/api/knowledge/understanding', expect.objectContaining({
      body: JSON.stringify({
        action: 'regenerate-summary',
        runId: '11111111-1111-4111-8111-111111111111',
      }),
    }))

    await regenerateThemeTimelineAggregate('11111111-1111-4111-8111-111111111111')
    expect(fetchMock).toHaveBeenLastCalledWith('/api/knowledge/understanding', expect.objectContaining({
      body: JSON.stringify({
        action: 'regenerate-aggregate',
        runId: '11111111-1111-4111-8111-111111111111',
      }),
    }))

    await generateThemeTimelineComparison({
      runId: '11111111-1111-4111-8111-111111111111',
      aggregateId: '44444444-4444-4444-8444-444444444444',
      leftPeriod: '2026-01',
      rightPeriod: '2026-02',
    })
    expect(fetchMock).toHaveBeenLastCalledWith('/api/knowledge/understanding', expect.objectContaining({
      body: JSON.stringify({
        action: 'generate-comparison',
        runId: '11111111-1111-4111-8111-111111111111',
        aggregateId: '44444444-4444-4444-8444-444444444444',
        leftPeriod: '2026-01',
        rightPeriod: '2026-02',
      }),
    }))

    await reviewThemeTimelineSummary({
      summaryId: '22222222-2222-4222-8222-222222222222',
      reviewAction: 'confirm',
    })
    expect(fetchMock).toHaveBeenLastCalledWith('/api/knowledge/understanding', expect.objectContaining({
      body: JSON.stringify({
        action: 'review',
        summaryId: '22222222-2222-4222-8222-222222222222',
        reviewAction: 'confirm',
      }),
    }))

    await reviewThemeTimelineObservation({
      observationId: '33333333-3333-4333-8333-333333333333',
      reviewAction: 'edit',
      statement: '用户修订后的观察',
      classification: 'fact',
    })
    expect(fetchMock).toHaveBeenLastCalledWith('/api/knowledge/understanding', expect.objectContaining({
      body: JSON.stringify({
        action: 'review-observation',
        observationId: '33333333-3333-4333-8333-333333333333',
        reviewAction: 'edit',
        statement: '用户修订后的观察',
        classification: 'fact',
      }),
    }))

    await reviewThemeTimelineComparisonFinding({
      findingId: '55555555-5555-4555-8555-555555555555',
      reviewAction: 'edit',
      statement: '用户修订后的比较结论',
      classification: 'inference',
    })
    expect(fetchMock).toHaveBeenLastCalledWith('/api/knowledge/understanding', expect.objectContaining({
      body: JSON.stringify({
        action: 'review-comparison',
        findingId: '55555555-5555-4555-8555-555555555555',
        reviewAction: 'edit',
        statement: '用户修订后的比较结论',
        classification: 'inference',
      }),
    }))
  })
})
