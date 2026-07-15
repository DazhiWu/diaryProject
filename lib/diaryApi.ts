import { compressImage } from './imageHandler'

// 健康状况类型定义
export type HealthCondition = {
  id: string
  condition: string
  startDate: Date
  endDate: Date
  color: string
  created_at?: Date
}

export type SupabaseHealthCondition = {
  id: string
  condition: string
  start_date: string
  end_date: string
  color: string
  created_at: string
}

// 健康状况数据转换函数
function convertHealthConditionFromSupabase(item: SupabaseHealthCondition): HealthCondition {
  return {
    id: item.id,
    condition: item.condition,
    startDate: new Date(item.start_date),
    endDate: new Date(item.end_date),
    color: item.color,
    created_at: new Date(item.created_at)
  }
}

// 获取所有健康状况
export async function fetchHealthConditions(): Promise<HealthCondition[]> {
  try {
    const response = await fetch('/api/health')
    if (response.status === 401 || response.status === 403) return []
    if (!response.ok) throw new Error('Health request failed')
    return (await response.json() as SupabaseHealthCondition[]).map(convertHealthConditionFromSupabase)
  } catch (error) {
    console.error('Failed to fetch health conditions:', error)
    return []
  }
}

// 添加健康状况
export async function insertHealthCondition(condition: Omit<HealthCondition, 'id' | 'created_at'>): Promise<HealthCondition> {
  try {
    const response = await fetch('/api/health', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...condition, startDate: condition.startDate.toISOString().slice(0, 10), endDate: condition.endDate.toISOString().slice(0, 10) }) })
    if (!response.ok) throw new Error('Health request failed')
    return convertHealthConditionFromSupabase(await response.json())
  } catch (error) {
    console.error('Failed to insert health condition:', error)
    throw error
  }
}

// 更新健康状况
export async function updateHealthCondition(id: string, condition: Omit<HealthCondition, 'id' | 'created_at'>): Promise<HealthCondition> {
  try {
    const response = await fetch(`/api/health/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...condition, startDate: condition.startDate.toISOString().slice(0, 10), endDate: condition.endDate.toISOString().slice(0, 10) }) })
    if (!response.ok) throw new Error('Health request failed')
    return convertHealthConditionFromSupabase(await response.json())
  } catch (error) {
    console.error('Failed to update health condition:', error)
    throw error
  }
}

// 删除健康状况
export async function deleteHealthCondition(id: string): Promise<void> {
  try {
    const response = await fetch(`/api/health/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!response.ok) throw new Error('Health request failed')
  } catch (error) {
    console.error('Failed to delete health condition:', error)
    throw error
  }
}

export type DiaryEntry = {
  id: number
  date: Date
  subtitle?: string | null
  content: string
  images?: string[] | null
  modifiedAt?: Date | null
  created_at?: Date
}

export type SupabaseDiaryEntry = {
  id: number
  date: string
  subtitle?: string | null
  content: string
  image_paths?: string[] | null
  modifiedAt?: string | null
  created_at?: string
}

type DiaryApiRow = SupabaseDiaryEntry

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

async function requestDiaryApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error ?? 'Diary request failed')
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}

function convertFromSupabase(entry: SupabaseDiaryEntry): DiaryEntry {
  // 统一使用UTC时区处理日期
  return {
    id: entry.id,
    date: new Date(entry.date), // 直接使用UTC日期
    subtitle: entry.subtitle,
    content: entry.content,
    images: entry.image_paths,
    modifiedAt: entry.modifiedAt ? new Date(entry.modifiedAt) : null,
    created_at: entry.created_at ? new Date(entry.created_at) : undefined,
  }
}

function convertToSupabase(entry: Partial<DiaryEntry>): Partial<SupabaseDiaryEntry> {
  const result: Partial<SupabaseDiaryEntry> = {};
  
  // 统一使用UTC时区处理日期
  // 只有在entry.date存在时才生成date字段，避免在更新操作中意外更改日期
  if (entry.date) {
    // 使用toISOString的日期部分，确保日期正确保存到UTC数据库
    result.date = entry.date.toISOString().split('T')[0];
  }
  
  result.subtitle = entry.subtitle;
  result.content = entry.content;
  result.image_paths = entry.images || null;
  
  // Only include modifiedAt if it's provided
  if (entry.modifiedAt) {
    result.modifiedAt = entry.modifiedAt.toISOString();
  }
  
  return result;
}

export async function fetchDiaryEntriesByRange(startDate: Date, endDate: Date): Promise<DiaryEntry[]> {
  const result = await requestDiaryApi<{ entries: DiaryApiRow[] }>(`/api/diaries?page=1&pageSize=50&start=${encodeURIComponent(dateKey(startDate))}&end=${encodeURIComponent(dateKey(endDate))}`)
  return result.entries.map(convertFromSupabase)
}

// 获取日历视图所需的关键字段（包含subtitle以支持标题检测）
export async function fetchCalendarEntries(): Promise<{id: number; date: Date; subtitle?: string | null}[]> {
  const entries = await requestDiaryApi<Array<{ id: number; date: string; subtitle?: string | null }>>('/api/diaries/calendar')
  return entries.map((entry) => ({ ...entry, date: new Date(entry.date) }))
}

// 根据日期查询完整的日记条目
export async function fetchDiaryEntryByDate(date: Date): Promise<DiaryEntry | null> {
  try { return convertFromSupabase(await requestDiaryApi<DiaryApiRow>(`/api/diaries?date=${encodeURIComponent(dateKey(date))}`)) } catch { return null }
}

/**
 * 分页获取日记条目
 * @param page 页码（从1开始）
 * @param pageSize 每页条目数
 * @param searchQuery 可选的搜索关键词
 * @returns 分页数据对象，包含数据列表和总数
 */
export async function fetchDiaryEntriesWithPagination(
  page: number = 1,
  pageSize: number = 10,
  searchQuery?: string
): Promise<{ entries: DiaryEntry[], totalCount: number }> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (searchQuery?.trim()) query.set('search', searchQuery.trim())
  const result = await requestDiaryApi<{ entries: DiaryApiRow[]; totalCount: number }>(`/api/diaries?${query}`)
  return { entries: result.entries.map(convertFromSupabase), totalCount: result.totalCount }
}

export async function insertDiaryEntry(entry: Partial<DiaryEntry>): Promise<{ success: boolean; data?: DiaryEntry; message?: string }> {
  try {
    const data = await requestDiaryApi<DiaryApiRow>('/api/diaries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(convertToSupabase(entry)) })
    return { success: true, data: convertFromSupabase(data) }
  } catch (error) {
    console.error('Failed to insert diary entry:', error)
    return { success: false, message: '添加日记时发生未知错误' }
  }
}

export async function updateDiaryEntry(id: number, entry: Partial<DiaryEntry>): Promise<DiaryEntry> {
  return convertFromSupabase(await requestDiaryApi<DiaryApiRow>(`/api/diaries/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(convertToSupabase(entry)) }))
}

export async function deleteDiaryEntry(id: number): Promise<void> {
  await requestDiaryApi<void>(`/api/diaries/${id}`, { method: 'DELETE' })
}

/**
 * 上传日记图片
 * @param files 图片文件数组
 * @param date 日记日期
 * @returns 上传后的图片路径数组
 */
export async function uploadDiaryImages(files: File[], diaryId: number): Promise<string[]> {
  try {
    const paths: string[] = []
    for (const file of files) {
      const form = new FormData()
      form.set('file', await compressImage(file))
      const result = await requestDiaryApi<{ ok: boolean; path?: string; residualPaths?: string[] }>(`/api/diaries/${diaryId}/images`, { method: 'POST', body: form })
      if (!result.ok || !result.path) throw new Error(result.residualPaths?.length ? `媒体清理未完成: ${result.residualPaths.join(', ')}` : '日记图片上传失败')
      paths.push(result.path)
    }
    return paths
  } catch (error) {
    console.error('上传日记图片失败:', error)
    throw error
  }
}

// AI分析结果类型
export type AIDiaryAnalysis = {
  id: number
  diary_id: number
  summary: string
  emotion: string
  created_at: Date
}

export type SupabaseAIDiaryAnalysis = {
  id: number
  diary_id: number
  summary: string
  emotion: string
  created_at: string
}

/**
 * 获取指定日记的AI分析结果
 * @param diaryId 日记ID
 */
export async function getAIAnalysisForDiary(diaryId: number): Promise<AIDiaryAnalysis | null> {
  const response = await fetch(`/api/diaries/${diaryId}/analysis`)
  if (response.status === 404) return null
  if (!response.ok) throw new Error('Analysis request failed')
  const data = await response.json() as SupabaseAIDiaryAnalysis | null
  return data ? { ...data, created_at: new Date(data.created_at) } : null
}
