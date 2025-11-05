import { NextResponse } from 'next/server';

// 配置运行时为Edge Runtime，以支持Cloudflare Pages部署
export const runtime = 'edge';

export async function GET() {
  try {
    // 检查环境变量是否存在
    const apiKey = process.env.MODELSCOPE_TOKEN_API_KEY;
    
    const envStatus = {
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey ? apiKey.length : 0,
      isConfigured: !!(apiKey && apiKey.length > 0),
      timestamp: new Date().toISOString()
    };
    
    console.log('Environment Test Results:', envStatus);
    
    return NextResponse.json({
      success: true,
      message: 'Environment variables check completed',
      data: envStatus
    });
  } catch (error) {
    console.error('Environment test error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to check environment variables',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}