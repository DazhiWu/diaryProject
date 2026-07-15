import { NextResponse } from 'next/server'

import { checkAnonymousMessageRateLimit } from '@/lib/server/anonymousMessageRateLimit'
import { assertAllowedOrigin } from '@/lib/server/origin'
import { HttpError } from '@/lib/server/session'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'
import { FIELD_LIMITS, readJsonBody, REQUEST_LIMITS, stringField } from '@/lib/server/requestLimits'

const MESSAGE_FIELDS = 'id, content, created_at'

function errorResponse(error: unknown) {
  if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status })
  return NextResponse.json({ error: 'Message request failed' }, { status: 500 })
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? '1')
    const pageSize = Number(url.searchParams.get('pageSize') ?? '10')
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50) {
      throw new HttpError(400, 'Invalid pagination')
    }

    const offset = (page - 1) * pageSize
    const { data, error, count } = await (await getSupabaseAdmin())
      .from('anonymous_messages')
      .select(MESSAGE_FIELDS, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)
    if (error) throw new Error('Message query failed')
    return NextResponse.json({ messages: data ?? [], totalCount: count ?? 0 })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    await assertAllowedOrigin(request)
    const decision = await checkAnonymousMessageRateLimit(request)
    if (!decision.allowed) {
      return NextResponse.json(
        { error: 'Too many messages' },
        { status: 429, headers: { 'Retry-After': String(decision.retryAfterSeconds) } },
      )
    }

    const body = await readJsonBody(request, REQUEST_LIMITS.anonymousMessageJson) as { content?: unknown } | null
    const content = stringField(body?.content, 'message', { min: 1, max: FIELD_LIMITS.anonymousMessage, trim: true })
    const userAgent = request.headers.get('user-agent')?.slice(0, 512) || null

    const { data, error } = await (await getSupabaseAdmin())
      .from('anonymous_messages')
      .insert({ content, user_agent: userAgent })
      .select(MESSAGE_FIELDS)
      .single()
    if (error) throw new Error('Message write failed')
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
