import 'server-only'

import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'
import { HttpError, type Role } from '@/lib/server/session'

export type DiaryRow = {
  id: number
  date: string
  subtitle: string | null
  content: string
  image_paths: string[] | null
  modifiedAt: string | null
  created_at: string | null
}

export type DiaryListInput = { page: number; pageSize: number; search?: string }
export type DiaryListResult = { entries: DiaryRow[]; totalCount: number }

export interface DiaryRepository {
  latestIds(): Promise<number[]>
  list(input: DiaryListInput, allowedIds?: number[]): Promise<DiaryListResult>
  byId(id: number): Promise<DiaryRow | null>
  byDate(date: string): Promise<DiaryRow | null>
  calendar(allowedIds?: number[]): Promise<Pick<DiaryRow, 'id' | 'date' | 'subtitle'>[]>
  ordered(allowedIds?: number[]): Promise<DiaryRow[]>
}

function guestAllowedIds(role: Role, ids: number[]): number[] | undefined {
  return role === 'guest' ? ids : undefined
}

async function allowedIds(role: Role, repository: DiaryRepository): Promise<number[] | undefined> {
  return role === 'guest' ? repository.latestIds() : undefined
}

function assertGuestMayRead(row: DiaryRow | null, ids: number[] | undefined): DiaryRow {
  if (!row) throw new HttpError(404, 'Diary not found')
  if (ids && !ids.includes(row.id)) throw new HttpError(403, 'Forbidden')
  return row
}

export async function getDiaryList(input: DiaryListInput, role: Role, repository?: DiaryRepository): Promise<DiaryListResult> {
  repository ??= await createDiaryRepository()
  const ids = await allowedIds(role, repository)
  return repository.list({
    page: Math.max(1, input.page),
    pageSize: Math.min(50, Math.max(1, input.pageSize)),
    search: input.search?.trim(),
  }, guestAllowedIds(role, ids ?? []))
}

export async function getDiaryById(id: number, role: Role, repository?: DiaryRepository): Promise<DiaryRow> {
  repository ??= await createDiaryRepository()
  const ids = await allowedIds(role, repository)
  return assertGuestMayRead(await repository.byId(id), ids)
}

export async function getDiaryByDate(date: string, role: Role, repository?: DiaryRepository): Promise<DiaryRow> {
  repository ??= await createDiaryRepository()
  const ids = await allowedIds(role, repository)
  return assertGuestMayRead(await repository.byDate(date), ids)
}

export async function getDiaryCalendar(role: Role, repository?: DiaryRepository) {
  repository ??= await createDiaryRepository()
  return repository.calendar(guestAllowedIds(role, await allowedIds(role, repository) ?? []))
}

export async function getDiaryNeighbors(id: number, role: Role, repository?: DiaryRepository) {
  repository ??= await createDiaryRepository()
  const ids = await allowedIds(role, repository)
  const entries = await repository.ordered(guestAllowedIds(role, ids ?? []))
  const index = entries.findIndex((entry) => entry.id === id)
  if (index < 0) {
    if (role === 'guest' && await repository.byId(id)) throw new HttpError(403, 'Forbidden')
    throw new HttpError(404, 'Diary not found')
  }
  return { previous: entries[index + 1] ?? null, next: entries[index - 1] ?? null }
}

export async function createDiaryRepository(): Promise<DiaryRepository> {
  const supabase = await getSupabaseAdmin()
  const fields = 'id, date, subtitle, content, image_paths, modifiedAt, created_at'
  const applyIds = (query: any, ids?: number[]) => ids ? query.in('id', ids) : query

  return {
    async latestIds() {
      const { data, error } = await supabase.from('diaryContent').select('id').order('date', { ascending: false }).limit(5)
      if (error) throw new Error('Diary query failed')
      return (data ?? []).map((row) => row.id as number)
    },
    async list(input, ids) {
      const start = (input.page - 1) * input.pageSize
      let query = applyIds(supabase.from('diaryContent').select(fields, { count: 'exact' }), ids)
        .order('date', { ascending: false }).range(start, start + input.pageSize - 1)
      if (input.search) query = query.or(`content.ilike.%${input.search.replaceAll('%', '\\%').replaceAll(',', '\\,')}%,subtitle.ilike.%${input.search.replaceAll('%', '\\%').replaceAll(',', '\\,')}%`)
      const { data, error, count } = await query
      if (error) throw new Error('Diary query failed')
      return { entries: (data ?? []) as DiaryRow[], totalCount: count ?? 0 }
    },
    async byId(id) {
      const { data, error } = await supabase.from('diaryContent').select(fields).eq('id', id).maybeSingle()
      if (error) throw new Error('Diary query failed')
      return data as DiaryRow | null
    },
    async byDate(date) {
      const { data, error } = await supabase.from('diaryContent').select(fields).eq('date', date).order('modifiedAt', { ascending: false }).limit(1)
      if (error) throw new Error('Diary query failed')
      return data?.[0] as DiaryRow | null
    },
    async calendar(ids) {
      const { data, error } = await applyIds(supabase.from('diaryContent').select('id, date, subtitle'), ids).order('date', { ascending: false })
      if (error) throw new Error('Diary query failed')
      return (data ?? []) as Pick<DiaryRow, 'id' | 'date' | 'subtitle'>[]
    },
    async ordered(ids) {
      const { data, error } = await applyIds(supabase.from('diaryContent').select(fields), ids).order('date', { ascending: false })
      if (error) throw new Error('Diary query failed')
      return (data ?? []) as DiaryRow[]
    },
  }
}
