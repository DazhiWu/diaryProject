import { translateDiaryContent } from '@/lib/aiAnalysis';
import { NextResponse } from 'next/server';

// 配置运行时为Edge Runtime，以支持Cloudflare Pages部署
export const runtime = 'edge';

export async function POST(request: Request) {
  try {
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
    console.error('翻译API路由中的错误:', error);
    
    // 返回具体的错误信息
    const errorMessage = error.message || '翻译失败';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}