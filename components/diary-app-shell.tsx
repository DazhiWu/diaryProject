"use client"

import { useState, type ReactNode } from 'react'

import { AuthDialog } from '@/components/auth-dialog'
import { HealthConditionDialog } from '@/components/health-condition-dialog'
import { BookOpenIcon, CalendarIcon, DownloadIcon, ListIcon, MessageSquareIcon, PlusIcon, SearchIcon, SettingsIcon } from '@/components/icons'
import { SearchBar } from '@/components/search-bar'
import { Button } from '@/components/ui/button'
import type { DiaryView } from '@/hooks/useDiaryController'

export function DiaryAppShell({
  children,
  isAdmin,
  isGuest,
  onClearSearch,
  searchQuery,
  setSearchQuery,
  setView,
  view,
}: {
  children: ReactNode
  isAdmin: boolean
  isGuest: boolean
  onClearSearch: () => void
  searchQuery: string
  setSearchQuery: (value: string) => void
  setView: (view: DiaryView) => void
  view: DiaryView
}) {
  const [authOpen, setAuthOpen] = useState(false)
  const [healthOpen, setHealthOpen] = useState(false)
  const showsNavigation = view === 'list' || view === 'calendar' || view === 'message-board' || view === 'anonymous-message-board' || view === 'knowledge'

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm shadow-sm">
        <div className="mx-auto max-w-4xl px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3"><BookOpenIcon className="h-9 w-9 text-primary" /><h1 className="text-2xl font-semibold text-foreground tracking-tight">致致日记</h1></div>
            <div className="flex items-center gap-2">
              <Button onClick={() => setAuthOpen(true)} variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">用户认证</Button>
              {isAdmin && <>
                <Button onClick={() => setView('new')} size="sm" className="gap-2 bg-primary/90 hover:bg-primary"><PlusIcon className="h-4 w-4" />写日记</Button>
                <Button onClick={() => setView('download')} variant="outline" size="sm" className="gap-2"><DownloadIcon className="h-4 w-4" />下载</Button>
              </>}
              <Button onClick={() => setView('yearly-summary')} variant="outline" size="sm" className="gap-2"><BookOpenIcon className="h-4 w-4" />年度总结</Button>
            </div>
          </div>
        </div>
      </header>

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
      <HealthConditionDialog open={healthOpen} onOpenChange={setHealthOpen} />

      <main className="mx-auto max-w-4xl px-4 py-8">
        {(view === 'list' || view === 'calendar') && !isGuest && <div className="mb-4"><SearchBar value={searchQuery} onChange={setSearchQuery} onClear={onClearSearch} /></div>}
        {showsNavigation && <div className="mb-6"><div className="flex flex-wrap gap-2">
          <Button variant={view === 'list' ? 'default' : 'outline'} size="sm" onClick={() => setView('list')} className="gap-2"><ListIcon className="h-4 w-4" />列表视图</Button>
          <Button variant={view === 'calendar' ? 'default' : 'outline'} size="sm" onClick={() => setView('calendar')} className="gap-2"><CalendarIcon className="h-4 w-4" />日历视图</Button>
          <Button variant={view === 'anonymous-message-board' ? 'default' : 'outline'} size="sm" onClick={() => setView('anonymous-message-board')} className="gap-2"><MessageSquareIcon className="h-4 w-4" />匿名留言板</Button>
          {isAdmin && <Button variant={view === 'knowledge' ? 'default' : 'outline'} size="sm" onClick={() => setView('knowledge')} className="gap-2"><SearchIcon className="h-4 w-4" />个人知识库</Button>}
          <Button variant={view === 'message-board' ? 'default' : 'outline'} size="sm" onClick={() => setView('message-board')} disabled={!isAdmin} className="gap-2 disabled:opacity-50 disabled:cursor-not-allowed" title={isAdmin ? '音频记录' : '需要管理员权限'}><MessageSquareIcon className="h-4 w-4" />音频记录</Button>
          {isAdmin && <Button variant="outline" size="sm" onClick={() => setHealthOpen(true)} className="gap-2"><SettingsIcon className="h-4 w-4" />生病异常设置</Button>}
        </div></div>}
        {children}
      </main>
    </div>
  )
}
