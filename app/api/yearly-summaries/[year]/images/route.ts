import { NextResponse } from 'next/server'

import { YEARLY_BUCKET, createSupabaseUploadStore, yearlyImagePath } from '@/lib/server/mediaMutations'
import { assertAllowedOrigin } from '@/lib/server/origin'
import { HttpError, readSession, requireAdmin } from '@/lib/server/session'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'

function responseFor(error: unknown) { return error instanceof HttpError ? NextResponse.json({ error: error.message }, { status: error.status }) : NextResponse.json({ error: 'Media request failed' }, { status: 500 }) }
function yearFrom(year: string) { if (!/^\d{4}$/u.test(year)) throw new HttpError(400, 'Invalid year'); return year }

export async function POST(request: Request, { params }: { params: Promise<{ year: string }> }) {
  try {
    await assertAllowedOrigin(request); requireAdmin(await readSession(request.headers.get('cookie')))
    const year = yearFrom((await params).year); const file = (await request.formData()).get('file')
    if (!(file instanceof File) || file.type !== 'image/webp') throw new HttpError(400, 'A WebP image is required')
    const supabase = await getSupabaseAdmin()
    let { data: summary, error } = await supabase.from('yearly_summaries').select('id').eq('year', year).maybeSingle()
    if (error) throw new Error('Yearly summary query failed')
    if (!summary) { const created = await supabase.from('yearly_summaries').insert({ year }).select('id').single(); if (created.error) throw new Error('Yearly summary write failed'); summary = created.data }
    const sequence = Date.now() * 1000 + Math.floor(Math.random() * 1000) + 1
    const path = yearlyImagePath(sequence); const storage = await createSupabaseUploadStore()
    await storage.upload(YEARLY_BUCKET, path, file, { contentType: 'image/webp' })
    const inserted = await supabase.from('yearly_images').insert({ yearly_summary_id: summary.id, storage_path: path }).select('id, storage_path, updated_at').single()
    if (inserted.error) { try { await storage.remove(YEARLY_BUCKET, path); return NextResponse.json({ ok: false, residualPaths: [] }, { status: 500 }) } catch { return NextResponse.json({ ok: false, residualPaths: [path] }, { status: 500 }) } }
    return NextResponse.json({ id: inserted.data.id, path, updatedAt: inserted.data.updated_at }, { status: 201 })
  } catch (error) { return responseFor(error) }
}
