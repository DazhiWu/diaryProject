import { NextResponse } from 'next/server'

import { createDiaryImage, createSupabaseUploadStore } from '@/lib/server/mediaMutations'
import { assertAllowedOrigin } from '@/lib/server/origin'
import { HttpError, readSession, requireAdmin } from '@/lib/server/session'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'

function responseFor(error: unknown) { return error instanceof HttpError ? NextResponse.json({ error: error.message }, { status: error.status }) : NextResponse.json({ error: 'Media request failed' }, { status: 500 }) }
function idFrom(value: string) { const id = Number(value); if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, 'Invalid diary id'); return id }

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertAllowedOrigin(request); requireAdmin(await readSession(request.headers.get('cookie')))
    const id = idFrom((await params).id); const form = await request.formData(); const file = form.get('file')
    if (!(file instanceof File) || file.type !== 'image/webp') throw new HttpError(400, 'A WebP image is required')
    const supabase = await getSupabaseAdmin()
    const { data: diary, error } = await supabase.from('diaryContent').select('date, image_paths').eq('id', id).maybeSingle()
    if (error) throw new Error('Diary query failed'); if (!diary) throw new HttpError(404, 'Diary not found')
    const storage = await createSupabaseUploadStore()
    const result = await createDiaryImage({ diaryId: id, diaryDate: diary.date, file }, {
      ...storage,
      nextDiarySequence: async () => {
        const { data: ledger, error: ledgerError } = await supabase.from('diary_image_sequences').select('last_sequence').eq('date', diary.date).maybeSingle()
        if (ledgerError) throw new Error('Diary sequence query failed')
        const sequences = (diary.image_paths ?? []).map((path: string) => Number(/_(\d+)\.webp$/u.exec(path)?.[1]) || 0)
        const next = Math.max(ledger?.last_sequence ?? 0, ...sequences, 0) + 1
        const { error: saveError } = await supabase.from('diary_image_sequences').upsert({ date: diary.date, last_sequence: next })
        if (saveError) throw new Error('Diary sequence write failed')
        return next
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
