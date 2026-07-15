import { NextResponse } from 'next/server'

import { YEARLY_BUCKET, createSupabaseUploadStore, yearlyImagePath } from '@/lib/server/mediaMutations'
import { assertAllowedOrigin } from '@/lib/server/origin'
import { HttpError, readSession, requireAdmin } from '@/lib/server/session'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'
import { FIELD_LIMITS, fileField, readFormDataBody, REQUEST_LIMITS } from '@/lib/server/requestLimits'
import { yearlyRouteYear, yearlySummaryId } from '@/lib/server/yearlyOwnership'

function responseFor(error: unknown) { return error instanceof HttpError ? NextResponse.json({ error: error.message }, { status: error.status }) : NextResponse.json({ error: 'Media request failed' }, { status: 500 }) }
export async function POST(request: Request, { params }: { params: Promise<{ year: string }> }) {
  try {
    await assertAllowedOrigin(request); requireAdmin(await readSession(request.headers.get('cookie')))
    const year = yearlyRouteYear((await params).year); const form = await readFormDataBody(request, REQUEST_LIMITS.imageForm); const file = fileField(form.get('file'), { maximumBytes: FIELD_LIMITS.diaryImageBytes, mimeType: 'image/webp' })
    const supabase = await getSupabaseAdmin()
    const summaryId = await yearlySummaryId(supabase, year, { create: true })
    const sequence = Date.now() * 1000 + Math.floor(Math.random() * 1000) + 1
    const path = yearlyImagePath(sequence); const storage = await createSupabaseUploadStore()
    await storage.upload(YEARLY_BUCKET, path, file, { contentType: 'image/webp' })
    const inserted = await supabase.from('yearly_images').insert({ yearly_summary_id: summaryId, storage_path: path, alt: `Yearly image ${sequence}` }).select('id, storage_path, updated_at').single()
    if (inserted.error) { try { await storage.remove(YEARLY_BUCKET, path); return NextResponse.json({ ok: false, residualPaths: [] }, { status: 500 }) } catch { return NextResponse.json({ ok: false, residualPaths: [path] }, { status: 500 }) } }
    return NextResponse.json({ id: inserted.data.id, path, updatedAt: inserted.data.updated_at }, { status: 201 })
  } catch (error) { return responseFor(error) }
}
