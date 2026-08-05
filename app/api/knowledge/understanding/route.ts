import { NextResponse } from 'next/server'

import { getKnowledgeIndexExecutionMode } from '@/lib/server/knowledgeIndex'
import { assertAllowedOrigin } from '@/lib/server/origin'
import { exactDateField, readJsonBody, REQUEST_LIMITS, stringField } from '@/lib/server/requestLimits'
import { HttpError, readSession, requireAdmin } from '@/lib/server/session'
import {
  parseThemeTimelineGenerationConfig,
  ThemeTimelineConfigError,
} from '@/lib/themeTimelineConfig'
import {
  parseThemeTimelineThemeSpecForTheme,
  ThemeTimelineThemeSpecError,
} from '@/lib/themeTimelineThemeSpec'
import {
  createThemeTimelineRun,
  generateThemeTimelinePeriodComparison,
  getThemeTimelineRun,
  listThemeTimelineRuns,
  processNextThemeTimelineSource,
  regenerateThemeTimelineAggregate,
  regenerateThemeTimelineSummary,
  retryThemeTimelineSources,
  reviewThemeTimelineObservation,
  reviewThemeTimelineComparisonFinding,
  reviewThemeTimelineSummary,
  ThemeTimelineProviderError,
  ThemeTimelineComparisonError,
  ThemeTimelineMigrationRequiredError,
} from '@/lib/server/themeTimeline'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/u

function uuidField(value: unknown, name: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw new HttpError(400, `Invalid ${name}`)
  return value
}

function monthField(value: unknown, name: string): string {
  if (typeof value !== 'string' || !MONTH_PATTERN.test(value)) throw new HttpError(400, `Invalid ${name}`)
  return value
}

function responseFor(error: unknown) {
  if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof ThemeTimelineConfigError) {
    return NextResponse.json({ error: 'Invalid Ollama generation config' }, { status: 400 })
  }
  if (error instanceof ThemeTimelineThemeSpecError) {
    return NextResponse.json({ error: 'Invalid theme scope contract' }, { status: 400 })
  }
  if (error instanceof ThemeTimelineComparisonError) {
    return NextResponse.json({ error: error.message }, { status: 409 })
  }
  if (error instanceof ThemeTimelineMigrationRequiredError) {
    return NextResponse.json({ error: error.message }, { status: 409 })
  }
  if (error instanceof ThemeTimelineProviderError) {
    return NextResponse.json(
      { error: 'Local Ollama is temporarily unavailable' },
      { status: error.reason === 'timeout' ? 504 : 502 },
    )
  }
  console.error('[theme-timeline]', {
    operation: 'route',
    outcome: 'failed',
    name: error instanceof Error ? error.name : 'UnknownError',
  })
  return NextResponse.json({ error: 'Theme timeline request failed' }, { status: 500 })
}

function requireLocalProcessing() {
  if (getKnowledgeIndexExecutionMode() !== 'local') {
    throw new HttpError(409, 'Theme timeline extraction is only available from the local development server')
  }
}

export async function GET(request: Request) {
  try {
    requireAdmin(await readSession(request.headers.get('cookie')))
    const runId = new URL(request.url).searchParams.get('runId')
    return NextResponse.json(runId
      ? await getThemeTimelineRun(uuidField(runId, 'theme timeline run id'))
      : await listThemeTimelineRuns(), {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error) {
    return responseFor(error)
  }
}

export async function POST(request: Request) {
  try {
    await assertAllowedOrigin(request)
    requireAdmin(await readSession(request.headers.get('cookie')))
    const body = await readJsonBody(request, REQUEST_LIMITS.modelJson) as {
      action?: unknown
      runId?: unknown
      observationId?: unknown
      aggregateId?: unknown
      findingId?: unknown
      summaryId?: unknown
      theme?: unknown
      themeSpec?: unknown
      startDate?: unknown
      endDate?: unknown
      leftPeriod?: unknown
      rightPeriod?: unknown
      generationConfig?: unknown
      reviewAction?: unknown
      statement?: unknown
      classification?: unknown
    } | null
    const action = stringField(body?.action, 'theme timeline action', { min: 1, max: 20, trim: true })

    if (action === 'create') {
      requireLocalProcessing()
      const theme = stringField(body?.theme, 'theme', { min: 1, max: 200, trim: true })
      const startDate = exactDateField(body?.startDate, 'start date')
      const endDate = exactDateField(body?.endDate, 'end date')
      if (startDate > endDate) throw new HttpError(400, 'Start date must not be after end date')
      const generationConfig = parseThemeTimelineGenerationConfig(body?.generationConfig)
      const themeSpec = parseThemeTimelineThemeSpecForTheme(theme, body?.themeSpec)
      return NextResponse.json(await createThemeTimelineRun({ theme, themeSpec, startDate, endDate, generationConfig }))
    }

    if (action === 'process') {
      requireLocalProcessing()
      return NextResponse.json(await processNextThemeTimelineSource(
        uuidField(body?.runId, 'theme timeline run id'),
      ))
    }

    if (action === 'retry') {
      requireLocalProcessing()
      return NextResponse.json(await retryThemeTimelineSources(
        uuidField(body?.runId, 'theme timeline run id'),
      ))
    }

    if (action === 'regenerate-summary') {
      requireLocalProcessing()
      return NextResponse.json(await regenerateThemeTimelineSummary(
        uuidField(body?.runId, 'theme timeline run id'),
      ))
    }

    if (action === 'regenerate-aggregate') {
      return NextResponse.json(await regenerateThemeTimelineAggregate(
        uuidField(body?.runId, 'theme timeline run id'),
      ))
    }

    if (action === 'generate-comparison') {
      requireLocalProcessing()
      return NextResponse.json(await generateThemeTimelinePeriodComparison({
        runId: uuidField(body?.runId, 'theme timeline run id'),
        aggregateId: uuidField(body?.aggregateId, 'theme timeline aggregate id'),
        leftPeriod: monthField(body?.leftPeriod, 'theme timeline left period'),
        rightPeriod: monthField(body?.rightPeriod, 'theme timeline right period'),
      }))
    }

    if (action === 'review') {
      const reviewAction = stringField(body?.reviewAction, 'theme timeline review action', { min: 1, max: 20, trim: true })
      if (reviewAction !== 'confirm' && reviewAction !== 'edit' && reviewAction !== 'reject' && reviewAction !== 'supersede') {
        throw new HttpError(400, 'Invalid theme timeline review action')
      }
      const statement = reviewAction === 'edit' || reviewAction === 'supersede'
        ? stringField(body?.statement, 'theme timeline review statement', { min: 1, max: 5_000, trim: true })
        : undefined
      return NextResponse.json(await reviewThemeTimelineSummary({
        summaryId: uuidField(body?.summaryId, 'theme timeline summary id'),
        action: reviewAction,
        statement,
      }))
    }

    if (action === 'review-observation') {
      const reviewAction = stringField(body?.reviewAction, 'theme timeline observation review action', { min: 1, max: 20, trim: true })
      if (reviewAction !== 'confirm' && reviewAction !== 'edit' && reviewAction !== 'reject') {
        throw new HttpError(400, 'Invalid theme timeline observation review action')
      }
      const statement = reviewAction === 'edit'
        ? stringField(body?.statement, 'theme timeline observation statement', { min: 1, max: 2_000, trim: true })
        : undefined
      const classification = reviewAction === 'edit'
        ? stringField(body?.classification, 'theme timeline observation classification', { min: 1, max: 20, trim: true })
        : undefined
      if (classification !== undefined
        && classification !== 'fact'
        && classification !== 'summary'
        && classification !== 'inference') {
        throw new HttpError(400, 'Invalid theme timeline observation classification')
      }
      return NextResponse.json(await reviewThemeTimelineObservation({
        observationId: uuidField(body?.observationId, 'theme timeline observation id'),
        action: reviewAction,
        statement,
        classification,
      }))
    }

    if (action === 'review-comparison') {
      const reviewAction = stringField(body?.reviewAction, 'theme timeline comparison review action', { min: 1, max: 20, trim: true })
      if (reviewAction !== 'confirm' && reviewAction !== 'edit' && reviewAction !== 'reject') {
        throw new HttpError(400, 'Invalid theme timeline comparison review action')
      }
      const statement = reviewAction === 'edit'
        ? stringField(body?.statement, 'theme timeline comparison statement', { min: 1, max: 2_000, trim: true })
        : undefined
      const classification = reviewAction === 'edit'
        ? stringField(body?.classification, 'theme timeline comparison classification', { min: 1, max: 20, trim: true })
        : undefined
      if (classification !== undefined
        && classification !== 'fact'
        && classification !== 'summary'
        && classification !== 'inference') {
        throw new HttpError(400, 'Invalid theme timeline comparison classification')
      }
      return NextResponse.json(await reviewThemeTimelineComparisonFinding({
        findingId: uuidField(body?.findingId, 'theme timeline comparison finding id'),
        action: reviewAction,
        statement,
        classification,
      }))
    }

    throw new HttpError(400, 'Invalid theme timeline action')
  } catch (error) {
    return responseFor(error)
  }
}
