"use client"

import { useState, useEffect } from "react"
import { DiaryEntry as DiaryEntryComponent } from "@/components/diary-entry"
import { DiaryList } from "@/components/diary-list"
import { CalendarView } from "@/components/calendar-view"
import { SearchBar } from "@/components/search-bar"
import { DiaryDetail } from "@/components/diary-detail"
import { Pagination } from "@/components/pagination"
import { Button } from "@/components/ui/button"
import { BookOpenIcon, CalendarIcon, ListIcon, PlusIcon, DownloadIcon } from "@/components/icons"
import { QuarterlyAnalysis } from "@/components/quarterly-analysis"
import DiaryDownloader from "@/components/diary-downloader"
import { toast } from "sonner"
import { Spinner } from "@/components/ui/spinner"
import { AuthDialog } from "@/components/auth-dialog"
import { useAuth } from "@/hooks/useAuth"
import {
  fetchAllDiaryEntries,
  fetchDiaryEntriesWithPagination,
  fetchCalendarEntries,
  fetchDiaryEntryByDate,
  insertDiaryEntry,
  updateDiaryEntry,
  deleteDiaryEntry,
  isOnline,
  getLocalStorageBackup,
  saveLocalStorageBackup,
  type DiaryEntry as DiaryEntryType,
} from "@/lib/diaryApi"

// 确保Entry类型与DiaryEntry类型兼容
export type Entry = {
  id: number
  date: Date
  subtitle: string
  content: string
  images: string[]
  modifiedAt: Date | null | undefined
}

// 将DiaryEntryType转换为Entry类型
function convertToEntry(diaryEntry: DiaryEntryType): Entry {
  return {
    id: diaryEntry.id,
    date: diaryEntry.date,
    subtitle: diaryEntry.subtitle || `日记 ${diaryEntry.date.toLocaleDateString()}`,
    content: diaryEntry.content,
    images: diaryEntry.images || [],
    modifiedAt: diaryEntry.modifiedAt,
  }
}

export default function DiaryApp() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [allEntries, setAllEntries] = useState<Entry[]>([]) // 用于日历视图的所有条目
  const [totalEntriesCount, setTotalEntriesCount] = useState(0)
  const [view, setView] = useState<"list" | "calendar" | "new" | "detail" | "edit" | "quarterly" | "download">("list")
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("")
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false)
  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date())
  const auth = useAuth()
  const [localAuthState, setLocalAuthState] = useState(auth.isAuthenticated)
  const entriesPerPage = 5
  
  // 监听localStorage中认证状态的变化
  useEffect(() => {
    // 初始同步认证状态
    setLocalAuthState(auth.isAuthenticated);
    
    // 监听localStorage变化
    const handleStorageChange = () => {
      const storedAuthStatus = localStorage.getItem('diaryAppAuthStatus');
      setLocalAuthState(storedAuthStatus === 'authenticated');
    };
    
    // 添加事件监听器
    window.addEventListener('storage', handleStorageChange);
    
    // 清理函数
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [auth.isAuthenticated]);
  
  // 辅助函数获取当前认证状态
  const isAuthenticated = localAuthState || auth.isAuthenticated;

  // 实现搜索防抖功能
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 1000) // 2秒防抖延迟

    return () => clearTimeout(timer)
  }, [searchQuery])

  // 当页面、防抖搜索条件改变时重新加载分页数据
  useEffect(() => {
    if (view !== "calendar") {
      loadEntries()
    }
  }, [currentPage, debouncedSearchQuery, view])
  
  // 当切换到日历视图时，加载所有数据
  useEffect(() => {
    if (view === "calendar") {
      loadAllEntriesForCalendar()
    }
  }, [view])

  const loadEntries = async () => {
    setLoading(true)
    try {
      if (isOnline()) {
        // 使用分页API获取数据，支持搜索
        const result = await fetchDiaryEntriesWithPagination(
          currentPage,
          entriesPerPage,
          debouncedSearchQuery
        )
        
        setEntries(result.entries.map(convertToEntry))
        setTotalEntriesCount(result.totalCount)
        
        if (result.entries.length > 0 && currentPage === 1) {
          toast.success("日记加载成功")
        }
      } else {
        // 离线模式下，仍然使用本地缓存
        const localEntries = getLocalStorageBackup()
        
        // 模拟分页
        const filteredOfflineEntries = localEntries.filter(entry => 
          entry.content.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
          (entry.subtitle && entry.subtitle.toLowerCase().includes(debouncedSearchQuery.toLowerCase()))
        )
        
        const startIndex = (currentPage - 1) * entriesPerPage
        const paginatedOfflineEntries = filteredOfflineEntries.slice(
          startIndex,
          startIndex + entriesPerPage
        )
        
        setEntries(paginatedOfflineEntries.map(convertToEntry))
        setTotalEntriesCount(filteredOfflineEntries.length)
        
        if (localEntries.length > 0) {
          toast.warning("网络离线，显示本地缓存")
        }
      }
    } catch (error) {
      console.error("Failed to load entries:", error)
      
      // Supabase失败时回退到localStorage
      const localEntries = getLocalStorageBackup()
      
      // 模拟分页和搜索
        const filteredOfflineEntries = localEntries.filter(entry => 
          entry.content.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
          (entry.subtitle && entry.subtitle.toLowerCase().includes(debouncedSearchQuery.toLowerCase()))
        )
      
      const startIndex = (currentPage - 1) * entriesPerPage
      const paginatedOfflineEntries = filteredOfflineEntries.slice(
        startIndex,
        startIndex + entriesPerPage
      )
      
      setEntries(paginatedOfflineEntries.map(convertToEntry))
      setTotalEntriesCount(filteredOfflineEntries.length)
      
      if (localEntries.length > 0) {
        toast.error("加载失败，显示本地缓存")
      } else {
        toast.error("无法加载日记，请检查网络连接")
      }
    } finally {
      setLoading(false)
    }
  }
  
  // 专门为日历视图加载数据（只获取必要的ID和日期字段）
  const loadAllEntriesForCalendar = async () => {
    try {
      if (isOnline()) {
        // 使用优化的API只获取日历视图需要的ID和日期字段
        const calendarData = await fetchCalendarEntries()
        
        // 为日历视图创建简化的条目对象
        const calendarEntries: Entry[] = calendarData.map(item => ({
          id: item.id,
          date: item.date,
          subtitle: `日记 ${item.date.toLocaleDateString()}`,
          content: "", // 日历视图不需要完整内容
          images: [],
          modifiedAt: new Date()
        }))
        
        setAllEntries(calendarEntries)
        
        // 对于首页视图，仍然使用分页API获取完整数据
        const firstPageData = await fetchDiaryEntriesWithPagination(1, entriesPerPage, "")
        setEntries(firstPageData.entries.map(convertToEntry))
        setTotalEntriesCount(firstPageData.totalCount)
        
        // 可选：定期更新本地缓存，但不立即同步所有数据
        // 只在有网络连接时的空闲时间更新缓存
        // setTimeout(() => {
        //   fetchAllDiaryEntries().then(allEntriesData => {
        //     saveLocalStorageBackup(allEntriesData)
        //   }).catch(err => console.error("Failed to update backup:", err))
        // }, 5000)
      } else {
        // 离线模式使用本地缓存
        const localEntries = getLocalStorageBackup()
        const convertedEntries = localEntries.map(convertToEntry)
        setAllEntries(convertedEntries)
        setEntries(convertedEntries.slice(0, entriesPerPage))
        setTotalEntriesCount(convertedEntries.length)
      }
    } catch (error) {
      console.error("Failed to load calendar entries:", error)
      // 失败时使用本地缓存
      const localEntries = getLocalStorageBackup()
      setAllEntries(localEntries.map(convertToEntry))
    }
  }

  const addEntry = async (content: string, subtitle: string, date: Date, images: string[]) => {
    const entryDate = date || new Date()
    const defaultSubtitle = subtitle ||
      entryDate.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })

    try {
      if (isOnline()) {
        // Save to Supabase
        const result = await insertDiaryEntry({
          date: entryDate,
          subtitle: defaultSubtitle,
          content,
          images,
        })
        
        if (result.success && result.data) {
          if (result.data) {
        setEntries([convertToEntry(result.data), ...entries])
      }
          toast.success("日记添加成功")
        } else {
          // 显示友好的提醒信息而不是错误
          toast.info(result.message || "添加日记失败")
          return // 不切换视图，让用户有机会修改日期
        }
      } else {
        // Offline mode - temporary entry
        const tempEntry: Entry = {
          id: Math.floor(Date.now() / 1000),
          date: entryDate,
          subtitle: defaultSubtitle,
          content,
          images,
          modifiedAt: new Date()
        }
        setEntries([tempEntry, ...entries])
        toast.warning("网络离线，日记已保存到本地")
      }
      setView("list")
      setCurrentPage(1) // 添加新日记后回到第一页
    } catch (error) {
      console.error("Failed to add entry:", error)
      toast.error("添加日记失败")
    }
  }

  const updateEntry = async (id: number, content: string, subtitle: string, date: Date, images: string[]) => {
    try {
      if (isOnline()) {
        // Update in Supabase
        const updatedEntry = await updateDiaryEntry(id, {
          content,
          subtitle: subtitle,
          date: date,
          images,
        })
        const convertedUpdatedEntry = convertToEntry(updatedEntry)
        setEntries(entries.map((entry) => (entry.id === id ? convertedUpdatedEntry : entry)))
        setSelectedEntry(convertedUpdatedEntry)
        toast.success("日记更新成功")
      } else {
        // Offline mode
        const existingEntry = entries.find((entry) => entry.id === id)
        if (existingEntry) {
          const newEntry = {
            ...existingEntry,
            content,
            subtitle: subtitle || existingEntry.subtitle,
            date: date || existingEntry.date,
            images,
            modifiedAt: new Date(),
          }
          setEntries(entries.map((entry) => (entry.id === id ? newEntry : entry)))
          setSelectedEntry(newEntry)
          toast.warning("网络离线，更新已保存到本地")
        }
      }
      setView("detail")
    } catch (error) {
      console.error("Failed to update entry:", error)
      toast.error("更新日记失败")
    }
  }

  const deleteEntry = async (id: number) => {
    try {
      if (isOnline()) {
        // Delete from Supabase
        await deleteDiaryEntry(id)
        setEntries(entries.filter((entry) => entry.id !== id))
        toast.success("日记删除成功")
      } else {
        // Offline mode
        setEntries(entries.filter((entry) => entry.id !== id))
        toast.warning("网络离线，已从本地删除")
      }
      
      if (selectedEntry?.id === id) {
        setView("list")
        setSelectedEntry(null)
      }
    } catch (error) {
      console.error("Failed to delete entry:", error)
      toast.error("删除日记失败")
    }
  }

  const viewEntryDetail = (entry: Entry) => {
    setSelectedEntry(entry)
    setView("detail")
  }

  const editEntry = (entry: Entry) => {
    setSelectedEntry(entry)
    setView("edit")
  }

  // 使用服务器分页数据，不再需要客户端过滤和分页
  const paginatedEntries = entries
  const totalPages = Math.ceil(totalEntriesCount / entriesPerPage)

  // 当防抖搜索或过滤条件改变时，重置到第一页
  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearchQuery, selectedDate])

  const handleProtectedAction = (action: () => void, actionName: string) => {
    // 再次检查localStorage确保状态最新
    const storedAuthStatus = localStorage.getItem('diaryAppAuthStatus') === 'authenticated';
    if (storedAuthStatus || isAuthenticated) {
      action();
    } else {
      toast.error(`请先进行管理员认证才能${actionName}`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-4xl px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BookOpenIcon className="h-8 w-8 text-primary" />
              <h1 className="text-2xl font-semibold text-foreground">My Diary</h1>
            </div>
            <div className="flex items-center gap-2">
              {/* 管理员认证按钮始终显示 */}
              <Button onClick={() => setIsAuthDialogOpen(true)} variant="outline" size="sm">
                管理员认证
              </Button>
              <Button onClick={() => handleProtectedAction(() => setView("new"), "添加日记")} size="sm" className="gap-2">
                <PlusIcon className="h-4 w-4" />
                New Entry
              </Button>
              <Button onClick={() => handleProtectedAction(() => setView("quarterly"), "访问季度分析")} variant="outline" size="sm" className="gap-2">
                季度分析【难产了】
              </Button>
              <Button onClick={() => handleProtectedAction(() => setView("download"), "下载日记")} variant="outline" size="sm" className="gap-2">
                <DownloadIcon className="h-4 w-4" />
                下载日记
              </Button>
            </div>
          </div>
        </div>
      </header>
      
      {/* 认证对话框移到header附近，确保在任何视图下都能显示 */}
      <AuthDialog open={isAuthDialogOpen} onOpenChange={setIsAuthDialogOpen} />

      <main className="mx-auto max-w-4xl px-4 py-8">
        {/* 确保搜索栏始终可见，即使在加载状态 */}
        {(view === "list" || view === "calendar") && (
          <div className="mb-6 space-y-4">
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              onClear={() => {
                setSearchQuery("")
                setSelectedDate(null)
              }}
            />

            <div className="flex gap-2">
              <Button
                variant={view === "list" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setView("list")
                  setSelectedDate(null)
                }}
                className="gap-2"
              >
                <ListIcon className="h-4 w-4" />
                List
              </Button>
              <Button
                variant={view === "calendar" ? "default" : "outline"}
                size="sm"
                onClick={() => setView("calendar")}
                className="gap-2"
              >
                <CalendarIcon className="h-4 w-4" />
                Calendar
              </Button>
            </div>
          </div>
        )}
        
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner className="mr-2 h-6 w-6" />
            <span className="text-muted-foreground">正在加载日记...</span>
          </div>
        ) : view === "new" ? (
          <DiaryEntryComponent 
            entry={selectedDate ? { 
              id: 0, 
              date: selectedDate, 
              subtitle: "", 
              content: "", 
              images: [],
              modifiedAt: new Date()
            } : undefined} 
            onSave={addEntry} 
            onCancel={() => setView("list")} 
          />
        ) : view === "edit" && selectedEntry ? (
          <DiaryEntryComponent
            entry={selectedEntry}
            onSave={(content, subtitle, date, images) => updateEntry(selectedEntry.id, content, subtitle, date, images)}
            onCancel={() => setView("detail")}
          />
        ) : view === "detail" && selectedEntry ? (
          <DiaryDetail 
  entry={selectedEntry} 
  onBack={() => setView("list")} 
  onDelete={deleteEntry} 
  onEdit={editEntry} 
  onUpdateEntry={(id, updates) => {
    setEntries(entries.map(entry => 
      entry.id === id ? { ...entry, ...updates } : entry
    ));
    if (selectedEntry && selectedEntry.id === id) {
      setSelectedEntry({ ...selectedEntry, ...updates });
    }
  }}
/>
        ) : (
          <>
            {/* 搜索栏和视图切换按钮已移到上方，始终可见 */}

            {view === "list" ? (
              <>
                <DiaryList
                  entries={paginatedEntries}
                  onViewDetail={viewEntryDetail}
                  onDelete={deleteEntry}
                  onNewEntry={() => setView("new")}
                  emptyMessage={
                    searchQuery
                      ? "No entries found matching your search."
                      : "No diary entries yet. Start writing your first entry!"
                  }
                />
                {totalEntriesCount > 0 && (
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    totalEntries={totalEntriesCount}
                    entriesPerPage={entriesPerPage}
                  />
                )}
              </>
            ) : view === "calendar" ? (
              <CalendarView
                entries={allEntries.length > 0 ? allEntries : entries} // 优先使用所有条目
                currentDate={currentCalendarDate}
                onDateChange={setCurrentCalendarDate}
                onDateSelect={(date) => {
                  setSelectedDate(date)
                  
                  // 首先从allEntries中检查该日期是否有日记（allEntries包含所有日期的精简信息）
                  const hasEntryForDate = allEntries.some(entry => {
                    return new Date(entry.date).toDateString() === date.toDateString()
                  })
                  
                  if (hasEntryForDate) {
                    // 如果该日期有日记，直接从数据库查询该日期的完整日记数据
                    setLoading(true)
                    
                    // 使用日期筛选查询该日期的日记
                        const fetchEntryByDate = async () => {
                          try {
                            // 使用新添加的fetchDiaryEntryByDate函数直接从数据库查询该日期的日记
                            const diaryEntry = await fetchDiaryEntryByDate(date)
                            
                            if (diaryEntry) {
                              // 将Supabase返回的DiaryEntryType转换为页面使用的Entry类型
                              const entryToShow = convertToEntry(diaryEntry)
                              setSelectedEntry(entryToShow)
                              setView("detail")
                            } else {
                              // 虽然allEntries显示有日记，但实际查询没找到
                              setView("list")
                              toast.info(`未找到${date.toLocaleDateString()}的日记详情`, {
                                action: {
                                  label: "创建日记",
                                  onClick: () => setView("new")
                                }
                              })
                            }
                      } catch (error) {
                        console.error('Error fetching diary entry by date:', error)
                        toast.error('加载日记失败，请重试')
                        setView("list")
                      } finally {
                        setLoading(false)
                      }
                    }
                    
                    fetchEntryByDate()
                  } else {
                    // 如果该日期确实没有日记
                    setView("list")
                    toast.info(`没有找到${date.toLocaleDateString()}的日记，是否创建新日记？`, {
                      action: {
                        label: "创建日记",
                        onClick: () => setView("new")
                      }
                    })
                  }
                }}
              />
            ) : view === "download" ? (
              <DiaryDownloader />
            ) : (
              <QuarterlyAnalysis />
            )}
          </>
        )}
      </main>
    </div>
  )
}
