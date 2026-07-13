import { NextResponse } from 'next/server';
import { assertAllowedOrigin } from '@/lib/server/origin';
import { HttpError, readSession, requireAdmin } from '@/lib/server/session';
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin';

// 生成CSV格式的日记数据
function generateCSV(diaryEntries: Array<{date: Date; content: string}>): string {
  // UTF-8 BOM，确保Excel等软件正确识别中文字符
  const BOM = '\uFEFF';
  
  // CSV标题行
  let csv = BOM + '日期,日记内容\n';
  
  // 添加每行数据，注意内容中的逗号和引号需要转义
  diaryEntries.forEach(entry => {
    const date = entry.date.toISOString().split('T')[0]; // 格式化为YYYY-MM-DD
    const content = entry.content
      .replace(/"/g, '""') // 将双引号转义为两个双引号
      .replace(/\n/g, '\\n'); // 将换行符转义为\n
    csv += `"${date}","${content}"\n`;
  });
  
  return csv;
}

export async function POST(request: Request) {
  try {
    await assertAllowedOrigin(request);
    requireAdmin(await readSession(request.headers.get('cookie')));
    const body = await request.json();
    const { startDate, endDate } = body;

    // 验证输入参数
    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: '缺少开始日期或结束日期' },
        { status: 400 }
      );
    }

    // 转换日期格式
    const start = new Date(startDate);
    const end = new Date(endDate);

    // 验证日期有效性
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json(
        { error: '日期格式无效' },
        { status: 400 }
      );
    }

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
        'Content-Length': csvContent.length.toString()
      }
    });
  } catch (error: any) {
    if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('API路由中的错误:', error);
    
    // 返回具体的错误信息
    return NextResponse.json({ error: 'Diary export failed' }, { status: 500 });
  }
}
