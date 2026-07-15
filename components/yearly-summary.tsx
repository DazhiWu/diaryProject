"use client"

import { useEffect, useState } from 'react'
import { Button } from './ui/button'
import { ChevronLeftIcon } from './icons'
import { useAuth } from '@/hooks/useAuth'
import { useYearlySummaryController, type AnalysisForm, type EventForm } from '@/hooks/useYearlySummaryController'
import type { AIAnalysisSection, ImportantEvent } from '@/lib/yearlySummaryApi'
import { AnalysisSection } from './yearly-summary/analysis-section'
import { EditorDialogs } from './yearly-summary/editor-dialogs'
import { EventsSection } from './yearly-summary/events-section'
import { GallerySection } from './yearly-summary/gallery-section'

const AVAILABLE_YEARS = ['2024', '2025']
const EMPTY_ANALYSIS_FORM: AnalysisForm = { title: '', content: '', opinions: [{ id: '', content: '', analysis: '' }] }

const YearlySummary: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [selectedYear, setSelectedYear] = useState('2024')
  const { isAdmin } = useAuth()
  const { summary, isLoading, isImagesLoading, saveEvent, removeEvent, saveAnalysis, removeAnalysis, uploadImage } = useYearlySummaryController(selectedYear)
  const [eventViewMode, setEventViewMode] = useState<'list' | 'timeline'>('timeline')
  const [analysisViewMode, setAnalysisViewMode] = useState<'card' | 'screen'>('screen')
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | number | null>(null)
  const [selectedOpinionId, setSelectedOpinionId] = useState<string | number | null>(null)
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false)
  const [isAnalysisDialogOpen, setIsAnalysisDialogOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<ImportantEvent | null>(null)
  const [editingAnalysis, setEditingAnalysis] = useState<AIAnalysisSection | null>(null)
  const [eventForm, setEventForm] = useState<EventForm>({ startDate: '', endDate: '', description: '' })
  const [analysisForm, setAnalysisForm] = useState<AnalysisForm>(EMPTY_ANALYSIS_FORM)

  useEffect(() => {
    const first = summary.aiAnalyses.slice(1, -1)[0]
    setSelectedAnalysisId(first?.id ?? null)
    setSelectedOpinionId(first?.opinions[0]?.id ?? null)
  }, [selectedYear, summary.aiAnalyses])

  const openNewEvent = () => {
    const initialDate = `${selectedYear}-01-01`
    setEditingEvent(null)
    setEventForm({ startDate: initialDate, endDate: initialDate, description: '' })
    setIsEventDialogOpen(true)
  }

  const openEvent = (event: ImportantEvent) => {
    const currentYearDate = (date: string) => { const [, month, day] = date.split('-'); return `${selectedYear}-${month}-${day}` }
    setEditingEvent(event)
    setEventForm({ startDate: currentYearDate(event.startDate), endDate: currentYearDate(event.endDate), description: event.description })
    setIsEventDialogOpen(true)
  }

  const openNewAnalysis = () => {
    setEditingAnalysis(null)
    setAnalysisForm({ title: '', content: '', opinions: [{ id: '', content: '', analysis: '' }] })
    setIsAnalysisDialogOpen(true)
  }

  const openAnalysis = (analysis: AIAnalysisSection) => {
    setEditingAnalysis(analysis)
    setAnalysisForm({ title: analysis.title, content: analysis.content, opinions: analysis.opinions.map((opinion) => ({ id: opinion.id, content: opinion.content, analysis: opinion.analysis })) })
    setIsAnalysisDialogOpen(true)
  }

  const selectAnalysis = (analysis: AIAnalysisSection) => {
    setSelectedAnalysisId(analysis.id)
    setSelectedOpinionId(analysis.opinions[0]?.id ?? null)
  }

  return <div className="space-y-8">
    <div className="flex justify-between items-center">
      <Button variant="outline" onClick={onBack} className="gap-2"><ChevronLeftIcon className="h-4 w-4" />返回日记首页</Button>
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium">选择年份：</label>
        <select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)} className="px-3 py-1 border rounded-md bg-background text-foreground" disabled={isLoading}>
          {AVAILABLE_YEARS.map((year) => <option key={year} value={year}>{year}年</option>)}
        </select>
      </div>
    </div>

    <h1 className="text-3xl font-bold text-center">{selectedYear}年度总结</h1>
    {isLoading ? <div className="flex justify-center items-center py-8"><div className="flex flex-col items-center gap-2"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /><p className="text-muted-foreground">加载数据中...</p></div></div> : <>
      <AnalysisSection analyses={summary.aiAnalyses} isAdmin={isAdmin} viewMode={analysisViewMode} selectedAnalysisId={selectedAnalysisId} selectedOpinionId={selectedOpinionId} onViewModeChange={setAnalysisViewMode} onAnalysisSelect={selectAnalysis} onOpinionSelect={setSelectedOpinionId} onAdd={openNewAnalysis} onEdit={openAnalysis} onDelete={(id) => void removeAnalysis(id)} />
      <EventsSection events={summary.importantEvents} isAdmin={isAdmin} viewMode={eventViewMode} onViewModeChange={setEventViewMode} onAdd={openNewEvent} onEdit={openEvent} onDelete={(id) => void removeEvent(id)} />
      {selectedYear !== '2024' && <GallerySection images={summary.investmentImages} isAdmin={isAdmin} isLoading={isImagesLoading} onUpload={(event) => { const file = event.target.files?.[0]; if (file) { void uploadImage(file); event.target.value = '' } }} />}
    </>}

    <EditorDialogs year={selectedYear} eventOpen={isEventDialogOpen} analysisOpen={isAnalysisDialogOpen} editingEvent={editingEvent} editingAnalysis={editingAnalysis} eventForm={eventForm} analysisForm={analysisForm} setEventOpen={setIsEventDialogOpen} setAnalysisOpen={setIsAnalysisDialogOpen} setEventForm={setEventForm} setAnalysisForm={setAnalysisForm} onSaveEvent={() => { void saveEvent(editingEvent, eventForm).then((saved) => { if (saved) setIsEventDialogOpen(false) }) }} onSaveAnalysis={() => { void saveAnalysis(editingAnalysis, analysisForm).then((saved) => { if (saved) setIsAnalysisDialogOpen(false) }) }} />
  </div>
}

export default YearlySummary
