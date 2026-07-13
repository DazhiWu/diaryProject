import 'server-only'

import { requireServerEnv } from '@/lib/server/env'
import { HttpError, type Role } from '@/lib/server/session'
import { parseAudioPath, parseDiaryImagePath, parseSingleRange, parseYearlyImagePath } from '@/lib/server/pathRules'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'

const DIARY_BUCKET = '2024To2025_diary_images'
const YEARLY_BUCKET = '2025_Summary_Images'
const AUDIO_BUCKET = 'audio_messages'

type Range = { start: number; end: number; length: number }
type Owner = { id: number | string }
type Download = { body: ReadableStream<Uint8Array> | null; contentType: string | null; size: number }
type MediaStat = { contentType: string | null; size: number }

export interface MediaStore {
  diaryOwner(path: string): Promise<Owner | null>
  latestDiaryIds(): Promise<number[]>
  yearlyOwner(path: string): Promise<Owner | null>
  audioOwner(path: string): Promise<Owner | null>
  stat(bucket: string, path: string): Promise<MediaStat>
  download(bucket: string, path: string, range: Range | null): Promise<Download>
}

function responseFor(error: unknown): Response {
  if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status })
  return Response.json({ error: 'Media request failed' }, { status: 500 })
}

function requestedPath(request: Request): string {
  const values = new URL(request.url).searchParams.getAll('path')
  if (values.length !== 1) throw new HttpError(400, 'Invalid media path')
  return values[0]
}

function imageResponse(download: Download): Response {
  if (!download.body) throw new HttpError(404, 'Media not found')
  return new Response(download.body, { headers: { 'Content-Type': download.contentType ?? 'image/webp', 'Cache-Control': 'private, max-age=300' } })
}

export async function diaryMedia(request: Request, role: Role, store: MediaStore): Promise<Response> {
  try {
    const path = requestedPath(request)
    parseDiaryImagePath(path)
    const owner = await store.diaryOwner(path)
    if (!owner) throw new HttpError(404, 'Media not found')
    if (role === 'guest' && !(await store.latestDiaryIds()).includes(Number(owner.id))) throw new HttpError(403, 'Forbidden')
    return imageResponse(await store.download(DIARY_BUCKET, path, null))
  } catch (error) { return responseFor(error) }
}

export async function yearlyMedia(request: Request, _role: Role, store: MediaStore): Promise<Response> {
  try {
    const path = requestedPath(request)
    parseYearlyImagePath(path)
    if (!await store.yearlyOwner(path)) throw new HttpError(404, 'Media not found')
    return imageResponse(await store.download(YEARLY_BUCKET, path, null))
  } catch (error) { return responseFor(error) }
}

export async function audioMedia(request: Request, role: Role, store: MediaStore): Promise<Response> {
  try {
    const path = requestedPath(request)
    parseAudioPath(path)
    const owner = await store.audioOwner(path)
    if (!owner) throw new HttpError(404, 'Media not found')
    if (role !== 'admin') throw new HttpError(403, 'Forbidden')
    const stat = await store.stat(AUDIO_BUCKET, path)
    const range = parseSingleRange(request.headers.get('range'), stat.size)
    const download = await store.download(AUDIO_BUCKET, path, range)
    if (!download.body) throw new HttpError(404, 'Media not found')
    const headers = new Headers({ 'Content-Type': download.contentType ?? stat.contentType ?? 'audio/mpeg', 'Accept-Ranges': 'bytes', 'Content-Length': String(range?.length ?? stat.size), 'Cache-Control': 'private, max-age=300' })
    if (range) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`)
    return new Response(download.body, { status: range ? 206 : 200, headers })
  } catch (error) { return responseFor(error) }
}

export function diaryMediaUrl(path: string, modifiedAt: string | Date | null | undefined): string {
  return `/api/media/diary?path=${encodeURIComponent(path)}&v=${encodeURIComponent(modifiedAt instanceof Date ? modifiedAt.toISOString() : modifiedAt ?? '')}`
}

export function yearlyMediaUrl(path: string, updatedAt: string | Date | null | undefined): string {
  return `/api/media/yearly?path=${encodeURIComponent(path)}&v=${encodeURIComponent(updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt ?? '')}`
}

export function audioMediaUrl(path: string): string { return `/api/media/audio?path=${encodeURIComponent(path)}` }

async function storageFetch(bucket: string, path: string, init: RequestInit): Promise<Response> {
  const [url, serviceRole] = await Promise.all([requireServerEnv('SUPABASE_URL'), requireServerEnv('SUPABASE_SERVICE_ROLE_KEY')])
  const objectPath = path.split('/').map(encodeURIComponent).join('/')
  return fetch(`${url}/storage/v1/object/${bucket}/${objectPath}`, { ...init, headers: { Authorization: `Bearer ${serviceRole}`, apikey: serviceRole, ...init.headers } })
}

export async function createSupabaseMediaStore(): Promise<MediaStore> {
  const supabase = await getSupabaseAdmin()
  async function metadata(table: string, column: string, path: string): Promise<Owner | null> {
    const query = table === 'diaryContent'
      ? supabase.from(table).select('id').contains(column, [path]).maybeSingle()
      : supabase.from(table).select('id').eq(column, path).maybeSingle()
    const { data, error } = await query
    if (error) throw new Error('Media metadata query failed')
    return data as Owner | null
  }
  return {
    diaryOwner: (path) => metadata('diaryContent', 'image_paths', path),
    latestDiaryIds: async () => {
      const { data, error } = await supabase.from('diaryContent').select('id').order('date', { ascending: false }).limit(5)
      if (error) throw new Error('Latest diary query failed')
      return (data ?? []).map((row) => Number(row.id))
    },
    yearlyOwner: (path) => metadata('yearly_images', 'storage_path', path),
    audioOwner: (path) => metadata('audio_messages', 'audio_path', path),
    stat: async (bucket, path) => {
      const head = await storageFetch(bucket, path, { method: 'HEAD' })
      if (head.status === 404) throw new HttpError(404, 'Media not found')
      if (!head.ok) throw new Error('Media storage request failed')
      const size = Number(head.headers.get('content-length'))
      if (!Number.isSafeInteger(size) || size < 1) throw new Error('Invalid media size')
      return { contentType: head.headers.get('content-type'), size }
    },
    download: async (bucket, path, range) => {
      const { size } = await (async () => {
        const head = await storageFetch(bucket, path, { method: 'HEAD' })
        if (head.status === 404) throw new HttpError(404, 'Media not found')
        if (!head.ok) throw new Error('Media storage request failed')
        const objectSize = Number(head.headers.get('content-length'))
        if (!Number.isSafeInteger(objectSize) || objectSize < 1) throw new Error('Invalid media size')
        return { size: objectSize }
      })()
      const response = await storageFetch(bucket, path, { headers: range ? { Range: `bytes=${range.start}-${range.end}` } : undefined })
      if (response.status === 404) throw new HttpError(404, 'Media not found')
      if (!response.ok) throw new Error('Media storage request failed')
      return { body: response.body, contentType: response.headers.get('content-type'), size }
    },
  }
}
