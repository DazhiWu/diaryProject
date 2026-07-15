import { NextResponse } from 'next/server'

import { createDiaryRepository, getDiaryById } from '@/lib/server/diaryAccess'
import { assertAllowedOrigin } from '@/lib/server/origin'
import { HttpError, readSession, requireAdmin } from '@/lib/server/session'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'
import { exactDateField, FIELD_LIMITS, readJsonBody, REQUEST_LIMITS, stringArrayField, stringField } from '@/lib/server/requestLimits'

function idFrom(params: { id: string }) { const id = Number(params.id); if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, 'Invalid diary id'); return id }
function responseFor(error: unknown) { return error instanceof HttpError ? NextResponse.json({ error: error.message }, { status: error.status }) : NextResponse.json({ error: 'Request failed' }, { status: 500 }) }

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const id = idFrom(await params); const session = await readSession(request.headers.get('cookie')); return NextResponse.json(await getDiaryById(id, session?.role ?? 'guest', await createDiaryRepository())) } catch (error) { return responseFor(error) }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = idFrom(await params); await assertAllowedOrigin(request); requireAdmin(await readSession(request.headers.get('cookie')))
    const body = await readJsonBody(request, REQUEST_LIMITS.diaryJson) as Record<string, unknown> | null
    if (!body) throw new HttpError(400, 'Invalid diary')
    const values = {
      date: exactDateField(body.date, 'diary date'),
      content: stringField(body.content, 'diary content', { min: 1, max: FIELD_LIMITS.diaryContent }),
      subtitle: stringField(body.subtitle, 'diary subtitle', { max: FIELD_LIMITS.diarySubtitle }),
      image_paths: stringArrayField(body.image_paths, 'diary image paths', FIELD_LIMITS.diaryImages),
      modifiedAt: new Date().toISOString(),
    }
    const { data, error } = await (await getSupabaseAdmin()).from('diaryContent').update(values).eq('id', id).select('id, date, subtitle, content, image_paths, modifiedAt, created_at').maybeSingle()
    if (error) { if (error.code === '23505') return NextResponse.json({ error: 'A diary already exists for this date' }, { status: 409 }); throw new Error('Diary write failed') }
    if (!data) throw new HttpError(404, 'Diary not found')
    return NextResponse.json(data)
  } catch (error) { return responseFor(error) }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const id = idFrom(await params); await assertAllowedOrigin(request); requireAdmin(await readSession(request.headers.get('cookie'))); const supabase = await getSupabaseAdmin(); const { error: analysisError } = await supabase.from('diary_AI_analysis').delete().eq('diary_id', id); if (analysisError) throw new Error('Diary delete failed'); const { error } = await supabase.from('diaryContent').delete().eq('id', id); if (error) throw new Error('Diary delete failed'); return new Response(null, { status: 204 }) } catch (error) { return responseFor(error) }
}
