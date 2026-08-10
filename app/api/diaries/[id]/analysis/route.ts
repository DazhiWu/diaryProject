import { NextResponse } from 'next/server'
import { analyzeDiaryWithAI } from '@/lib/aiAnalysis'
import { assertAllowedOrigin } from '@/lib/server/origin'
import { HttpError, readSession, requireAdmin } from '@/lib/server/session'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'
import { checkAiRateLimit } from '@/lib/server/aiRateLimit'
import { FIELD_LIMITS, readJsonBody, REQUEST_LIMITS, stringField } from '@/lib/server/requestLimits'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { requireAdmin(await readSession(request.headers.get('cookie'))); const id = Number((await params).id); if (!Number.isSafeInteger(id)) throw new HttpError(400, 'Invalid diary id'); const { data, error } = await (await getSupabaseAdmin()).from('diary_AI_analysis').select('id, diary_id, summary, emotion, created_at').eq('diary_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(); if (error) throw new Error('Analysis query failed'); return NextResponse.json(data) } catch (error) { return error instanceof HttpError ? NextResponse.json({ error: error.message }, { status: error.status }) : NextResponse.json({ error: 'Request failed' }, { status: 500 }) }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertAllowedOrigin(request); requireAdmin(await readSession(request.headers.get('cookie')))
    const id = Number((await params).id)
    if (!Number.isSafeInteger(id)) throw new HttpError(400, 'Invalid diary')
    const limit = await checkAiRateLimit(request)
    if (!limit.allowed) return NextResponse.json({ error: 'Too many AI requests' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } })
    const body = await readJsonBody(request, REQUEST_LIMITS.modelJson) as { content?: unknown } | null
    const content = stringField(body?.content, 'diary content', { min: 1, max: FIELD_LIMITS.modelInput })
    const analysis = await analyzeDiaryWithAI(content)
    try {
      const supabase = await getSupabaseAdmin()
      const { error: removeError } = await supabase.from('diary_AI_analysis').delete().eq('diary_id', id); if (removeError) throw new HttpError(500, 'AI分析结果保存失败，请稍后重试')
      const { data, error } = await supabase.from('diary_AI_analysis').insert([{ diary_id: id, summary: analysis.summary, emotion: analysis.emotion }]).select('id, diary_id, summary, emotion, created_at').single(); if (error) throw new HttpError(500, 'AI分析结果保存失败，请稍后重试')
      const { error: titleError } = await supabase.from('diaryContent').update({ subtitle: analysis.summary, modifiedAt: new Date().toISOString() }).eq('id', id); if (titleError) throw new HttpError(500, 'AI分析结果保存失败，请稍后重试')
      return NextResponse.json({ analysis: data, subtitle: analysis.summary })
    } catch (error) {
      if (error instanceof HttpError) throw error
      console.error('[diary-analysis]', {
        operation: 'persist',
        outcome: 'failed',
        name: error instanceof Error ? error.name : 'UnknownError',
      })
      throw new HttpError(500, 'AI分析结果保存失败，请稍后重试')
    }
  } catch (error) { return error instanceof HttpError ? NextResponse.json({ error: error.message }, { status: error.status }) : NextResponse.json({ error: 'Request failed' }, { status: 500 }) }
}
