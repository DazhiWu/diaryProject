import 'server-only'

import { HttpError } from '@/lib/server/session'
import { assertDiaryImagePathMatchesDate, parseAudioPath as parseStrictAudioPath } from '@/lib/server/pathRules'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'

export const DIARY_BUCKET = '2024To2025_diary_images'
export const YEARLY_BUCKET = '2025_Summary_Images'
export const AUDIO_BUCKET = 'audio_messages'

export type MutationResult = { databaseDeleted: boolean; storageDeleted: boolean; residualPaths: string[] }
export type UploadStore = { upload(bucket: string, path: string, file: File, options?: { upsert?: boolean; contentType?: string }): Promise<void>; remove(bucket: string, path: string): Promise<void> }

export async function createSupabaseUploadStore(): Promise<UploadStore> {
  const supabase = await getSupabaseAdmin()
  return {
    async upload(bucket, path, file, options) {
      const { error } = await supabase.storage.from(bucket).upload(path, file, {
        cacheControl: '3600', upsert: options?.upsert ?? false, contentType: options?.contentType,
      })
      if (error) throw new Error('Storage upload failed')
    },
    async remove(bucket, path) {
      const { error } = await supabase.storage.from(bucket).remove([path])
      if (error) throw new Error('Storage delete failed')
    },
  }
}

export function parseAudioPath(path: string) { return parseStrictAudioPath(path) }

export function diaryImagePath(date: string, sequence: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || !Number.isSafeInteger(sequence) || sequence < 1) throw new HttpError(400, 'Invalid diary image')
  const path = `${date.slice(0, 4)}/${date.replaceAll('-', '')}_${sequence}.webp`
  assertDiaryImagePathMatchesDate(path, date)
  return path
}

export function yearlyImagePath(sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new HttpError(400, 'Invalid yearly image')
  return `yearly/${sequence}.webp`
}

export async function createDiaryImage(
  input: { diaryId: number; diaryDate: string; file: File },
  storage: Pick<UploadStore, 'upload' | 'remove'> & { nextDiarySequence(): Promise<number> },
  repository: { appendDiaryImage(diaryId: number, path: string): Promise<void> },
): Promise<{ ok: true; path: string } | { ok: false; residualPaths: string[] }> {
  const path = diaryImagePath(input.diaryDate, await storage.nextDiarySequence())
  await storage.upload(DIARY_BUCKET, path, input.file, { contentType: 'image/webp' })
  try {
    await repository.appendDiaryImage(input.diaryId, path)
    return { ok: true, path }
  } catch {
    try { await storage.remove(DIARY_BUCKET, path); return { ok: false, residualPaths: [] } }
    catch { return { ok: false, residualPaths: [path] } }
  }
}

export async function deleteAudio(
  id: string,
  repository: { deleteAudio(id: string): Promise<string | null> },
  storage: Pick<UploadStore, 'remove'>,
): Promise<MutationResult> {
  const path = await repository.deleteAudio(id)
  if (!path) return { databaseDeleted: true, storageDeleted: true, residualPaths: [] }
  try {
    await storage.remove(AUDIO_BUCKET, path)
    return { databaseDeleted: true, storageDeleted: true, residualPaths: [] }
  } catch {
    return { databaseDeleted: true, storageDeleted: false, residualPaths: [path] }
  }
}

export async function databaseFirstDelete(bucket: string, path: string | null, deleteMetadata: () => Promise<void>, storage: Pick<UploadStore, 'remove'>): Promise<MutationResult> {
  await deleteMetadata()
  if (!path) return { databaseDeleted: true, storageDeleted: true, residualPaths: [] }
  try { await storage.remove(bucket, path); return { databaseDeleted: true, storageDeleted: true, residualPaths: [] } }
  catch { return { databaseDeleted: true, storageDeleted: false, residualPaths: [path] } }
}
