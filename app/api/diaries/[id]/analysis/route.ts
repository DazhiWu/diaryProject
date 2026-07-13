import { NextResponse } from 'next/server'
import { analyzeDiaryWithAI } from '@/lib/aiAnalysis'
import { assertAllowedOrigin } from '@/lib/server/origin'
import { HttpError, readSession, requireAdmin } from '@/lib/server/session'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { requireAdmin(await readSession(request.headers.get('cookie'))); const id = Number((await params).id); if (!Number.isSafeInteger(id)) throw new HttpError(400, 'Invalid diary id'); const { data, error } = await (await getSupabaseAdmin()).from('diary_AI_analysis').select('id, diary_id, summary, emotion, created_at').eq('diary_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(); if (error) throw new Error('Analysis query failed'); return NextResponse.json(data) } catch (error) { return error instanceof HttpError ? NextResponse.json({ error: error.message }, { status: error.status }) : NextResponse.json({ error: 'Request failed' }, { status: 500 }) }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertAllowedOrigin(request); requireAdmin(await readSession(request.headers.get('cookie')))
    const id = Number((await params).id); const body = await request.json()
    if (!Number.isSafeInteger(id) || !body || typeof body.content !== 'string' || !body.content) throw new HttpError(400, 'Invalid diary')
    const analysis = await analyzeDiaryWithAI(body.content); const supabase = await getSupabaseAdmin()
    const { error: removeError } = await supabase.from('diary_AI_analysis').delete().eq('diary_id', id); if (removeError) throw new Error('Analysis write failed')
    const { data, error } = await supabase.from('diary_AI_analysis').insert([{ diary_id: id, summary: analysis.summary, emotion: analysis.emotion }]).select('id, diary_id, summary, emotion, created_at').single(); if (error) throw new Error('Analysis write failed')
    const { error: titleError } = await supabase.from('diaryContent').update({ subtitle: analysis.summary, modifiedAt: new Date().toISOString() }).eq('id', id); if (titleError) throw new Error('Diary write failed')
    return NextResponse.json({ analysis: data, subtitle: analysis.summary })
  } catch (error) { return error instanceof HttpError ? NextResponse.json({ error: error.message }, { status: error.status }) : NextResponse.json({ error: 'Request failed' }, { status: 500 }) }
}
