"use client"

import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import {
  addAIAnalysisOpinion,
  addAIAnalysisSection,
  addImportantEvent,
  addInvestmentImage,
  deleteAIAnalysisOpinion,
  deleteAIAnalysisSection,
  deleteImportantEvent,
  fetchInvestmentImages,
  fetchYearlySummary,
  updateAIAnalysisSection,
  updateImportantEvent,
  type AIAnalysisSection,
  type ImportantEvent,
  type YearlySummary,
} from '@/lib/yearlySummaryApi'

export type OpinionForm = { id: string | number; content: string; analysis: string }
export type AnalysisForm = { title: string; content: string; opinions: OpinionForm[] }
export type EventForm = { startDate: string; endDate: string; description: string }

function emptySummary(year: string): YearlySummary {
  return { year, importantEvents: [], aiAnalyses: [], investmentImages: [] }
}

export function useYearlySummaryController(year: string) {
  const [summary, setSummary] = useState<YearlySummary>(() => emptySummary(year))
  const [isLoading, setIsLoading] = useState(false)
  const [isImagesLoading, setIsImagesLoading] = useState(false)

  useEffect(() => {
    let active = true
    setIsLoading(true)
    void fetchYearlySummary(year)
      .then((data) => { if (active) setSummary(data ?? emptySummary(year)) })
      .catch((error) => { console.error('Error loading yearly summary:', error); if (active) { setSummary(emptySummary(year)); toast.error('加载年度总结失败') } })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [year])

  useEffect(() => {
    if (isLoading) return
    let active = true
    setIsImagesLoading(true)
    void fetchInvestmentImages(year)
      .then((images) => { if (active) setSummary((current) => ({ ...current, investmentImages: images })) })
      .catch((error) => console.error('Error loading investment images:', error))
      .finally(() => { if (active) setIsImagesLoading(false) })
    return () => { active = false }
  }, [year, isLoading])

  async function saveEvent(editing: ImportantEvent | null, form: EventForm) {
    try {
      const saved = editing
        ? await updateImportantEvent(Number(editing.id), form, year)
        : await addImportantEvent(year, form)
      setSummary((current) => ({ ...current, importantEvents: editing ? current.importantEvents.map((event) => event.id === editing.id ? saved : event) : [...current.importantEvents, saved] }))
      toast.success('保存重要事件成功')
      return true
    } catch (error) { console.error('Error saving important event:', error); toast.error('保存重要事件失败'); return false }
  }

  async function removeEvent(id: number) {
    try { await deleteImportantEvent(id, year); setSummary((current) => ({ ...current, importantEvents: current.importantEvents.filter((event) => Number(event.id) !== id) })); toast.success('删除重要事件成功') }
    catch (error) { console.error('Error deleting important event:', error); toast.error('删除重要事件失败') }
  }

  async function saveAnalysis(editing: AIAnalysisSection | null, form: AnalysisForm) {
    try {
      const saved = editing
        ? await updateAIAnalysisSection(Number(editing.id), { title: form.title, content: form.content }, year)
        : await addAIAnalysisSection(year, { title: form.title, content: form.content })
      if (editing) for (const existing of editing.opinions) await deleteAIAnalysisOpinion(Number(existing.id), year)
      const opinions = []
      for (const item of form.opinions.filter((opinion) => opinion.content.trim() || opinion.analysis.trim())) {
        opinions.push(await addAIAnalysisOpinion(Number(saved.id), { content: item.content, analysis: item.analysis }, year))
      }
      saved.opinions = opinions
      setSummary((current) => {
        const analyses = editing ? current.aiAnalyses.map((analysis) => analysis.id === editing.id ? saved : analysis) : [...current.aiAnalyses, saved]
        analyses.sort((left, right) => new Date(left.created_at ?? 0).getTime() - new Date(right.created_at ?? 0).getTime())
        return { ...current, aiAnalyses: analyses }
      })
      toast.success('保存AI读后感成功')
      return true
    } catch (error) { console.error('Error saving AI读后感:', error); toast.error('保存AI读后感失败'); return false }
  }

  async function removeAnalysis(id: number) {
    try { await deleteAIAnalysisSection(id, year); setSummary((current) => ({ ...current, aiAnalyses: current.aiAnalyses.filter((analysis) => Number(analysis.id) !== id) })); toast.success('删除AI读后感成功') }
    catch (error) { console.error('Error deleting AI读后感:', error); toast.error('删除AI读后感失败') }
  }

  async function uploadImage(file: File) {
    try { const image = await addInvestmentImage(year, file); setSummary((current) => ({ ...current, investmentImages: [...current.investmentImages, image] })); toast.success('图片上传成功') }
    catch (error) { console.error('Error uploading image:', error); toast.error('图片上传失败') }
  }

  return { summary, isLoading, isImagesLoading, saveEvent, removeEvent, saveAnalysis, removeAnalysis, uploadImage }
}
