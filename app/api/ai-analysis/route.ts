import { analyzeDiaryWithAI, AIAnalysisResult } from '@/lib/aiAnalysis';
import { NextResponse } from 'next/server';
import { assertAllowedOrigin } from '@/lib/server/origin';
import { HttpError, readSession, requireAdmin } from '@/lib/server/session';
import { checkAiRateLimit } from '@/lib/server/aiRateLimit';
import { FIELD_LIMITS, readJsonBody, REQUEST_LIMITS, stringField } from '@/lib/server/requestLimits';

export async function POST(request: Request) {
  try {
    await assertAllowedOrigin(request);
    requireAdmin(await readSession(request.headers.get('cookie')));
    const limit = await checkAiRateLimit(request);
    if (!limit.allowed) return NextResponse.json({ error: 'Too many AI requests' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
    const body = await readJsonBody(request, REQUEST_LIMITS.modelJson) as { content?: unknown } | null;
    const content = stringField(body?.content, 'diary content', { min: 1, max: FIELD_LIMITS.modelInput });

    // 调用AI分析函数
    const result: AIAnalysisResult = await analyzeDiaryWithAI(content);
    
    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('API路由中的错误:', error);
    
    // 返回具体的错误信息
    return NextResponse.json({ error: 'AI analysis failed' }, { status: 500 });
  }
}
