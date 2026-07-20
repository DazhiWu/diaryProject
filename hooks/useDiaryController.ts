"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { useAuth } from '@/hooks/useAuth'
import { diaryNeighbors, entriesVisibleForNavigation } from '@/lib/diaryNavigation'
import {
  deleteDiaryEntry,
  fetchCalendarEntries,
  fetchDiaryEntriesWithPagination,
  fetchDiaryEntryByDate,
  fetchDiaryEntryById,
  insertDiaryEntry,
  updateDiaryEntry,
  uploadDiaryImages,
  type DiaryEntry,
} from '@/lib/diaryApi'

export type DiaryView = 'list' | 'calendar' | 'new' | 'detail' | 'edit' | 'download' | 'yearly-summary' | 'message-board' | 'anonymous-message-board' | 'knowledge'
export type Entry = { id: number; date: Date; subtitle: string; content: string; images: string[]; modifiedAt: Date | null | undefined }

const entriesPerPage = 5
const minimumCalendarDate = new Date(2024, 10, 1)

function diaryImageUrls(paths: string[] | null | undefined, modifiedAt: Date | null | undefined): string[] {
  const version = modifiedAt?.toISOString() ?? ''
  return (paths ?? []).map((path) => `/api/media/diary?path=${encodeURIComponent(path)}&v=${encodeURIComponent(version)}`)
}

export function convertToEntry(entry: DiaryEntry): Entry {
  return { id: entry.id, date: entry.date, subtitle: entry.subtitle || `日记 ${entry.date.toLocaleDateString()}`, content: entry.content, images: diaryImageUrls(entry.images, entry.modifiedAt), modifiedAt: entry.modifiedAt }
}

export function useDiaryController() {
  const auth = useAuth()
  const isGuest = !auth.isAuthenticated
  const authReady = !auth.isLoading
  const [entries, setEntries] = useState<Entry[]>([])
  const [allEntries, setAllEntries] = useState<Entry[]>([])
  const [totalEntriesCount, setTotalEntriesCount] = useState(0)
  const [view, setView] = useState<DiaryView>('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date() >= minimumCalendarDate ? new Date() : minimumCalendarDate)

  const loadEntries = useCallback(async () => {
    setLoading(true)
    try {
      const result = await fetchDiaryEntriesWithPagination(isGuest ? 1 : currentPage, isGuest ? 5 : entriesPerPage, debouncedSearchQuery)
      setEntries(result.entries.map(convertToEntry))
      setTotalEntriesCount(isGuest ? Math.min(5, result.totalCount) : result.totalCount)
      if (result.entries.length > 0 && currentPage === 1) toast.success('日记加载成功')
    } catch (error) {
      console.error('Failed to load entries:', error)
      setEntries([])
      setTotalEntriesCount(0)
      toast.error('无法加载日记，请检查网络连接')
    } finally { setLoading(false) }
  }, [currentPage, debouncedSearchQuery, isGuest])

  const loadCalendarEntries = useCallback(async () => {
    try {
      const calendar = await fetchCalendarEntries()
      setAllEntries(calendar.map((item) => ({ id: item.id, date: item.date, subtitle: item.subtitle || `日记 ${item.date.toLocaleDateString()}`, content: '', images: [], modifiedAt: new Date() })))
      const firstPage = await fetchDiaryEntriesWithPagination(1, isGuest ? 5 : entriesPerPage, '')
      setEntries(firstPage.entries.map(convertToEntry))
      setTotalEntriesCount(isGuest ? Math.min(5, firstPage.totalCount) : firstPage.totalCount)
    } catch (error) {
      console.error('Failed to load calendar entries:', error)
      setAllEntries([])
    }
  }, [isGuest])

  useEffect(() => { const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 1_000); return () => clearTimeout(timer) }, [searchQuery])
  useEffect(() => { if (view !== 'calendar' && authReady) void loadEntries() }, [view, authReady, loadEntries])
  useEffect(() => { if (authReady) void loadCalendarEntries() }, [authReady, loadCalendarEntries])
  useEffect(() => { setCurrentPage(1) }, [debouncedSearchQuery, selectedDate])

  async function addEntry(content: string, subtitle: string, date: Date, files: File[]): Promise<boolean> {
    const entryDate = date || new Date()
    const defaultSubtitle = subtitle || entryDate.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    try {
      const result = await insertDiaryEntry({ date: entryDate, subtitle: defaultSubtitle, content, images: [] })
      if (!result.success || !result.data) { toast.error(result.message || '添加日记失败，请重试'); return false }
      if (files.length > 0) result.data.images = await uploadDiaryImages(files, result.data.id)
      setEntries((current) => [convertToEntry(result.data!), ...current])
      toast.success('日记添加成功')
      setView('list'); setCurrentPage(1)
      return true
    } catch (error) { console.error('Failed to add entry:', error); toast.error(`添加日记失败${error instanceof Error ? `: ${error.message}` : '，请重试'}`); return false }
  }

  async function updateEntry(id: number, content: string, subtitle: string, date: Date, files: File[]): Promise<boolean> {
    try {
      let imagePaths = selectedEntry?.id === id ? selectedEntry.images : entries.find((entry) => entry.id === id)?.images || []
      if (files.length > 0) imagePaths = await uploadDiaryImages(files, id)
      const converted = convertToEntry(await updateDiaryEntry(id, { content, subtitle, date, images: imagePaths }))
      setEntries((current) => current.map((entry) => entry.id === id ? converted : entry))
      setSelectedEntry(converted); setView('detail'); toast.success('日记更新成功')
      return true
    } catch (error) { console.error('Failed to update entry:', error); toast.error(`更新日记失败${error instanceof Error ? `: ${error.message}` : '，请重试'}`); return false }
  }

  async function deleteEntry(id: number) {
    try {
      await deleteDiaryEntry(id)
      setEntries((current) => current.filter((entry) => entry.id !== id))
      if (selectedEntry?.id === id) { setView('list'); setSelectedEntry(null) }
      toast.success('日记删除成功')
    } catch (error) { console.error('Failed to delete entry:', error); toast.error('删除日记失败') }
  }

  async function navigateToEntry(entry: Entry) {
    try {
      const full = await fetchDiaryEntryByDate(entry.date)
      if (!full) throw new Error('Diary not found')
      setSelectedEntry(convertToEntry(full))
    } catch (error) { console.error('获取日记内容失败:', error); setSelectedEntry(entry); toast.error('获取日记内容失败') }
  }

  async function openEntryById(id: number) {
    setLoading(true)
    try {
      setSelectedEntry(convertToEntry(await fetchDiaryEntryById(id)))
      setView('detail')
    } catch (error) {
      console.error('获取知识库来源日记失败:', error)
      toast.error('无法打开来源日记')
    } finally {
      setLoading(false)
    }
  }

  async function selectCalendarDate(date: Date) {
    setSelectedDate(date)
    const exists = allEntries.some((entry) => entry.date.toDateString() === date.toDateString())
    if (!exists) {
      if (isGuest) return void toast.error('暂无权限查看')
      if (!auth.isAdmin) return void toast.info('当天没有日记内容')
      setView('list'); toast.info(`没有找到${date.toLocaleDateString()}的日记，是否创建新日记？`, { action: { label: '创建日记', onClick: () => setView('new') } }); return
    }
    setLoading(true)
    try {
      const diary = await fetchDiaryEntryByDate(date)
      if (!diary) throw new Error('Diary not found')
      if (isGuest) {
        const firstPage = await fetchDiaryEntriesWithPagination(1, 5, '')
        if (!firstPage.entries.some((entry) => entry.id === diary.id)) return void toast.error('暂无权限查看')
      }
      setSelectedEntry(convertToEntry(diary)); setView('detail')
    } catch (error) { console.error('Error fetching diary entry by date:', error); toast.error('加载日记失败，请重试'); setView('list') }
    finally { setLoading(false) }
  }

  function mergeEntry(id: number, updates: Partial<Entry>) {
    setEntries((current) => current.map((entry) => entry.id === id ? { ...entry, ...updates } : entry))
    setSelectedEntry((current) => current?.id === id ? { ...current, ...updates } : current)
  }

  const navigation = useMemo(() => selectedEntry
    ? diaryNeighbors(entriesVisibleForNavigation(isGuest, entries, allEntries), selectedEntry.id)
    : { previous: null, next: null }, [isGuest, entries, allEntries, selectedEntry])

  return {
    auth, isGuest, entries, allEntries, entriesPerPage, totalEntriesCount, totalPages: Math.ceil(totalEntriesCount / entriesPerPage),
    view, setView, searchQuery, setSearchQuery, selectedDate, setSelectedDate, selectedEntry, setSelectedEntry, loading,
    currentPage, setCurrentPage, currentCalendarDate, setCurrentCalendarDate, addEntry, updateEntry, deleteEntry,
    loadEntries, navigateToEntry, openEntryById, selectCalendarDate, mergeEntry, navigation,
  }
}
