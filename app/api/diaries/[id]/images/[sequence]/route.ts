import { NextResponse } from 'next/server'

import { DIARY_BUCKET, createSupabaseUploadStore, databaseFirstDelete, diaryImagePath } from '@/lib/server/mediaMutations'
import { assertAllowedOrigin } from '@/lib/server/origin'
import { HttpError, readSession, requireAdmin } from '@/lib/server/session'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'

function responseFor(error: unknown) { return error instanceof HttpError ? NextResponse.json({ error: error.message }, { status: error.status }) : NextResponse.json({ error: 'Media request failed' }, { status: 500 }) }
function numberFrom(value: string, name: string) { const number = Number(value); if (!Number.isSafeInteger(number) || number < 1) throw new HttpError(400, `Invalid ${name}`); return number }
async function diaryPath(id: number, sequence: number) { const supabase = await getSupabaseAdmin(); const { data, error } = await supabase.from('diaryContent').select('date, image_paths').eq('id', id).maybeSingle(); if (error) throw new Error('Diary query failed'); if (!data) throw new HttpError(404, 'Diary not found'); const path = diaryImagePath(data.date, sequence); if (!(data.image_paths ?? []).includes(path)) throw new HttpError(404, 'Image not found'); return { supabase, data, path } }

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; sequence: string }> }) {
  try { await assertAllowedOrigin(request); requireAdmin(await readSession(request.headers.get('cookie'))); const value = await params; const id = numberFrom(value.id, 'diary id'); const { supabase, path } = await diaryPath(id, numberFrom(value.sequence, 'sequence')); const file = (await request.formData()).get('file'); if (!(file instanceof File) || file.type !== 'image/webp') throw new HttpError(400, 'A WebP image is required'); await (await createSupabaseUploadStore()).upload(DIARY_BUCKET, path, file, { upsert: true, contentType: 'image/webp' }); const { error } = await supabase.from('diaryContent').update({ modifiedAt: new Date().toISOString() }).eq('id', id); if (error) throw new Error('Diary image metadata write failed'); return NextResponse.json({ ok: true, path }) } catch (error) { return responseFor(error) }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; sequence: string }> }) {
  try { await assertAllowedOrigin(request); requireAdmin(await readSession(request.headers.get('cookie'))); const value = await params; const id = numberFrom(value.id, 'diary id'); const { supabase, data, path } = await diaryPath(id, numberFrom(value.sequence, 'sequence')); const result = await databaseFirstDelete(DIARY_BUCKET, path, async () => { const { error } = await supabase.from('diaryContent').update({ image_paths: data.image_paths.filter((item: string) => item !== path), modifiedAt: new Date().toISOString() }).eq('id', id); if (error) throw new Error('Diary image metadata delete failed') }, await createSupabaseUploadStore()); return NextResponse.json(result) } catch (error) { return responseFor(error) }
}
