import { NextResponse } from 'next/server';
import { getRuntimeEnvValue } from '@/lib/runtimeEnv';
import { validateAuthConfiguration } from '@/lib/server/env';
import { checkLoginRateLimit } from '@/lib/server/loginRateLimit';
import { assertAllowedOrigin } from '@/lib/server/origin';
import { createSession, HttpError, sessionCookie } from '@/lib/server/session';
import { timingSafeEqualStrings } from '@/lib/server/secretComparison';
import { readJsonBody, REQUEST_LIMITS, stringField } from '@/lib/server/requestLimits';

const INVALID_CREDENTIAL_DELAY_MS = 250;

function invalidCredentialsResponse() {
  return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
}

export async function POST(request: Request) {
  try {
    await assertAllowedOrigin(request);

    const body = await readJsonBody(request, REQUEST_LIMITS.authJson) as { password?: unknown } | null;
    if (!body || typeof body.password !== 'string') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    const password = stringField(body.password, 'password', { min: 1, max: 1024 });

    const limit = await checkLoginRateLimit(request);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
      );
    }

    const configuration = {
      admin: await getRuntimeEnvValue('AUTH_PASSWORD_ADMIN'),
      viewer: await getRuntimeEnvValue('AUTH_PASSWORD_VIEWER'),
    };
    validateAuthConfiguration(configuration);

    const [isAdmin, isViewer] = await Promise.all([
      timingSafeEqualStrings(password, configuration.admin),
      timingSafeEqualStrings(password, configuration.viewer),
    ]);
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
