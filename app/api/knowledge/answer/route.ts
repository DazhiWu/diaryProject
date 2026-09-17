import { NextResponse } from 'next/server'

import { checkAiRateLimit } from '@/lib/server/aiRateLimit'
import type { KnowledgeAnswerProgress, KnowledgeAnswerProgressHandler } from '@/lib/knowledgeAnswerProgress'
import {
  answerPrivateKnowledgeQuestion,
  KnowledgeAnswerProviderError,
} from '@/lib/server/knowledgeAnswer'
import { KnowledgeEmbeddingUnavailableError } from '@/lib/server/knowledgeSearch'
import {
  MODELSCOPE_ALL_MODELS_FAILED_MESSAGE,
  ModelScopeConfigurationError,
} from '@/lib/server/modelScopeClient'
import { assertAllowedOrigin } from '@/lib/server/origin'
import { exactDateField, readJsonBody, REQUEST_LIMITS, stringField } from '@/lib/server/requestLimits'
import { HttpError, readSession, requireAdmin } from '@/lib/server/session'

const ANSWER_HEARTBEAT_INTERVAL_MS = 10_000
const ANSWER_HEARTBEAT_PADDING = ' '.repeat(1_024)

type ErrorDetails = {
  body: { error: string; code?: string }
  status: number
}

function detailsFor(error: unknown): ErrorDetails {
  if (error instanceof HttpError) return { body: { error: error.message }, status: error.status }
  if (error instanceof KnowledgeEmbeddingUnavailableError) {
    return { body: { error: error.message, code: error.reason }, status: 503 }
  }
  if (error instanceof KnowledgeAnswerProviderError) {
    if (error.reason === 'all-models-failed') {
      return { body: { error: MODELSCOPE_ALL_MODELS_FAILED_MESSAGE }, status: 502 }
    }
    if (error.reason === 'project-error') {
      return { body: { error: '事实问答项目处理异常，请稍后重试' }, status: 500 }
    }
    const status = error.reason === 'timeout' ? 504 : 502
    return { body: { error: 'Knowledge answer provider is temporarily unavailable' }, status }
  }
  if (error instanceof ModelScopeConfigurationError) {
    return { body: { error: error.message }, status: 503 }
  }
  console.error('[knowledge-answer]', {
    operation: 'route',
    outcome: 'failed',
    name: error instanceof Error ? error.name : 'UnknownError',
  })
  return { body: { error: 'Knowledge answer failed' }, status: 500 }
}

function responseFor(error: unknown) {
  const details = detailsFor(error)
  return NextResponse.json(details.body, { status: details.status })
}

type KnowledgeAnswerFactory = (
  onProgress: KnowledgeAnswerProgressHandler,
) => ReturnType<typeof answerPrivateKnowledgeQuestion>

export function streamAnswer(createAnswer: KnowledgeAnswerFactory): Response {
  const encoder = new TextEncoder()
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let canceled = false
  let currentProgress: KnowledgeAnswerProgress | undefined

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: unknown) => {
        if (!canceled) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      }
      send({ type: 'started', padding: ANSWER_HEARTBEAT_PADDING })
      heartbeat = setInterval(() => send({
        type: 'heartbeat',
        ...(currentProgress ? { data: currentProgress } : {}),
        padding: ANSWER_HEARTBEAT_PADDING,
      }), ANSWER_HEARTBEAT_INTERVAL_MS)

      const answer = createAnswer((progress) => {
        currentProgress = progress
        send({ type: 'progress', data: progress })
      })

      void answer
        .then((data) => send({ type: 'result', data }))
        .catch((error: unknown) => {
          const details = detailsFor(error)
          send({ type: 'error', ...details.body, status: details.status })
        })
        .finally(() => {
          clearInterval(heartbeat)
          if (!canceled) controller.close()
        })
    },
    cancel() {
      canceled = true
      clearInterval(heartbeat)
    },
  })

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-store, no-transform',
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export async function POST(request: Request) {
  try {
    await assertAllowedOrigin(request)
    requireAdmin(await readSession(request.headers.get('cookie')))
    const body = await readJsonBody(request, REQUEST_LIMITS.modelJson) as {
      context?: unknown
      question?: unknown
      startDate?: unknown
      endDate?: unknown
    } | null
    const question = stringField(body?.question, 'knowledge question', { min: 1, max: 500, trim: true })
    const context = body?.context === undefined || body.context === '' ? undefined
      : stringField(body.context, 'current experience', { min: 1, max: 2000, trim: true })
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

    return streamAnswer((onProgress) => answerPrivateKnowledgeQuestion(
      { question, startDate, endDate, ...(context ? { context } : {}) },
      undefined,
      onProgress,
    ))
  } catch (error) {
    return responseFor(error)
  }
}
