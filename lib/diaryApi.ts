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

    // 先更新日记的subtitle字段
    const { error: updateError } = await supabase
      .from('diaryContent')
      .update({ subtitle: analysis.summary })
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

