import 'server-only'

import type { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'
import { HttpError } from '@/lib/server/session'

type SupabaseAdmin = Awaited<ReturnType<typeof getSupabaseAdmin>>
export type YearlyOwnedKind = 'event' | 'section' | 'opinion' | 'image'

const TABLES = {
  event: 'important_events',
  section: 'ai_analysis_sections',
  image: 'yearly_images',
} as const

export function yearlyRouteYear(value: string): string {
  if (!/^\d{4}$/u.test(value)) throw new HttpError(400, 'Invalid year')
  return value
}

export async function yearlySummaryId(
  supabase: SupabaseAdmin,
  year: string,
  options: { create?: boolean } = {},
): Promise<number> {
  const found = await supabase.from('yearly_summaries').select('id').eq('year', year).maybeSingle()
  if (found.error) throw new Error('Yearly summary query failed')
  if (found.data) return found.data.id
  if (!options.create) throw new HttpError(404, 'Yearly summary not found')

  const created = await supabase.from('yearly_summaries').insert({ year }).select('id').single()
  if (!created.error) return created.data.id
  if (created.error.code === '23505') {
    const retried = await supabase.from('yearly_summaries').select('id').eq('year', year).single()
    if (!retried.error) return retried.data.id
  }
  throw new Error('Yearly summary write failed')
}

export async function requireYearlyOwnedItem(
  supabase: SupabaseAdmin,
  summaryId: number,
  kind: YearlyOwnedKind,
  id: number,
): Promise<any> {
  if (kind !== 'opinion') {
    const result = await supabase.from(TABLES[kind]).select('*').eq('id', id).eq('yearly_summary_id', summaryId).maybeSingle()
    if (result.error) throw new Error('Yearly summary ownership query failed')
    if (!result.data) throw new HttpError(404, 'Yearly summary item not found')
    return result.data
  }

  const opinion = await supabase.from('ai_analysis_opinions').select('*').eq('id', id).maybeSingle()
  if (opinion.error) throw new Error('Yearly summary ownership query failed')
  if (!opinion.data) throw new HttpError(404, 'Yearly summary item not found')
  const section = await supabase.from('ai_analysis_sections').select('id').eq('id', opinion.data.ai_analysis_section_id).eq('yearly_summary_id', summaryId).maybeSingle()
  if (section.error) throw new Error('Yearly summary ownership query failed')
  if (!section.data) throw new HttpError(404, 'Yearly summary item not found')
  return opinion.data
}
