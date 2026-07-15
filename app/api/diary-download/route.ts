import { NextResponse } from 'next/server';
import { assertAllowedOrigin } from '@/lib/server/origin';
import { HttpError, readSession, requireAdmin } from '@/lib/server/session';
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin';
import { dateRangeFields, readJsonBody, REQUEST_LIMITS } from '@/lib/server/requestLimits';

function escapeCSVCell(value: string): string {
  const singleLine = value.replace(/\r\n|\r|\n/g, '\\n');
  const formulaSafe = /^[\t ]*[=+\-@]/u.test(singleLine) ? `'${singleLine}` : singleLine;
  return `"${formulaSafe.replace(/"/g, '""')}"`;
}

// 生成CSV格式的日记数据
export function generateCSV(diaryEntries: Array<{date: Date; content: string}>): string {
  // UTF-8 BOM，确保Excel等软件正确识别中文字符
  const BOM = '\uFEFF';
  
  // CSV标题行
  let csv = BOM + '日期,日记内容\n';
  
  // 添加每行数据，注意内容中的逗号和引号需要转义
  diaryEntries.forEach(entry => {
    const date = entry.date.toISOString().split('T')[0]; // 格式化为YYYY-MM-DD
    csv += `${escapeCSVCell(date)},${escapeCSVCell(entry.content)}\n`;
  });
  
  return csv;
}

export async function POST(request: Request) {
  try {
    await assertAllowedOrigin(request);
    requireAdmin(await readSession(request.headers.get('cookie')));
    const body = await readJsonBody(request, REQUEST_LIMITS.csvJson) as { startDate?: unknown; endDate?: unknown } | null;
    const range = dateRangeFields(body?.startDate, body?.endDate);
    const startDate = range.start;
    const endDate = range.end;

    // 获取指定日期范围内的日记
    const { data: diaryEntries, error } = await (await getSupabaseAdmin()).from('diaryContent').select('date, content').gte('date', startDate).lte('date', endDate).order('date', { ascending: true });
    if (error) throw new Error('Diary export failed');
    
    // 只保留需要的字段：日期和内容
    const filteredEntries = (diaryEntries ?? []).map(entry => ({
      date: new Date(entry.date),
      content: entry.content
    }));

    // 生成CSV
    const csvContent = generateCSV(filteredEntries);
    
    // 设置响应头，告诉浏览器这是一个CSV文件
    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="diary_export_${startDate}_to_${endDate}.csv"`,
        'Content-Length': new TextEncoder().encode(csvContent).byteLength.toString()
      }
    });
  } catch (error: unknown) {
    if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('API路由中的错误:', error);
    
    // 返回具体的错误信息
    return NextResponse.json({ error: 'Diary export failed' }, { status: 500 });
  }
}
