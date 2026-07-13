"use client"

import { useState, useEffect } from "react"
import { DiaryEntry as DiaryEntryComponent } from "@/components/diary-entry"
import { DiaryList } from "@/components/diary-list"
import { CalendarView } from "@/components/calendar-view"
import { SearchBar } from "@/components/search-bar"
import { DiaryDetail } from "@/components/diary-detail"
import { Pagination } from "@/components/pagination"
import { Button } from "@/components/ui/button"
import { BookOpenIcon, CalendarIcon, ListIcon, PlusIcon, DownloadIcon, MessageSquareIcon, SettingsIcon } from "@/components/icons"
import DiaryDownloader from "@/components/diary-downloader"
import YearlySummary from "@/components/yearly-summary"
import { MessageBoard } from "@/components/message-board"
import { AnonymousMessageBoard } from "@/components/anonymous-message-board"
import { HealthConditionDialog } from "@/components/health-condition-dialog"
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
  uploadDiaryImages,
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
  const [view, setView] = useState<"list" | "calendar" | "new" | "detail" | "edit" | "download" | "yearly-summary" | "message-board" | "anonymous-message-board">("list")
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("")
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false)
  const [isHealthConditionDialogOpen, setIsHealthConditionDialogOpen] = useState(false)
  // 定义最小日期为2024年11月1日
  const minDate = new Date(2024, 10, 1)
  // 确保初始日历日期不早于最小日期
  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date() >= minDate ? new Date() : minDate)
// 认证状态
  const auth = useAuth()
  const entriesPerPage = 5
  
  // 直接使用useAuth钩子返回的认证状态
  const isAuthenticated = auth.isAuthenticated;
  const isAdmin = auth.isAdmin;
  const isViewer = auth.isViewer;
  const isGuest = !isAuthenticated;

  const authReady = !auth.isLoading;

  // 当认证状态就绪或变化时重新加载日记列表，确保分页显示正确
  useEffect(() => {
    if (authReady) {
      loadEntries();
    }
  }, [auth.authLevel, authReady]);

  // 实现搜索防抖功能
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 1000) // 2秒防抖延迟

    return () => clearTimeout(timer)
  }, [searchQuery])

  // 当页面、防抖搜索条件改变时重新加载分页数据
  useEffect(() => {
    if (view !== "calendar" && authReady) {
      loadEntries()
    }
  }, [currentPage, debouncedSearchQuery, view, authReady])
  
  // 在应用启动时加载所有日记条目，用于上下篇导航
  useEffect(() => {
    if (authReady) {
      // 无论当前视图是什么，都加载所有日记条目用于导航
      loadAllEntriesForCalendar()
    }
  }, [authReady])

  const loadEntries = async () => {
    setLoading(true)
    // 在函数开始时捕获当前的认证状态，避免异步过程中状态变化导致的问题
    const currentIsGuest = isGuest;
    const currentCurrentPage = currentPage;
    const currentEntriesPerPage = entriesPerPage;
    
    try {
      if (isOnline()) {
        // 使用分页API获取数据，支持搜索
        const result = await fetchDiaryEntriesWithPagination(
          currentIsGuest ? 1 : currentCurrentPage, // 访客只能看第一页
          currentIsGuest ? 5 : currentEntriesPerPage, // 访客只能看5条
          debouncedSearchQuery
        )
        
        const entriesWithUrls = result.entries.map(convertToEntry)
        
        setEntries(entriesWithUrls)
        setTotalEntriesCount(currentIsGuest ? 5 : result.totalCount) // 访客显示最多5条
        
        if (result.entries.length > 0 && currentCurrentPage === 1) {
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
        
        // 将图片路径转换为完整的URL
        const entriesWithUrls = filteredOfflineEntries.map(entry => {
          const imageUrls = entry.images || []
          return {
            ...convertToEntry(entry),
            images: imageUrls
          }
        })
        
        const startIndex = currentIsGuest ? 0 : (currentCurrentPage - 1) * currentEntriesPerPage
        const endIndex = currentIsGuest ? 5 : startIndex + currentEntriesPerPage
        const paginatedOfflineEntries = entriesWithUrls.slice(
          startIndex,
          endIndex
        )
        
        setEntries(paginatedOfflineEntries)
        setTotalEntriesCount(currentIsGuest ? Math.min(5, entriesWithUrls.length) : entriesWithUrls.length)
        
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
      
      // 将图片路径转换为完整的URL
      const entriesWithUrls = filteredOfflineEntries.map(entry => {
        const imageUrls = entry.images || []
        return {
          ...convertToEntry(entry),
          images: imageUrls
        }
      })
      
      const startIndex = currentIsGuest ? 0 : (currentCurrentPage - 1) * currentEntriesPerPage
      const endIndex = currentIsGuest ? 5 : startIndex + currentEntriesPerPage
      const paginatedOfflineEntries = entriesWithUrls.slice(
        startIndex,
        endIndex
      )
      
      setEntries(paginatedOfflineEntries)
      setTotalEntriesCount(currentIsGuest ? Math.min(5, entriesWithUrls.length) : entriesWithUrls.length)
      
      if (localEntries.length > 0) {
        toast.error("加载失败，显示本地缓存")
      } else {
        toast.error("无法加载日记，请检查网络连接")
      }
    } finally {
      setLoading(false)
    }
  }
  
  // 专门为日历视图加载数据（包含subtitle以支持标题检测）
  const loadAllEntriesForCalendar = async () => {
    try {
      // 在函数开始时捕获当前的认证状态，避免异步过程中状态变化导致的问题
      const currentIsGuest = isGuest;
      const currentEntriesPerPage = entriesPerPage;
      
      if (isOnline()) {
        // 使用优化的API获取日历视图需要的字段，现在包含subtitle
        const calendarData = await fetchCalendarEntries()
        
        // 为日历视图创建简化的条目对象，使用实际的subtitle
        const calendarEntries: Entry[] = calendarData.map(item => ({
          id: item.id,
          date: item.date,
          subtitle: item.subtitle || `日记 ${item.date.toLocaleDateString()}`,
          content: "", // 日历视图不需要完整内容
          images: [],
          modifiedAt: new Date()
        }))
        
        setAllEntries(calendarEntries)
        
        // 对于首页视图，仍然使用分页API获取完整数据
        const firstPageData = await fetchDiaryEntriesWithPagination(1, currentIsGuest ? 5 : currentEntriesPerPage, "")
        // 将图片路径转换为完整的URL
        const entriesWithUrls = firstPageData.entries.map(entry => {
          const imageUrls = entry.images || []
          return {
            ...convertToEntry(entry),
            images: imageUrls
          }
        })
        setEntries(entriesWithUrls)
        setTotalEntriesCount(currentIsGuest ? 5 : firstPageData.totalCount)
        
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
        // 将图片路径转换为完整的URL
        const entriesWithUrls = localEntries.map(entry => {
          const imageUrls = entry.images || []
          return {
            ...convertToEntry(entry),
            images: imageUrls
          }
        })
        setAllEntries(entriesWithUrls)
        setEntries(entriesWithUrls.slice(0, currentIsGuest ? 5 : currentEntriesPerPage))
        setTotalEntriesCount(currentIsGuest ? 5 : entriesWithUrls.length)
      }
    } catch (error) {
      console.error("Failed to load calendar entries:", error)
      // 失败时使用本地缓存
      const localEntries = getLocalStorageBackup()
      // 将图片路径转换为完整的URL
      const entriesWithUrls = localEntries.map(entry => {
        const imageUrls = entry.images || []
        return {
          ...convertToEntry(entry),
          images: imageUrls
        }
      })
      // 确保在错误处理时也使用正确的认证状态
      const currentIsGuest = isGuest;
      setAllEntries(entriesWithUrls)
      setEntries(entriesWithUrls.slice(0, currentIsGuest ? 5 : entriesPerPage))
      setTotalEntriesCount(currentIsGuest ? 5 : entriesWithUrls.length)
    }
  }

  const addEntry = async (content: string, subtitle: string, date: Date, files: File[]): Promise<boolean> => {
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
        let imagePaths: string[] = []
        
        // 上传图片到 Supabase Storage
        if (files.length > 0) {
          imagePaths = await uploadDiaryImages(files, entryDate)
        }
        
        // Save to Supabase
        const result = await insertDiaryEntry({
          date: entryDate,
          subtitle: defaultSubtitle,
          content,
          images: imagePaths,
        })
        
        if (result.success && result.data) {
          if (result.data) {
            setEntries([convertToEntry(result.data), ...entries])
          }
          toast.success("日记添加成功")
          setView("list")
          setCurrentPage(1) // 添加新日记后回到第一页
          return true
        } else {
          // 显示友好的提醒信息而不是错误
          toast.error(result.message || "添加日记失败，请重试")
          return false
        }
      } else {
        // Offline mode - temporary entry
        const tempEntry: Entry = {
          id: Math.floor(Date.now() / 1000),
          date: entryDate,
          subtitle: defaultSubtitle,
          content,
          images: [], // 离线模式不保存图片
          modifiedAt: new Date()
        }
        setEntries([tempEntry, ...entries])
        toast.warning("网络离线，日记已保存到本地（图片未保存）")
        setView("list")
        setCurrentPage(1)
        return true
      }
    } catch (error) {
      console.error("Failed to add entry:", error)
      let errorMessage = "添加日记失败，请重试"
      if (error instanceof Error) {
        errorMessage = `添加日记失败: ${error.message}`
      }
      toast.error(errorMessage)
      return false
    }
  }

  const updateEntry = async (id: number, content: string, subtitle: string, date: Date, files: File[]): Promise<boolean> => {
    try {
      if (isOnline()) {
        let imagePaths: string[] = selectedEntry?.id === id ? selectedEntry.images : entries.find((entry) => entry.id === id)?.images || [];
        
        // 只有当有新文件上传时才更新图片路径
        if (files.length > 0) {
          imagePaths = await uploadDiaryImages(files, date)
        }
        
        // Update in Supabase
        const updatedEntry = await updateDiaryEntry(id, {
          content,
          subtitle: subtitle,
          date: date,
          images: imagePaths,
        })
        const convertedUpdatedEntry = convertToEntry(updatedEntry)
        setEntries(entries.map((entry) => (entry.id === id ? convertedUpdatedEntry : entry)))
        setSelectedEntry(convertedUpdatedEntry)
        toast.success("日记更新成功")
        setView("detail")
        return true
      } else {
        // Offline mode
        const existingEntry = entries.find((entry) => entry.id === id)
        if (existingEntry) {
          // 离线模式下，我们只能使用本地存储的路径
          // 为了避免问题，我们需要确保只保存相对路径
          // 这里我们简单地保持原有图片路径不变
          const newEntry = {
            ...existingEntry,
            content,
            subtitle: subtitle || existingEntry.subtitle,
            date: date || existingEntry.date,
            images: existingEntry.images,
            modifiedAt: new Date(),
          }
          setEntries(entries.map((entry) => (entry.id === id ? newEntry : entry)))
          setSelectedEntry(newEntry)
          toast.warning("网络离线，更新已保存到本地（图片未更新）")
          setView("detail")
          return true
        }
        toast.error("未找到要更新的日记")
        return false
      }
    } catch (error) {
      console.error("Failed to update entry:", error)
      let errorMessage = "更新日记失败，请重试"
      if (error instanceof Error) {
        errorMessage = `更新日记失败: ${error.message}`
      }
      toast.error(errorMessage)
      return false
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

  const handleProtectedAction = (action: () => void, actionName: string, requiredLevel: 'viewer' | 'admin' = 'admin') => {
    if (auth.authLevel === 'admin' || (requiredLevel === 'viewer' && auth.authLevel === 'viewer')) {
      action();
    } else {
      toast.error(`请先进行管理员认证才能${actionName}`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm shadow-sm">
        <div className="mx-auto max-w-4xl px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BookOpenIcon className="h-9 w-9 text-primary" />
              <h1 className="text-2xl font-semibold text-foreground tracking-tight">致致日记</h1>
            </div>
            <div className="flex items-center gap-2">
              {/* 用户认证按钮始终显示 */}
              <Button onClick={() => setIsAuthDialogOpen(true)} variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">
                用户认证
              </Button>
              
              {/* 仅管理员可写入或导出 */}
              {isAdmin && (
                <>
                  <Button onClick={() => handleProtectedAction(() => setView("new"), "添加日记")} size="sm" className="gap-2 bg-primary/90 hover:bg-primary">
                    <PlusIcon className="h-4 w-4" />
                    写日记
                  </Button>
                  
                  <Button onClick={() => handleProtectedAction(() => setView("download"), "下载日记")} variant="outline" size="sm" className="gap-2">
                    <DownloadIcon className="h-4 w-4" />
                    下载
                  </Button>
                </>
              )}
              
              {/* 年度总结按钮始终显示，不需要认证 */}
              <Button onClick={() => setView("yearly-summary")} variant="outline" size="sm" className="gap-2">
                <BookOpenIcon className="h-4 w-4" />
                年度总结
              </Button>
            </div>
          </div>
        </div>
      </header>
      
      {/* 认证对话框移到header附近，确保在任何视图下都能显示 */}
      <AuthDialog open={isAuthDialogOpen} onOpenChange={setIsAuthDialogOpen} />
      
      {/* 生病异常设置对话框 */}
      <HealthConditionDialog open={isHealthConditionDialogOpen} onOpenChange={setIsHealthConditionDialogOpen} />

      <main className="mx-auto max-w-4xl px-4 py-8">
        {/* 搜索栏 - 仅在列表/日历视图且非访客时显示 */}
        {(view === "list" || view === "calendar") && !isGuest && (
          <div className="mb-4">
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              onClear={() => {
                setSearchQuery("")
                setSelectedDate(null)
              }}
            />
          </div>
        )}

        {/* 视图切换按钮 - 在列表、日历、音频记录和匿名留言板视图下显示 */}
        {(view === "list" || view === "calendar" || view === "message-board" || view === "anonymous-message-board") && (
          <div className="mb-6">
            <div className="flex flex-wrap gap-2">
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
                列表视图
              </Button>
              <Button
                variant={view === "calendar" ? "default" : "outline"}
                size="sm"
                onClick={() => setView("calendar")}
                className="gap-2"
              >
                <CalendarIcon className="h-4 w-4" />
                日历视图
              </Button>
              <Button
                variant={view === "anonymous-message-board" ? "default" : "outline"}
                size="sm"
                onClick={() => setView("anonymous-message-board")}
                className="gap-2"
              >
                <MessageSquareIcon className="h-4 w-4" />
                匿名留言板
              </Button>
              <Button
                variant={view === "message-board" ? "default" : "outline"}
                size="sm"
                onClick={() => setView("message-board")}
                disabled={!isAdmin}
                className="gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title={isAdmin ? "音频记录" : "需要管理员权限"}
              >
                <MessageSquareIcon className="h-4 w-4" />
                音频记录
              </Button>
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleProtectedAction(() => setIsHealthConditionDialogOpen(true), "设置生病异常")}
                  className="gap-2"
                >
                  <SettingsIcon className="h-4 w-4" />
                  生病异常设置
                </Button>
              )}
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
            onSave={(content, subtitle, date, files) => updateEntry(selectedEntry.id, content, subtitle, date, files)}
            onCancel={() => setView("detail")}
          />
        ) : view === "detail" && selectedEntry ? (
          <DiaryDetail 
  entry={selectedEntry} 
  onBack={() => {
    setView("list");
    // 从详情页返回列表页时，强制刷新列表数据
    loadEntries();
  }} 
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
  // 使用内联表达式计算上一篇和下一篇日记
  previousEntry={(() => {
    // 对于已认证用户（viewer和admin），使用allEntries数组获取所有日记进行翻页
    // 对于访客，使用entries数组（最近5篇）
    const allowedEntries = isGuest ? entries : allEntries;
    
    // 按日期排序（从早到晚）
    const sortedEntries = [...allowedEntries].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    // 找到当前日记的索引
    const currentIndex = sortedEntries.findIndex(entry => entry.id === selectedEntry.id);
    // 上一篇：日期比当前小的日记（索引减1）
    return currentIndex > 0 ? sortedEntries[currentIndex - 1] : null;
  })()}
  nextEntry={(() => {
    // 对于已认证用户（viewer和admin），使用allEntries数组获取所有日记进行翻页
    // 对于访客，使用entries数组（最近5篇）
    const allowedEntries = isGuest ? entries : allEntries;
    // 按日期排序（从早到晚）
    const sortedEntries = [...allowedEntries].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    // 找到当前日记的索引
    const currentIndex = sortedEntries.findIndex(entry => entry.id === selectedEntry.id);
    // 下一篇：日期比当前大的日记（索引加1）
    return currentIndex < sortedEntries.length - 1 ? sortedEntries[currentIndex + 1] : null;
  })()}
  onNavigateToEntry={async (entry) => {
    // 导航到指定的日记
    // 首先获取完整的日记内容
    try {
      // 使用fetchDiaryEntryByDate函数获取完整的日记内容
      const fullEntry = await fetchDiaryEntryByDate(entry.date);
      if (fullEntry) {
        // 将图片路径转换为完整的URL
        const imageUrls = fullEntry.images || []
        const convertedEntry = {
          ...convertToEntry(fullEntry),
          images: imageUrls
        }
        setSelectedEntry(convertedEntry);
      } else {
        // 如果获取失败，使用当前entry（可能缺少content和images）
        setSelectedEntry(entry);
        toast.error("获取日记内容失败");
      }
    } catch (error) {
      console.error("获取日记内容失败:", error);
      // 如果获取失败，使用当前entry（可能缺少content和images）
      setSelectedEntry(entry);
      toast.error("获取日记内容失败");
    }
    // 不需要改变view，因为已经在detail视图
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
                onDateSelect={async (date) => {
                  setSelectedDate(date)
                  
                  // 首先从allEntries中检查该日期是否有日记（allEntries包含所有日期的精简信息）
                  const hasEntryForDate = allEntries.some(entry => {
                    return new Date(entry.date).toDateString() === date.toDateString()
                  })
                  
                  // 检查该日期的日记是否在访客允许查看的范围内
                  const isAllowedToView = async () => {
                    if (!isGuest) {
                      return true; // 非访客可以查看所有日记
                    }
                    
                    // 获取访客可以查看的日记ID列表
                    const firstPageEntries = await fetchDiaryEntriesWithPagination(1, 5, "");
                    const allowedEntryIds = new Set(firstPageEntries.entries.map(entry => entry.id));
                    
                    // 检查该日期的日记是否在允许查看的范围内
                    const diaryEntry = await fetchDiaryEntryByDate(date);
                    return diaryEntry ? allowedEntryIds.has(diaryEntry.id) : false;
                  };
                  
                  if (hasEntryForDate) {
                    // 检查访客是否有权限查看该日记
                    setLoading(true);
                    
                    const canView = await isAllowedToView();
                    
                    if (canView) {
                      // 如果该日期有日记且访客有权限查看，直接从数据库查询该日期的完整日记数据
                      const fetchEntryByDate = async () => {
                        try {
                          // 使用新添加的fetchDiaryEntryByDate函数直接从数据库查询该日期的日记
                          const diaryEntry = await fetchDiaryEntryByDate(date);
                          
                          if (diaryEntry) {
                            // 将Supabase返回的DiaryEntryType转换为页面使用的Entry类型
                            const entryToShow = convertToEntry(diaryEntry);
                            setSelectedEntry(entryToShow);
                            setView("detail");
                          } else {
                            // 虽然allEntries显示有日记，但实际查询没找到
                            setView("list");
                            toast.info(`未找到${date.toLocaleDateString()}的日记详情`, {
                              action: {
                                label: "创建日记",
                                onClick: () => setView("new")
                              }
                            });
                          }
                        } catch (error) {
                          console.error('Error fetching diary entry by date:', error);
                          toast.error('加载日记失败，请重试');
                          setView("list");
                        } finally {
                          setLoading(false);
                        }
                      };
                      
                      fetchEntryByDate();
                    } else {
                      // 访客无权查看该日记
                      setLoading(false);
                      toast.error('您没有权限查看此日记，请先进行认证');
                    }
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
            ) : view === "yearly-summary" ? (
              <YearlySummary onBack={() => setView("list")} />
            ) : view === "message-board" ? (
              <MessageBoard />
            ) : view === "anonymous-message-board" ? (
              <AnonymousMessageBoard />
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                未知视图
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
