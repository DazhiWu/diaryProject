import { NextResponse } from 'next/server'

import { checkAiRateLimit } from '@/lib/server/aiRateLimit'
import {
  answerPrivateKnowledgeQuestion,
  KnowledgeAnswerProviderError,
} from '@/lib/server/knowledgeAnswer'
import { KnowledgeEmbeddingUnavailableError } from '@/lib/server/knowledgeSearch'
import { assertAllowedOrigin } from '@/lib/server/origin'
import { exactDateField, readJsonBody, REQUEST_LIMITS, stringField } from '@/lib/server/requestLimits'
import { HttpError, readSession, requireAdmin } from '@/lib/server/session'

function responseFor(error: unknown) {
  if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof KnowledgeEmbeddingUnavailableError) {
    return NextResponse.json({ error: 'Knowledge answer is temporarily unavailable' }, { status: 503 })
  }
  if (error instanceof KnowledgeAnswerProviderError) {
    const status = error.reason === 'timeout' ? 504 : 502
    return NextResponse.json({ error: 'Knowledge answer provider is temporarily unavailable' }, { status })
  }
  console.error('[knowledge-answer]', {
    operation: 'route',
    outcome: 'failed',
    name: error instanceof Error ? error.name : 'UnknownError',
  })
  return NextResponse.json({ error: 'Knowledge answer failed' }, { status: 500 })
}

export async function POST(request: Request) {
  try {
    await assertAllowedOrigin(request)
    requireAdmin(await readSession(request.headers.get('cookie')))
    const body = await readJsonBody(request, REQUEST_LIMITS.modelJson) as {
      question?: unknown
      startDate?: unknown
      endDate?: unknown
    } | null
    const question = stringField(body?.question, 'knowledge question', { min: 1, max: 500, trim: true })
    const startDate = body?.startDate === undefined || body.startDate === ''
      ? undefined
      : exactDateField(body.startDate, 'start date')
    const endDate = body?.endDate === undefined || body.endDate === ''
      ? undefined
      : exactDateField(body.endDate, 'end date')
    if (startDate && endDate && startDate > endDate) throw new HttpError(400, 'Start date must not be after end date')

    const rateLimit = await checkAiRateLimit(request)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many AI requests' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
      )
    }

    return NextResponse.json(await answerPrivateKnowledgeQuestion({ question, startDate, endDate }))
  } catch (error) {
    return responseFor(error)
  }
}
