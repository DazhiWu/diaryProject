import { NextResponse } from 'next/server'
import { createDiaryRepository, getDiaryNeighbors } from '@/lib/server/diaryAccess'
import { HttpError, readSession } from '@/lib/server/session'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const id = Number((await params).id); if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, 'Invalid diary id'); const session = await readSession(request.headers.get('cookie')); return NextResponse.json(await getDiaryNeighbors(id, session?.role ?? 'guest', await createDiaryRepository())) } catch (error) { return error instanceof HttpError ? NextResponse.json({ error: error.message }, { status: error.status }) : NextResponse.json({ error: 'Request failed' }, { status: 500 }) }
}
