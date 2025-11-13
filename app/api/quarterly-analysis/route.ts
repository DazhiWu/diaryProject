import { NextResponse } from 'next/server'
import { fetchDiaryEntriesByRange } from '@/lib/diaryApi'
import { analyzeQuarterWithMindTrace } from '@/lib/aiAnalysis'

export const runtime = 'edge'

function getQuarterRange(year: number, quarter: number): { start: Date; end: Date } {
  const q = Math.max(1, Math.min(4, quarter))
  const startMonth = (q - 1) * 3
  const start = new Date(Date.UTC(year, startMonth, 1))
  const end = new Date(Date.UTC(year, startMonth + 3, 0))
  return { start, end }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    let start: Date
    let end: Date
    if (typeof body.year === 'number' && typeof body.quarter === 'number') {
      const range = getQuarterRange(body.year, body.quarter)
      start = range.start
      end = range.end
    } else if (typeof body.start === 'string' && typeof body.end === 'string') {
      start = new Date(body.start)
      end = new Date(body.end)
    } else {
      return NextResponse.json({ error: '缺少有效的季度或日期范围参数' }, { status: 400 })
    }
    const entries = await fetchDiaryEntriesByRange(start, end)
    const analysisResult = await analyzeQuarterWithMindTrace(entries.map(e => ({ id: e.id, date: e.date, content: e.content, subtitle: e.subtitle })))
    
    // 返回完整的分析结果，包括原始AI响应和解析状态
    return NextResponse.json({
      range: { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] },
      result: analysisResult.result,
      rawResponse: analysisResult.rawResponse,
      hasParsingError: analysisResult.hasParsingError
    })
  } catch (error: any) {
    console.error('API处理错误:', error)
    return NextResponse.json({ error: error?.message || '分析失败' }, { status: 500 })
  }
}
