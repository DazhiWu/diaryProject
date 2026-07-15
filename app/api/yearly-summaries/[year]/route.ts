import { NextResponse } from 'next/server'

import { assertAllowedOrigin } from '@/lib/server/origin'
import {
  dateRangeFields,
  FIELD_LIMITS,
  integerField,
  readJsonBody,
  REQUEST_LIMITS,
  stringField,
} from '@/lib/server/requestLimits'
import { HttpError, readSession, requireAdmin } from '@/lib/server/session'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'
import { requireYearlyOwnedItem, yearlyRouteYear, yearlySummaryId, type YearlyOwnedKind } from '@/lib/server/yearlyOwnership'

function responseFor(error: unknown) { return error instanceof HttpError ? NextResponse.json({ error: error.message }, { status: error.status }) : NextResponse.json({ error: 'Yearly summary request failed' }, { status: 500 }) }
function event(row: any) { return { id: row.id, startDate: row.start_date, endDate: row.end_date, description: row.description } }
function opinion(row: any) { return { id: row.id, content: row.content, analysis: row.analysis, created_at: row.created_at } }
function section(row: any) { return { id: row.id, title: row.title, content: row.content, opinions: (row.ai_analysis_opinions ?? []).sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at))).map(opinion), created_at: row.created_at } }

function recordBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Invalid yearly summary request')
  return body as Record<string, unknown>
}

function eventValues(value: unknown) {
  const item = recordBody(value)
  const range = dateRangeFields(item.startDate, item.endDate)
  return { start_date: range.start, end_date: range.end, description: stringField(item.description, 'event description', { max: FIELD_LIMITS.yearlyLongText }) }
}

function sectionValues(value: unknown) {
  const item = recordBody(value)
  return {
    title: stringField(item.title, 'section title', { min: 1, max: FIELD_LIMITS.yearlyTitle, trim: true }),
    content: stringField(item.content, 'section content', { max: FIELD_LIMITS.yearlyLongText }),
  }
}

function opinionValues(value: unknown) {
  const item = recordBody(value)
  return {
    content: stringField(item.content, 'opinion content', { max: FIELD_LIMITS.yearlyLongText }),
    analysis: stringField(item.analysis, 'opinion analysis', { max: FIELD_LIMITS.yearlyLongText }),
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ year: string }> }) {
  try {
    const year = yearlyRouteYear((await params).year)
    const supabase = await getSupabaseAdmin()
    let summaryId: number
    try { summaryId = await yearlySummaryId(supabase, year) } catch (error) { if (error instanceof HttpError && error.status === 404) return NextResponse.json(null); throw error }
    const [events, sections, images] = await Promise.all([
      supabase.from('important_events').select('*').eq('yearly_summary_id', summaryId).order('start_date'),
      supabase.from('ai_analysis_sections').select('*, ai_analysis_opinions(*)').eq('yearly_summary_id', summaryId).order('created_at'),
      supabase.from('yearly_images').select('*').eq('yearly_summary_id', summaryId).order('created_at'),
    ])
    if (events.error || sections.error || images.error) throw new Error('Yearly summary query failed')
    return NextResponse.json({
      year,
      importantEvents: (events.data ?? []).map(event),
      aiAnalyses: (sections.data ?? []).map(section),
      investmentImages: (images.data ?? []).map((image: any) => ({ id: image.id, path: image.storage_path, alt: `Yearly image ${image.id}`, url: `/api/media/yearly?path=${encodeURIComponent(image.storage_path)}&v=${encodeURIComponent(image.updated_at ?? '')}` })),
    })
  } catch (error) { return responseFor(error) }
}

export async function POST(request: Request, { params }: { params: Promise<{ year: string }> }) {
  try {
    await assertAllowedOrigin(request)
    requireAdmin(await readSession(request.headers.get('cookie')))
    const year = yearlyRouteYear((await params).year)
    const body = recordBody(await readJsonBody(request, REQUEST_LIMITS.yearlyJson))
    const action = body.action
    const supabase = await getSupabaseAdmin()

    if (action === 'summary.ensure') {
      await yearlySummaryId(supabase, year, { create: true })
      return NextResponse.json({ year }, { status: 201 })
    }
    if (action === 'event.create') {
      const summaryId = await yearlySummaryId(supabase, year, { create: true })
      const values = eventValues(body.event)
      const result = await supabase.from('important_events').insert({ yearly_summary_id: summaryId, ...values }).select('*').single()
      if (result.error) throw new Error('Yearly event write failed')
      return NextResponse.json(event(result.data), { status: 201 })
    }
    if (action === 'section.create') {
      const summaryId = await yearlySummaryId(supabase, year, { create: true })
      const values = sectionValues(body.section)
      const result = await supabase.from('ai_analysis_sections').insert({ yearly_summary_id: summaryId, ...values }).select('*').single()
      if (result.error) throw new Error('Yearly section write failed')
      return NextResponse.json({ ...section(result.data), opinions: [] }, { status: 201 })
    }
    if (action === 'opinion.create') {
      const summaryId = await yearlySummaryId(supabase, year)
      const sectionId = integerField(body.sectionId, 'section id')
      await requireYearlyOwnedItem(supabase, summaryId, 'section', sectionId)
      const values = opinionValues(body.opinion)
      const result = await supabase.from('ai_analysis_opinions').insert({ ai_analysis_section_id: sectionId, ...values }).select('*').single()
      if (result.error) throw new Error('Yearly opinion write failed')
      return NextResponse.json(opinion(result.data), { status: 201 })
    }
    throw new HttpError(400, 'Invalid yearly summary action')
  } catch (error) { return responseFor(error) }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ year: string }> }) {
  try {
    await assertAllowedOrigin(request)
    requireAdmin(await readSession(request.headers.get('cookie')))
    const year = yearlyRouteYear((await params).year)
    const body = recordBody(await readJsonBody(request, REQUEST_LIMITS.yearlyJson))
    const kind = body.kind
    if (kind !== 'event' && kind !== 'section' && kind !== 'opinion') throw new HttpError(400, 'Invalid yearly summary update')
    const id = integerField(body.id, `${kind} id`)
    const supabase = await getSupabaseAdmin()
    const summaryId = await yearlySummaryId(supabase, year)
    await requireYearlyOwnedItem(supabase, summaryId, kind, id)
    const values = kind === 'event' ? eventValues(body.value) : kind === 'section' ? sectionValues(body.value) : opinionValues(body.value)
    const table = kind === 'event' ? 'important_events' : kind === 'section' ? 'ai_analysis_sections' : 'ai_analysis_opinions'
    let query = supabase.from(table).update(values).eq('id', id)
    if (kind !== 'opinion') query = query.eq('yearly_summary_id', summaryId)
    const result = await query.select('*').maybeSingle()
    if (result.error) throw new Error('Yearly summary update failed')
    if (!result.data) throw new HttpError(404, 'Yearly summary item not found')
    return NextResponse.json(kind === 'event' ? event(result.data) : kind === 'section' ? { ...section(result.data), opinions: [] } : opinion(result.data))
  } catch (error) { return responseFor(error) }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ year: string }> }) {
  try {
    await assertAllowedOrigin(request)
    requireAdmin(await readSession(request.headers.get('cookie')))
    const year = yearlyRouteYear((await params).year)
    const url = new URL(request.url)
    const kind = url.searchParams.get('kind') as YearlyOwnedKind | null
    if (kind !== 'event' && kind !== 'section' && kind !== 'opinion') throw new HttpError(400, 'Invalid yearly summary delete')
    const id = integerField(Number(url.searchParams.get('id')), `${kind} id`)
    const supabase = await getSupabaseAdmin()
    const summaryId = await yearlySummaryId(supabase, year)
    await requireYearlyOwnedItem(supabase, summaryId, kind, id)
    const table = kind === 'event' ? 'important_events' : kind === 'section' ? 'ai_analysis_sections' : 'ai_analysis_opinions'
    let query = supabase.from(table).delete().eq('id', id)
    if (kind !== 'opinion') query = query.eq('yearly_summary_id', summaryId)
    const result = await query
    if (result.error) throw new Error('Yearly summary delete failed')
    return new Response(null, { status: 204 })
  } catch (error) { return responseFor(error) }
}
