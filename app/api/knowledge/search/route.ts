import { NextResponse } from 'next/server'

import { checkAiRateLimit } from '@/lib/server/aiRateLimit'
import { assertAllowedOrigin } from '@/lib/server/origin'
import { exactDateField, readJsonBody, REQUEST_LIMITS, stringField } from '@/lib/server/requestLimits'
import { KnowledgeEmbeddingUnavailableError, searchPrivateKnowledge } from '@/lib/server/knowledgeSearch'
import { HttpError, readSession, requireAdmin } from '@/lib/server/session'

function responseFor(error: unknown) {
  if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof KnowledgeEmbeddingUnavailableError) {
    return NextResponse.json({ error: 'Knowledge search is temporarily unavailable' }, { status: 503 })
  }
  console.error('[knowledge-search]', { operation: 'route', outcome: 'failed', name: error instanceof Error ? error.name : 'UnknownError' })
  return NextResponse.json({ error: 'Knowledge search failed' }, { status: 500 })
}

export async function POST(request: Request) {
  try {
    await assertAllowedOrigin(request)
    requireAdmin(await readSession(request.headers.get('cookie')))
    const body = await readJsonBody(request, REQUEST_LIMITS.modelJson) as {
      query?: unknown
      startDate?: unknown
      endDate?: unknown
      diagnostics?: unknown
    } | null
    const query = stringField(body?.query, 'knowledge search query', { min: 1, max: 500, trim: true })
    const startDate = body?.startDate === undefined || body.startDate === '' ? undefined : exactDateField(body.startDate, 'start date')
    const endDate = body?.endDate === undefined || body.endDate === '' ? undefined : exactDateField(body.endDate, 'end date')
    const diagnostics = body?.diagnostics ?? false
    if (typeof diagnostics !== 'boolean') throw new HttpError(400, 'Invalid knowledge search diagnostics flag')
    if (startDate && endDate && startDate > endDate) throw new HttpError(400, 'Start date must not be after end date')

    const rateLimit = await checkAiRateLimit(request)
    if (!rateLimit.allowed) return NextResponse.json({ error: 'Too many AI requests' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } })
    return NextResponse.json(await searchPrivateKnowledge({ query, startDate, endDate, diagnostics }))
  } catch (error) {
    return responseFor(error)
  }
}
