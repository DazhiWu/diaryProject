import { NextResponse } from 'next/server';
import { getRuntimeEnvValue } from '@/lib/runtimeEnv';
import { validateAuthConfiguration } from '@/lib/server/env';
import { checkLoginRateLimit } from '@/lib/server/loginRateLimit';
import { assertAllowedOrigin } from '@/lib/server/origin';
import { createSession, HttpError, sessionCookie } from '@/lib/server/session';

const INVALID_CREDENTIAL_DELAY_MS = 250;

function invalidCredentialsResponse() {
  return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
}

export async function POST(request: Request) {
  try {
    await assertAllowedOrigin(request);

    const body = await request.json();
    if (!body || typeof body.password !== 'string' || body.password.length > 1024) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const limit = await checkLoginRateLimit(request);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
      );
    }

    const adminPassword = await getRuntimeEnvValue('AUTH_PASSWORD_ADMIN');
    const viewerPassword = await getRuntimeEnvValue('AUTH_PASSWORD_VIEWER');
    validateAuthConfiguration({ viewer: viewerPassword, admin: adminPassword });

    const isAdmin = body.password === adminPassword;
    const isViewer = body.password === viewerPassword;
    const role = isAdmin ? 'admin' : isViewer ? 'viewer' : null;

    if (!role) {
      await new Promise((resolve) => setTimeout(resolve, INVALID_CREDENTIAL_DELAY_MS));
      return invalidCredentialsResponse();
    }

    const { token, maxAge } = await createSession(role);
    return NextResponse.json(
      { role },
      { headers: { 'Set-Cookie': sessionCookie(token, maxAge) } },
    );
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message.includes('must be configured')) {
      return NextResponse.json({ error: 'Login service unavailable' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
