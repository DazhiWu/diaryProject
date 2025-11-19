import { supabase } from './supabaseClient'
import { compressToUTF16, decompressFromUTF16 } from 'lz-string'
import { AIAnalysisResult } from './aiAnalysis'

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
  images?: string[] | null
  modifiedAt?: string | null
  created_at?: string
}

function convertFromSupabase(entry: SupabaseDiaryEntry): DiaryEntry {
  // 统一使用UTC时区处理日期
  return {
    id: entry.id,
    date: new Date(entry.date), // 直接使用UTC日期
    subtitle: entry.subtitle,
    content: entry.content,
    images: entry.images,
    modifiedAt: entry.modifiedAt ? new Date(entry.modifiedAt) : null,
    created_at: entry.created_at ? new Date(entry.created_at) : undefined,
  }
}

function convertToSupabase(entry: Partial<DiaryEntry>): Partial<SupabaseDiaryEntry> {
  const result: Partial<SupabaseDiaryEntry> = {};
  
  // 统一使用UTC时区处理日期
  if (entry.date) {
    // 使用toISOString的日期部分，确保日期正确保存到UTC数据库
    result.date = entry.date.toISOString().split('T')[0];
  } else {
    result.date = new Date().toISOString().split('T')[0];
  }
  
  result.subtitle = entry.subtitle;
  result.content = entry.content;
  result.images = entry.images || null;
  
  // Only include modifiedAt if it's provided
  if (entry.modifiedAt) {
    result.modifiedAt = entry.modifiedAt.toISOString();
  }
  
  return result;
}

export async function fetchAllDiaryEntries(): Promise<DiaryEntry[]> {
  try {
    const { data, error } = await supabase
      .from('diaryContent')
      .select('*')
      .order('date', { ascending: false })

    if (error) {
      console.error('Error fetching diary entries:', error)
      throw error
    }

    return data ? data.map(convertFromSupabase) : []
  } catch (error) {
    console.error('Failed to fetch diary entries:', error)
    throw error
  }
}

export async function fetchDiaryEntriesByRange(startDate: Date, endDate: Date): Promise<DiaryEntry[]> {
  try {
    const start = startDate.toISOString().split('T')[0]
    const end = endDate.toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('diaryContent')
      .select('*')
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: true })
    if (error) {
      throw error
    }
    return data ? data.map(convertFromSupabase) : []
  } catch (error) {
    console.error('Failed to fetch diary entries by range:', error)
    throw error
  }
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
  try {
    // 选择ID、日期和subtitle字段，以便检测特殊标题
    const { data, error } = await supabase
      .from('diaryContent')
      .select('id, date, subtitle')
      .order('date', { ascending: false })
      
    if (error) {
      console.error('Error fetching calendar entries:', error)
      throw error
    }
    
    // 返回ID、日期和subtitle
    return data ? data.map(item => ({
      id: item.id,
      date: new Date(item.date),
      subtitle: item.subtitle
    })) : []
  } catch (error) {
    console.error('Failed to fetch calendar entries:', error)
    return []
  }
}

// 根据日期查询完整的日记条目
export async function fetchDiaryEntryByDate(date: Date): Promise<DiaryEntry | null> {
  try {
    // 直接使用本地时区的年月日构建日期字符串，避免时区转换问题
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // 月份从0开始，需要+1
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    const { data, error } = await supabase
      .from('diaryContent')
      .select('*')
      .eq('date', dateStr)
      .order('modifiedAt', { ascending: false })
      .limit(1)
      
    if (error) {
      console.error('Error fetching diary entry by date:', error)
      throw error
    }
    
    // 返回第一个匹配的日记条目（如果有）
    return data && data.length > 0 ? convertFromSupabase(data[0]) : null
  } catch (error) {
    console.error('Failed to fetch diary entry by date:', error)
    return null
  }
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
  try {
    // 计算偏移量
    const offset = (page - 1) * pageSize
    
    // 基础查询 - Supabase V2 使用 range 而不是 offset
    let query = supabase
      .from('diaryContent')
      .select('*', { count: 'exact' })
      .order('date', { ascending: false })
      .range(offset, offset + pageSize - 1)
    
    // 如果有搜索关键词，添加搜索条件
    if (searchQuery && searchQuery.trim() !== '') {
      const searchTerm = searchQuery.trim().toLowerCase()
      query = query.or(
        `content.ilike.%${searchTerm}%,subtitle.ilike.%${searchTerm}%`
      )
    }
    
    const { data, error, count } = await query
    
    if (error) {
      console.error('Error fetching paginated diary entries:', error)
      throw error
    }
    
    return {
      entries: data ? data.map(convertFromSupabase) : [],
      totalCount: count || 0
    }
  } catch (error) {
    console.error('Failed to fetch paginated diary entries:', error)
    throw error
  }
}

export async function insertDiaryEntry(entry: Partial<DiaryEntry>): Promise<{ success: boolean; data?: DiaryEntry; message?: string }> {
  try {
    const supabaseEntry = convertToSupabase(entry)
    
    const { data, error } = await supabase
      .from('diaryContent')
      .insert([supabaseEntry])
      .select('*')
      .single()

    if (error) {
      // console.error('Error inserting diary entry:', error)
      // 检查是否是唯一约束冲突
      if (error.code === '23505') { // PostgreSQL唯一约束冲突错误码
        return { success: false, message: '该日期已经存在日记，请选择其他日期或编辑现有日记' }
      }
      return { success: false, message: '添加日记时发生错误' }
    }

    return { success: true, data: convertFromSupabase(data) }
  } catch (error) {
    console.error('Failed to insert diary entry:', error)
    return { success: false, message: '添加日记时发生未知错误' }
  }
}

export async function updateDiaryEntry(id: number, entry: Partial<DiaryEntry>): Promise<DiaryEntry> {
  try {
    const supabaseEntry = convertToSupabase({ ...entry, modifiedAt: new Date() })
    
    const { data, error } = await supabase
      .from('diaryContent')
      .update(supabaseEntry)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      console.error('Error updating diary entry:', error)
      throw error
    }

    return convertFromSupabase(data)
  } catch (error) {
    console.error('Failed to update diary entry:', error)
    throw error
  }
}

export async function deleteDiaryEntry(id: number): Promise<void> {
  try {
    // 先删除相关的AI分析记录
    const { error: aiAnalysisError } = await supabase
      .from('diary_AI_analysis')
      .delete()
      .eq('diary_id', id)

    if (aiAnalysisError) {
      console.error('Error deleting AI analysis records:', aiAnalysisError)
      throw aiAnalysisError
    }

    // 再删除日记记录
    const { error: diaryError } = await supabase
      .from('diaryContent')
      .delete()
      .eq('id', id)

    if (diaryError) {
      console.error('Error deleting diary entry:', diaryError)
      throw diaryError
    }
  } catch (error) {
    console.error('Failed to delete diary entry:', error)
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
 * 保存AI分析结果到数据库，并更新日记的subtitle字段
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

    // 先更新日记的subtitle字段，但保留原有的modifiedAt时间
    // 首先获取当前日记以保留modifiedAt值
    const { data: currentDiary, error: fetchError } = await supabase
      .from('diaryContent')
      .select('modifiedAt')
      .eq('id', analysis.diary_id)
      .single();

    if (fetchError) {
      console.error('Error fetching current diary:', fetchError);
      throw fetchError;
    }

    // 更新subtitle，同时保留原有modifiedAt
    const { error: updateError } = await supabase
      .from('diaryContent')
      .update({
        subtitle: analysis.summary,
        modifiedAt: currentDiary.modifiedAt // 保留原有的modifiedAt时间
      })
      .eq('id', analysis.diary_id)

    if (updateError) {
      console.error('Error updating diary subtitle:', updateError)
      throw updateError
    }

    // 再保存新的AI分析结果
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
      if (error.code === 'PGRST116') {
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
  } catch (error) {
    console.error('Failed to fetch AI analysis:', error)
    throw error
  }
}

