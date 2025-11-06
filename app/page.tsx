"use client"

import { useState, useEffect } from "react"
import { DiaryEntry } from "@/components/diary-entry"
import { DiaryList } from "@/components/diary-list"
import { CalendarView } from "@/components/calendar-view"
import { SearchBar } from "@/components/search-bar"
import { DiaryDetail } from "@/components/diary-detail"
import { Pagination } from "@/components/pagination"
import { Button } from "@/components/ui/button"
import { BookOpenIcon, CalendarIcon, ListIcon, PlusIcon } from "@/components/icons"
import { toast } from "sonner"
import { Spinner } from "@/components/ui/spinner"
import { AuthDialog } from "@/components/auth-dialog"
import { useAuth } from "@/hooks/useAuth"
import {
  fetchAllDiaryEntries,
  insertDiaryEntry,
  updateDiaryEntry,
  deleteDiaryEntry,
  isOnline,
  getLocalStorageBackup,
  saveLocalStorageBackup,
  type DiaryEntry as DiaryEntryType,
} from "@/lib/diaryApi"

export type Entry = {
  id: number
  date: Date
  subtitle: string
  content: string
  images: string[]
  modifiedAt: Date
}

export default function DiaryApp() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [view, setView] = useState<"list" | "calendar" | "new" | "detail" | "edit">("list")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false)
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

  useEffect(() => {
    loadEntries()
  }, [])

  const loadEntries = async () => {
    setLoading(true)
    try {
      if (isOnline()) {
        const supabaseEntries = await fetchAllDiaryEntries()
        setEntries(supabaseEntries)
        // Backup to localStorage
        saveLocalStorageBackup(supabaseEntries)
        if (supabaseEntries.length > 0) {
          toast.success("日记加载成功")
        }
      } else {
        // Fallback to localStorage
        const localEntries = getLocalStorageBackup()
        setEntries(localEntries)
        if (localEntries.length > 0) {
          toast.warning("网络离线，显示本地缓存")
        }
      }
    } catch (error) {
      console.error("Failed to load entries:", error)
      
      // Fallback to localStorage if Supabase fails
      const localEntries = getLocalStorageBackup()
      setEntries(localEntries)
      
      if (localEntries.length > 0) {
        toast.error("加载失败，显示本地缓存")
      } else {
        toast.error("无法加载日记，请检查网络连接")
      }
    } finally {
      setLoading(false)
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
          setEntries([result.data, ...entries])
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
        setEntries(entries.map((entry) => (entry.id === id ? updatedEntry : entry)))
        setSelectedEntry(updatedEntry)
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

  const filteredEntries = entries.filter((entry) => {
    const matchesSearch = entry.content.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesDate = selectedDate ? entry.date.toDateString() === selectedDate.toDateString() : true
    return matchesSearch && matchesDate
  })

  // 计算分页数据
  const totalPages = Math.ceil(filteredEntries.length / entriesPerPage)
  const startIndex = (currentPage - 1) * entriesPerPage
  const paginatedEntries = filteredEntries.slice(startIndex, startIndex + entriesPerPage)

  // 当搜索或过滤条件改变时，重置到第一页
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedDate])

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
            </div>
          </div>
        </div>
      </header>
      
      {/* 认证对话框移到header附近，确保在任何视图下都能显示 */}
      <AuthDialog open={isAuthDialogOpen} onOpenChange={setIsAuthDialogOpen} />

      <main className="mx-auto max-w-4xl px-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner className="mr-2 h-6 w-6" />
            <span className="text-muted-foreground">正在加载日记...</span>
          </div>
        ) : view === "new" ? (
          <DiaryEntry onSave={addEntry} onCancel={() => setView("list")} />
        ) : view === "edit" && selectedEntry ? (
          <DiaryEntry
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

            {view === "list" ? (
              <>
                <DiaryList
                  entries={paginatedEntries}
                  onViewDetail={viewEntryDetail}
                  onDelete={deleteEntry}
                  onNewEntry={() => setView("new")}
                  emptyMessage={
                    searchQuery || selectedDate
                      ? "No entries found matching your search."
                      : "No diary entries yet. Start writing your first entry!"
                  }
                />
                {filteredEntries.length > 0 && (
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    totalEntries={filteredEntries.length}
                    entriesPerPage={entriesPerPage}
                  />
                )}
              </>
            ) : (
              <CalendarView
                entries={entries}
                onDateSelect={(date) => {
                  setSelectedDate(date)
                  setView("list")
                }}
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}
