import { audioMedia, createSupabaseMediaStore } from '@/lib/server/media'
import { readSession } from '@/lib/server/session'

export async function GET(request: Request) { return audioMedia(request, (await readSession(request.headers.get('cookie')))?.role ?? 'guest', await createSupabaseMediaStore()) }
