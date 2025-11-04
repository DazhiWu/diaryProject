import { supabase } from './supabaseClient'
import { compressToUTF16, decompressFromUTF16 } from 'lz-string'

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
  return {
    id: entry.id,
    date: new Date(entry.date),
    subtitle: entry.subtitle,
    content: entry.content,
    images: entry.images,
    modifiedAt: entry.modifiedAt ? new Date(entry.modifiedAt) : null,
    created_at: entry.created_at ? new Date(entry.created_at) : undefined,
  }
}

function convertToSupabase(entry: Partial<DiaryEntry>): Partial<SupabaseDiaryEntry> {
  const result: Partial<SupabaseDiaryEntry> = {
    date: entry.date?.toISOString().split('T')[0], // Convert to date string
    subtitle: entry.subtitle,
    content: entry.content,
    images: entry.images || null,
  }
  
  // Only include modifiedAt if it's provided
  if (entry.modifiedAt) {
    result.modifiedAt = entry.modifiedAt.toISOString()
  }
  
  return result
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

export async function insertDiaryEntry(entry: Partial<DiaryEntry>): Promise<DiaryEntry> {
  try {
    const supabaseEntry = convertToSupabase(entry)
    
    const { data, error } = await supabase
      .from('diaryContent')
      .insert([supabaseEntry])
      .select('*')
      .single()

    if (error) {
      console.error('Error inserting diary entry:', error)
      throw error
    }

    return convertFromSupabase(data)
  } catch (error) {
    console.error('Failed to insert diary entry:', error)
    throw error
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
    const { error } = await supabase
      .from('diaryContent')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting diary entry:', error)
      throw error
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

