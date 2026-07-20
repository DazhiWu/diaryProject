import { NextResponse } from 'next/server'

import { getKnowledgeIndexStatus, processKnowledgeIndexBatch, queueKnowledgeRebuild, retryFailedKnowledgeJobs } from '@/lib/server/knowledgeIndex'
import { assertAllowedOrigin } from '@/lib/server/origin'
import { readJsonBody, REQUEST_LIMITS, stringField } from '@/lib/server/requestLimits'
import { HttpError, readSession, requireAdmin } from '@/lib/server/session'

function responseFor(error: unknown) {
  if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error('[knowledge-index]', { operation: 'route', outcome: 'failed', name: error instanceof Error ? error.name : 'UnknownError' })
  return NextResponse.json({ error: 'Knowledge index request failed' }, { status: 500 })
}

export async function GET(request: Request) {
  try {
    requireAdmin(await readSession(request.headers.get('cookie')))
    return NextResponse.json(await getKnowledgeIndexStatus())
  } catch (error) {
    return responseFor(error)
  }
}

export async function POST(request: Request) {
  try {
    await assertAllowedOrigin(request)
    requireAdmin(await readSession(request.headers.get('cookie')))
    const body = await readJsonBody(request, REQUEST_LIMITS.modelJson) as { action?: unknown; batchSize?: unknown } | null
    const action = stringField(body?.action, 'knowledge index action', { min: 1, max: 20, trim: true })

    if (action === 'rebuild') return NextResponse.json(await queueKnowledgeRebuild())
    if (action === 'retry') return NextResponse.json(await retryFailedKnowledgeJobs())
    if (action !== 'sync') throw new HttpError(400, 'Invalid knowledge index action')

    const batchSize = body?.batchSize === undefined ? 10 : Number(body.batchSize)
    if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 10) throw new HttpError(400, 'Invalid knowledge index batch size')
    return NextResponse.json(await processKnowledgeIndexBatch(batchSize))
  } catch (error) {
    return responseFor(error)
  }
}
