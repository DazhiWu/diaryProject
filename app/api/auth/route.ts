import { NextResponse } from 'next/server';
import { getRuntimeEnvValue } from '@/lib/runtimeEnv';

export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const { password } = await request.json();

    const adminPassword = await getRuntimeEnvValue('AUTH_PASSWORD_ADMIN');
    const viewerPassword = await getRuntimeEnvValue('AUTH_PASSWORD_VIEWER');

    if (password === adminPassword) {
      return NextResponse.json({ authLevel: 'admin' });
    }

    if (password === viewerPassword) {
      return NextResponse.json({ authLevel: 'viewer' });
    }

    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
