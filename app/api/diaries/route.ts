import { NextResponse } from 'next/server'

import { createDiaryRepository, getDiaryList } from '@/lib/server/diaryAccess'
import { assertAllowedOrigin } from '@/lib/server/origin'
import { HttpError, readSession, requireAdmin } from '@/lib/server/session'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'
import { dateRangeFields, exactDateField, FIELD_LIMITS, readJsonBody, REQUEST_LIMITS, stringArrayField, stringField } from '@/lib/server/requestLimits'

function errorResponse(error: unknown) {
  if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status })
  return NextResponse.json({ error: 'Request failed' }, { status: 500 })
}

function roleFor(session: Awaited<ReturnType<typeof readSession>>) {
  return session?.role ?? 'guest'
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? '1')
    const pageSize = Number(url.searchParams.get('pageSize') ?? '5')
    if (!Number.isSafeInteger(page) || !Number.isSafeInteger(pageSize)) throw new HttpError(400, 'Invalid pagination')
    const session = await readSession(request.headers.get('cookie'))
    const role = roleFor(session)
    const date = url.searchParams.get('date')
    if (date) {
      const { getDiaryByDate } = await import('@/lib/server/diaryAccess')
      return NextResponse.json(await getDiaryByDate(date, role, await createDiaryRepository()))
    }
    const start = url.searchParams.get('start')
    const end = url.searchParams.get('end')
    if (start || end) {
      if (role !== 'admin' || !start || !end) throw new HttpError(role === 'guest' ? 401 : 403, 'Forbidden')
      const range = dateRangeFields(start, end)
      const { data, error } = await (await getSupabaseAdmin()).from('diaryContent').select('id, date, subtitle, content, image_paths, modifiedAt, created_at').gte('date', range.start).lte('date', range.end).order('date', { ascending: true })
      if (error) throw new Error('Diary query failed')
      return NextResponse.json({ entries: data ?? [], totalCount: data?.length ?? 0 })
    }
    return NextResponse.json(await getDiaryList({ page, pageSize, search: url.searchParams.get('search') ?? undefined }, role, await createDiaryRepository()))
  } catch (error) { return errorResponse(error) }
}

export async function POST(request: Request) {
  try {
    await assertAllowedOrigin(request)
    requireAdmin(await readSession(request.headers.get('cookie')))
    const body = await readJsonBody(request, REQUEST_LIMITS.diaryJson) as Record<string, unknown> | null
    if (!body) throw new HttpError(400, 'Invalid diary')
    const date = exactDateField(body.date, 'diary date')
    const content = stringField(body.content, 'diary content', { min: 1, max: FIELD_LIMITS.diaryContent })
    const subtitle = stringField(body.subtitle, 'diary subtitle', { max: FIELD_LIMITS.diarySubtitle })
    const imagePaths = stringArrayField(body.image_paths, 'diary image paths', FIELD_LIMITS.diaryImages)
    const { data, error } = await (await getSupabaseAdmin()).from('diaryContent').insert([{
      date, content, subtitle, image_paths: imagePaths, modifiedAt: new Date().toISOString(),
    }]).select('id, date, subtitle, content, image_paths, modifiedAt, created_at').single()
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'A diary already exists for this date' }, { status: 409 })
      throw new Error('Diary write failed')
    }
    return NextResponse.json(data, { status: 201 })
  } catch (error) { return errorResponse(error) }
}
