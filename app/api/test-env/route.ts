import { NextResponse } from 'next/server';
import { getRuntimeEnvValue } from '@/lib/runtimeEnv';

export const runtime = 'edge';

const ENV_KEYS = [
  'MODELSCOPE_TOKEN_API_KEY',
  'AUTH_PASSWORD_ADMIN',
  'AUTH_PASSWORD_VIEWER',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
] as const;

export async function GET() {
  try {
    const entries = await Promise.all(
      ENV_KEYS.map(async (key) => {
        const value = await getRuntimeEnvValue(key);

        return [
          key,
          {
            exists: !!value,
            length: value?.length ?? 0,
          },
        ];
      })
    );

    return NextResponse.json({
      success: true,
      message: 'Environment variables check completed',
      data: {
        variables: Object.fromEntries(entries),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Environment test error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to check environment variables',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
