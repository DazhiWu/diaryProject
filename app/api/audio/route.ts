import { NextResponse } from 'next/server'

import { AUDIO_BUCKET, createSupabaseUploadStore, parseAudioPath } from '@/lib/server/mediaMutations'
import { assertAllowedOrigin } from '@/lib/server/origin'
import { HttpError, readSession, requireAdmin } from '@/lib/server/session'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'

function responseFor(error: unknown) { return error instanceof HttpError ? NextResponse.json({ error: error.message }, { status: error.status }) : NextResponse.json({ error: 'Audio request failed' }, { status: 500 }) }
function audioRow(row: any) { return { id: row.id, title: row.title, author: row.author, date: row.date, audioPath: row.audio_path, audioUrl: `/api/media/audio?path=${encodeURIComponent(row.audio_path)}`, duration: row.duration, createdAt: row.created_at } }

export async function GET(request: Request) { try { requireAdmin(await readSession(request.headers.get('cookie'))); const { data, error } = await (await getSupabaseAdmin()).from('audio_messages').select('*').order('created_at', { ascending: false }); if (error) throw new Error('Audio query failed'); return NextResponse.json((data ?? []).map(audioRow)) } catch (error) { return responseFor(error) } }

export async function POST(request: Request) {
  try {
    await assertAllowedOrigin(request); requireAdmin(await readSession(request.headers.get('cookie')))
    const form = await request.formData(); const file = form.get('file'); const title = form.get('title'); const author = form.get('author'); const date = form.get('date'); const duration = Number(form.get('duration'))
    if (!(file instanceof File) || file.type !== 'audio/mpeg' || !file.name.toLowerCase().endsWith('.mp3') || typeof title !== 'string' || typeof author !== 'string' || typeof date !== 'string' || !Number.isFinite(duration)) throw new HttpError(400, 'An MP3 file and valid metadata are required')
    const path = `${Date.now()}_${crypto.randomUUID().replaceAll('-', '')}.mp3`; parseAudioPath(path)
    const storage = await createSupabaseUploadStore(); await storage.upload(AUDIO_BUCKET, path, file, { contentType: 'audio/mpeg' })
    const { data, error } = await (await getSupabaseAdmin()).from('audio_messages').insert({ title, author, date, duration, audio_path: path }).select('*').single()
    if (error) { try { await storage.remove(AUDIO_BUCKET, path); return NextResponse.json({ ok: false, residualPaths: [] }, { status: 500 }) } catch { return NextResponse.json({ ok: false, residualPaths: [path] }, { status: 500 }) } }
    return NextResponse.json(audioRow(data), { status: 201 })
  } catch (error) { return responseFor(error) }
}
