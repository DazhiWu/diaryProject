import { NextResponse } from 'next/server'
import { createDiaryRepository, getDiaryCalendar } from '@/lib/server/diaryAccess'
import { readSession } from '@/lib/server/session'

export async function GET(request: Request) {
  try { const session = await readSession(request.headers.get('cookie')); return NextResponse.json(await getDiaryCalendar(session?.role ?? 'guest', await createDiaryRepository())) } catch { return NextResponse.json({ error: 'Request failed' }, { status: 500 }) }
}
