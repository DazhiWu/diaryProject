import { translateDiaryContent } from '@/lib/aiAnalysis';
import { NextResponse } from 'next/server';
import { assertAllowedOrigin } from '@/lib/server/origin';
import { HttpError, readSession, requireViewer } from '@/lib/server/session';

export async function POST(request: Request) {
  try {
    await assertAllowedOrigin(request);
    requireViewer(await readSession(request.headers.get('cookie')));
    const body = await request.json();
    const { content } = body;

    if (!content) {
      return NextResponse.json(
        { error: '缺少日记内容' },
        { status: 400 }
      );
    }

    // 调用翻译函数
    const result: string = await translateDiaryContent(content);
    
    return NextResponse.json({ translation: result });
  } catch (error: any) {
    if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('翻译API路由中的错误:', error);
    
    // 返回具体的错误信息
    return NextResponse.json({ error: 'Translation failed' }, { status: 500 });
  }
}
