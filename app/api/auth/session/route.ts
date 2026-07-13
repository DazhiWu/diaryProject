import { NextResponse } from 'next/server'

import { clearSessionCookie, readSession } from '@/lib/server/session'

export async function GET(request: Request) {
  try {
    const session = await readSession(request.headers.get('cookie'))
    if (session) return NextResponse.json({ role: session.role })

    const response = NextResponse.json({ role: 'guest' })
    if (request.headers.has('cookie')) response.headers.set('Set-Cookie', clearSessionCookie())
    return response
  } catch {
    return NextResponse.json({ role: 'guest' })
  }
}
