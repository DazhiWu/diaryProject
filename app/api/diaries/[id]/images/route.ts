import { NextResponse } from 'next/server'

import { createDiaryImage, createSupabaseUploadStore } from '@/lib/server/mediaMutations'
import { assertAllowedOrigin } from '@/lib/server/origin'
import { HttpError, readSession, requireAdmin } from '@/lib/server/session'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'
import { FIELD_LIMITS, fileField, readFormDataBody, REQUEST_LIMITS } from '@/lib/server/requestLimits'

function responseFor(error: unknown) { return error instanceof HttpError ? NextResponse.json({ error: error.message }, { status: error.status }) : NextResponse.json({ error: 'Media request failed' }, { status: 500 }) }
function idFrom(value: string) { const id = Number(value); if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, 'Invalid diary id'); return id }

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertAllowedOrigin(request); requireAdmin(await readSession(request.headers.get('cookie')))
    const id = idFrom((await params).id); const form = await readFormDataBody(request, REQUEST_LIMITS.imageForm); const file = fileField(form.get('file'), { maximumBytes: FIELD_LIMITS.diaryImageBytes, mimeType: 'image/webp' })
    const supabase = await getSupabaseAdmin()
    const { data: diary, error } = await supabase.from('diaryContent').select('date, image_paths').eq('id', id).maybeSingle()
    if (error) throw new Error('Diary query failed'); if (!diary) throw new HttpError(404, 'Diary not found')
    if ((diary.image_paths ?? []).length >= FIELD_LIMITS.diaryImages) throw new HttpError(400, 'Diary image limit reached')
    const storage = await createSupabaseUploadStore()
    const result = await createDiaryImage({ diaryId: id, diaryDate: diary.date, file }, {
      ...storage,
      nextDiarySequence: async () => {
        const { data: latest, error: sequenceError } = await supabase.from('diary_image_paths').select('sequence').eq('diary_id', id).order('sequence', { ascending: false }).limit(1).maybeSingle()
        if (sequenceError) throw new Error('Diary sequence query failed')
        return (latest?.sequence ?? 0) + 1
      },
    }, {
      appendDiaryImage: async (_id, path) => {
        const { error: updateError } = await supabase.from('diaryContent').update({ image_paths: [...(diary.image_paths ?? []), path], modifiedAt: new Date().toISOString() }).eq('id', id)
        if (updateError) throw new Error('Diary image metadata write failed')
      },
    })
    return NextResponse.json(result, { status: result.ok ? 201 : 500 })
  } catch (error) { return responseFor(error) }
}
