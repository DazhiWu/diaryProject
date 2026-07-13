import { analyzeDiaryWithAI, AIAnalysisResult } from '@/lib/aiAnalysis';
import { NextResponse } from 'next/server';
import { assertAllowedOrigin } from '@/lib/server/origin';
import { HttpError, readSession, requireAdmin } from '@/lib/server/session';

export async function POST(request: Request) {
  try {
    await assertAllowedOrigin(request);
    requireAdmin(await readSession(request.headers.get('cookie')));
    const body = await request.json();
    const { content } = body;

    if (!content) {
      return NextResponse.json(
        { error: '缺少日记内容' },
        { status: 400 }
      );
    }

    // 调用AI分析函数
    const result: AIAnalysisResult = await analyzeDiaryWithAI(content);
    
    return NextResponse.json(result);
  } catch (error: any) {
    if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('API路由中的错误:', error);
    
    // 返回具体的错误信息
    return NextResponse.json({ error: 'AI analysis failed' }, { status: 500 });
  }
}
