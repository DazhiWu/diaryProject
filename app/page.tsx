"use client"

import { AnonymousMessageBoard } from '@/components/anonymous-message-board'
import { CalendarView } from '@/components/calendar-view'
import { DiaryAppShell } from '@/components/diary-app-shell'
import { DiaryDetail } from '@/components/diary-detail'
import DiaryDownloader from '@/components/diary-downloader'
import { DiaryEntry as DiaryEntryComponent } from '@/components/diary-entry'
import { DiaryList } from '@/components/diary-list'
import { MessageBoard } from '@/components/message-board'
import { KnowledgeBase } from '@/components/knowledge-base'
import { Pagination } from '@/components/pagination'
import { Spinner } from '@/components/ui/spinner'
import YearlySummary from '@/components/yearly-summary'
import { useDiaryController } from '@/hooks/useDiaryController'

export default function DiaryApp() {
  const controller = useDiaryController()
  const {
    auth, isGuest, entries, allEntries, entriesPerPage, totalEntriesCount, totalPages,
    view, setView, searchQuery, setSearchQuery, selectedDate, setSelectedDate, selectedEntry, setSelectedEntry,
    loading, currentPage, setCurrentPage, currentCalendarDate, setCurrentCalendarDate,
    addEntry, updateEntry, deleteEntry, loadEntries, navigateToEntry, openEntryById, selectCalendarDate, mergeEntry, navigation,
  } = controller

  return (
    <DiaryAppShell
      isAdmin={auth.isAdmin}
      isGuest={isGuest}
      onClearSearch={() => { setSearchQuery(''); setSelectedDate(null) }}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      setView={setView}
      view={view}
    >
      {loading ? (
        <div className="flex items-center justify-center py-12"><Spinner className="mr-2 h-6 w-6" /><span className="text-muted-foreground">正在加载日记...</span></div>
      ) : view === 'new' ? (
        <DiaryEntryComponent
          entry={selectedDate ? { id: 0, date: selectedDate, subtitle: '', content: '', images: [], modifiedAt: new Date() } : undefined}
          onSave={addEntry}
          onCancel={() => setView('list')}
        />
      ) : view === 'edit' && selectedEntry ? (
        <DiaryEntryComponent entry={selectedEntry} onSave={(content, subtitle, date, files) => updateEntry(selectedEntry.id, content, subtitle, date, files)} onCancel={() => setView('detail')} />
      ) : view === 'detail' && selectedEntry ? (
        <DiaryDetail
          entry={selectedEntry}
          onBack={() => { setView('list'); void loadEntries() }}
          onDelete={deleteEntry}
          onEdit={(entry) => { setSelectedEntry(entry); setView('edit') }}
          onUpdateEntry={mergeEntry}
          previousEntry={navigation.previous}
          nextEntry={navigation.next}
          onNavigateToEntry={navigateToEntry}
        />
      ) : view === 'list' ? (
        <>
          <DiaryList
            entries={entries}
            onViewDetail={(entry) => { setSelectedEntry(entry); setView('detail') }}
            onDelete={deleteEntry}
            onNewEntry={() => setView('new')}
            emptyMessage={searchQuery ? 'No entries found matching your search.' : 'No diary entries yet. Start writing your first entry!'}
          />
          {totalEntriesCount > 0 && <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalEntries={totalEntriesCount} entriesPerPage={entriesPerPage} />}
        </>
      ) : view === 'calendar' ? (
        <CalendarView entries={allEntries.length > 0 ? allEntries : entries} currentDate={currentCalendarDate} onDateChange={setCurrentCalendarDate} onDateSelect={selectCalendarDate} />
      ) : view === 'download' ? (
        <DiaryDownloader />
      ) : view === 'yearly-summary' ? (
        <YearlySummary onBack={() => setView('list')} />
      ) : view === 'message-board' ? (
        <MessageBoard />
      ) : view === 'anonymous-message-board' ? (
        <AnonymousMessageBoard />
      ) : view === 'knowledge' ? (
        <KnowledgeBase onOpenDiary={openEntryById} />
      ) : (
        <div className="text-center py-12 text-muted-foreground">未知视图</div>
      )}
    </DiaryAppShell>
  )
}
