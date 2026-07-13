import { createSupabaseMediaStore, yearlyMedia } from '@/lib/server/media'
import { readSession } from '@/lib/server/session'

export async function GET(request: Request) { return yearlyMedia(request, (await readSession(request.headers.get('cookie')))?.role ?? 'guest', await createSupabaseMediaStore()) }
