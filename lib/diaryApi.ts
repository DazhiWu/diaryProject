import { supabase } from './supabaseClient'

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

export function getLocalStorageBackup(): DiaryEntry[] {
  if (typeof window === 'undefined') return []
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return parsed.map((entry: any) => ({
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
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch (error) {
    console.error('Error saving localStorage backup:', error)
  }
}

