import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const { password } = await request.json();

    if (password === process.env.AUTH_PASSWORD_ADMIN) {
      return NextResponse.json({ authLevel: 'admin' });
    }

    if (password === process.env.AUTH_PASSWORD_VIEWER) {
      return NextResponse.json({ authLevel: 'viewer' });
    }

    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
