import { supabase } from './supabaseClient'
import { compressToUTF16, decompressFromUTF16 } from 'lz-string'
import { AIAnalysisResult } from './aiAnalysis'
import { uploadMultipleImages, generateDiaryImagePath } from './imageHandler'

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

function convertHealthConditionToSupabase(condition: Partial<HealthCondition>): Partial<SupabaseHealthCondition> {
  const result: Partial<SupabaseHealthCondition> = {}
  
  if (condition.condition) {
    result.condition = condition.condition
  }
  
  if (condition.startDate) {
    result.start_date = condition.startDate.toISOString().split('T')[0]
  }
  
  if (condition.endDate) {
    result.end_date = condition.endDate.toISOString().split('T')[0]
  }
  
  if (condition.color) {
    result.color = condition.color
  }
  
  return result
}

// 获取所有健康状况
export async function fetchHealthConditions(): Promise<HealthCondition[]> {
  try {
    const { data, error } = await supabase
      .from('health_conditions')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error fetching health conditions:', error)
      throw error
    }
    
    return data ? data.map(convertHealthConditionFromSupabase) : []
  } catch (error) {
    console.error('Failed to fetch health conditions:', error)
    return []
  }
}

// 添加健康状况
export async function insertHealthCondition(condition: Omit<HealthCondition, 'id' | 'created_at'>): Promise<HealthCondition> {
  try {
    const supabaseCondition = convertHealthConditionToSupabase(condition)
    const newId = Date.now().toString()
    
    const { data, error } = await supabase
      .from('health_conditions')
      .insert([{ ...supabaseCondition, id: newId }])
      .select('*')
      .single()
    
    if (error) {
      console.error('Error inserting health condition:', error)
      throw error
    }
    
    return convertHealthConditionFromSupabase(data)
  } catch (error) {
    console.error('Failed to insert health condition:', error)
    throw error
  }
}

// 删除健康状况
export async function deleteHealthCondition(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('health_conditions')
      .delete()
      .eq('id', id)
    
    if (error) {
      console.error('Error deleting health condition:', error)
      throw error
    }
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

export async function fetchAllDiaryEntries(): Promise<DiaryEntry[]> {
  const result = await requestDiaryApi<{ entries: DiaryApiRow[] }>('/api/diaries?page=1&pageSize=50')
  return result.entries.map(convertFromSupabase)
}

export async function fetchDiaryEntriesByRange(startDate: Date, endDate: Date): Promise<DiaryEntry[]> {
  const result = await requestDiaryApi<{ entries: DiaryApiRow[] }>(`/api/diaries?page=1&pageSize=50&start=${encodeURIComponent(dateKey(startDate))}&end=${encodeURIComponent(dateKey(endDate))}`)
  return result.entries.map(convertFromSupabase)
}

export async function fetchAIAnalysesByDateRange(startDate: Date, endDate: Date): Promise<AIDiaryAnalysis[]> {
  try {
    const start = startDate.toISOString()
    const end = endDate.toISOString()
    const { data, error } = await supabase
      .from('diary_AI_analysis')
      .select('*')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: true })
    if (error) {
      throw error
    }
    return (data || []).map((item: SupabaseAIDiaryAnalysis) => ({
      id: item.id,
      diary_id: item.diary_id,
      summary: item.summary,
      emotion: item.emotion,
      created_at: new Date(item.created_at)
    }))
  } catch (error) {
    console.error('Failed to fetch AI analyses by date range:', error)
    throw error
  }
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
export async function uploadDiaryImages(files: File[], date: Date): Promise<string[]> {
  try {
    const uploadResults = await uploadMultipleImages(
      files,
      (index) => generateDiaryImagePath(date, index + 1),
      '2024To2025_diary_images'
    )
    
    return uploadResults.map(result => result.path)
  } catch (error) {
    console.error('上传日记图片失败:', error)
    throw error
  }
}

// Check if offline
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine
}

// LocalStorage helpers as fallback
const STORAGE_KEY = 'diary-entries-backup'
const MAX_ENTRIES = 50 // Limit the number of entries to prevent quota issues

export function getLocalStorageBackup(): DiaryEntry[] {
  if (typeof window === 'undefined') return []
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      // Try to decompress first (for backward compatibility with uncompressed data)
      let parsedData: any[];
      try {
        // Try to decompress the data
        const decompressed = decompressFromUTF16(stored);
        if (decompressed !== null) {
          parsedData = JSON.parse(decompressed);
        } else {
          // If decompression fails, try parsing directly (old format)
          parsedData = JSON.parse(stored);
        }
      } catch (compressionError) {
        // If both decompression and direct parsing fail, try direct parsing (old format)
        parsedData = JSON.parse(stored);
      }
      
      return parsedData.map((entry: any) => ({
        ...entry,
        date: new Date(entry.date),
        modifiedAt: entry.modifiedAt ? new Date(entry.modifiedAt) : null,
        created_at: entry.created_at ? new Date(entry.created_at) : undefined,
      }))
    }
  } catch (error) {
    console.error('Error reading localStorage backup:', error)
  }
  
  return []
}

export function saveLocalStorageBackup(entries: DiaryEntry[]): void {
  if (typeof window === 'undefined') return
  
  // Limit the number of entries to prevent quota issues
  const limitedEntries = entries.slice(0, MAX_ENTRIES)
  
  try {
    const jsonData = JSON.stringify(limitedEntries);
    const compressedData = compressToUTF16(jsonData);
    
    // Check if compressed data exceeds a reasonable size (4MB) before storing
    if (compressedData.length > 4 * 1024 * 1024) {
      console.warn('Compressed data too large for localStorage, reducing entry count')
      // Try with fewer entries
      const reducedEntries = limitedEntries.slice(0, Math.floor(MAX_ENTRIES / 2))
      const reducedJsonData = JSON.stringify(reducedEntries);
      const reducedCompressedData = compressToUTF16(reducedJsonData);
      localStorage.setItem(STORAGE_KEY, reducedCompressedData)
    } else {
      localStorage.setItem(STORAGE_KEY, compressedData)
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.warn('LocalStorage quota exceeded, attempting to store fewer entries')
      // Try to store fewer entries
      try {
        const reducedEntries = limitedEntries.slice(0, 10)
        const reducedJsonData = JSON.stringify(reducedEntries);
        const reducedCompressedData = compressToUTF16(reducedJsonData);
        localStorage.setItem(STORAGE_KEY, reducedCompressedData)
        console.info('Successfully stored reduced entry set in localStorage')
      } catch (retryError) {
        console.error('Failed to store even reduced entry set in localStorage:', retryError)
      }
    } else {
      console.error('Error saving localStorage backup:', error)
    }
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
 * 保存AI分析结果到数据库
 * @param analysis AI分析结果
 */
export async function saveAIAnalysis(analysis: {
  diary_id: number
  summary: string
  emotion: string
}): Promise<AIDiaryAnalysis> {
  try {
    // 先删除之前的AI分析记录，确保只保留最新的结果
    const { error: deleteError } = await supabase
      .from('diary_AI_analysis')
      .delete()
      .eq('diary_id', analysis.diary_id)

    if (deleteError) {
      console.error('Error deleting old AI analysis:', deleteError)
      throw deleteError
    }

    // 保存新的AI分析结果
    const { data, error } = await supabase
      .from('diary_AI_analysis')
      .insert([analysis])
      .select('*')
      .single()

    if (error) {
      console.error('Error saving AI analysis:', error)
      throw error
    }

    return {
      id: data.id,
      diary_id: data.diary_id,
      summary: data.summary,
      emotion: data.emotion,
      created_at: new Date(data.created_at)
    }
  } catch (error) {
    console.error('Failed to save AI analysis:', error)
    throw error
  }
}

/**
 * 获取指定日记的AI分析结果
 * @param diaryId 日记ID
 */
export async function getAIAnalysisForDiary(diaryId: number): Promise<AIDiaryAnalysis | null> {
  try {
    const { data, error } = await supabase
      .from('diary_AI_analysis')
      .select('*')
      .eq('diary_id', diaryId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      // 检查多种情况，确保没有找到记录时返回null
      // PGRST116是Supabase未找到记录的错误码
      // 同时检查HTTP状态码406 Not Acceptable，这也是未找到记录时的常见状态码
      if (error.code === 'PGRST116' || 
          (error as any).status === 406 ||
          (error.message && error.message.includes('Not Acceptable')) ||
          (error.message && error.message.includes('406'))) {
        // 没有找到记录，返回null
        return null
      }
      console.error('Error fetching AI analysis:', error)
      throw error
    }

    return {
      id: data.id,
      diary_id: data.diary_id,
      summary: data.summary,
      emotion: data.emotion,
      created_at: new Date(data.created_at)
    }
  } catch (error: any) {
    console.error('Failed to fetch AI analysis:', error)
    // 同样在catch块中检查406错误
    if (error.status === 406 || 
        (error.message && error.message.includes('Not Acceptable')) ||
        (error.message && error.message.includes('406'))) {
      // 没有找到记录，返回null
      return null
    }
    throw error
  }
}

