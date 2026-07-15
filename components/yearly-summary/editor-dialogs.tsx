import type { Dispatch, SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PlusIcon, Trash2Icon } from '@/components/icons'
import type { AIAnalysisSection, ImportantEvent } from '@/lib/yearlySummaryApi'
import type { AnalysisForm, EventForm } from '@/hooks/useYearlySummaryController'

type Props = {
  year: string
  eventOpen: boolean
  analysisOpen: boolean
  editingEvent: ImportantEvent | null
  editingAnalysis: AIAnalysisSection | null
  eventForm: EventForm
  analysisForm: AnalysisForm
  setEventOpen: (open: boolean) => void
  setAnalysisOpen: (open: boolean) => void
  setEventForm: Dispatch<SetStateAction<EventForm>>
  setAnalysisForm: Dispatch<SetStateAction<AnalysisForm>>
  onSaveEvent: () => void
  onSaveAnalysis: () => void
}

export function EditorDialogs({ year, eventOpen, analysisOpen, editingEvent, editingAnalysis, eventForm, analysisForm, setEventOpen, setAnalysisOpen, setEventForm, setAnalysisForm, onSaveEvent, onSaveAnalysis }: Props) {
  const addOpinion = () => setAnalysisForm((current) => ({ ...current, opinions: [...current.opinions, { id: '', content: '', analysis: '' }] }))
  const removeOpinion = (index: number) => setAnalysisForm((current) => current.opinions.length > 1 ? ({ ...current, opinions: current.opinions.filter((_, itemIndex) => itemIndex !== index) }) : current)
  const updateOpinion = (index: number, field: 'content' | 'analysis', value: string) => setAnalysisForm((current) => ({ ...current, opinions: current.opinions.map((opinion, itemIndex) => itemIndex === index ? { ...opinion, [field]: value } : opinion) }))

  return <>
    <Dialog open={eventOpen} onOpenChange={setEventOpen}><DialogContent>
      <DialogHeader><DialogTitle>{editingEvent ? '编辑重要事件' : '添加重要事件'}</DialogTitle><DialogDescription>{editingEvent ? '修改重要事件信息' : '记录本年度的重要事件'}</DialogDescription></DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2"><Label htmlFor="startDate">起始日期</Label><Input id="startDate" type="date" value={eventForm.startDate} onChange={(event) => setEventForm({ ...eventForm, startDate: event.target.value })} min={`${year}-01-01`} max={`${year}-12-31`} /></div>
        <div className="space-y-2"><Label htmlFor="endDate">结束日期</Label><Input id="endDate" type="date" value={eventForm.endDate} onChange={(event) => setEventForm({ ...eventForm, endDate: event.target.value })} min={`${year}-01-01`} max={`${year}-12-31`} /></div>
        <div className="space-y-2"><Label htmlFor="description">事件简介</Label><Textarea id="description" value={eventForm.description} onChange={(event) => setEventForm({ ...eventForm, description: event.target.value })} rows={2} maxLength={20000} /></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={() => setEventOpen(false)}>取消</Button><Button onClick={onSaveEvent}>保存</Button></DialogFooter>
    </DialogContent></Dialog>

    <Dialog open={analysisOpen} onOpenChange={setAnalysisOpen}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{editingAnalysis ? '编辑AI读后感' : '添加AI读后感内容'}</DialogTitle><DialogDescription>{editingAnalysis ? '修改AI读后感内容' : '添加本年度的AI读后感分析'}</DialogDescription></DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2"><Label htmlFor="analysisTitle">小标题</Label><Input id="analysisTitle" value={analysisForm.title} onChange={(event) => setAnalysisForm({ ...analysisForm, title: event.target.value })} maxLength={200} /></div>
        <div className="space-y-2"><Label htmlFor="analysisContent">内容</Label><Textarea id="analysisContent" value={analysisForm.content} onChange={(event) => setAnalysisForm({ ...analysisForm, content: event.target.value })} rows={4} maxLength={20000} /></div>
        <div className="space-y-4">
          <div className="flex justify-between items-center"><Label>观点</Label><Button size="sm" onClick={addOpinion} className="gap-2"><PlusIcon className="h-3 w-3" />添加观点</Button></div>
          {analysisForm.opinions.map((opinion, index) => <div key={index} className="space-y-3 p-3 border rounded-lg">
            <div className="flex justify-between items-center"><Label className="font-medium">观点 {index + 1}</Label><Button variant="ghost" size="icon" onClick={() => removeOpinion(index)} className="text-destructive"><Trash2Icon className="h-4 w-4" /></Button></div>
            <div className="space-y-2"><Label htmlFor={`opinion-content-${index}`}>观点内容</Label><Input id={`opinion-content-${index}`} value={opinion.content} onChange={(event) => updateOpinion(index, 'content', event.target.value)} placeholder="输入观点内容" maxLength={20000} /></div>
            <div className="space-y-2"><Label htmlFor={`opinion-analysis-${index}`}>观点分析</Label><Textarea id={`opinion-analysis-${index}`} value={opinion.analysis} onChange={(event) => updateOpinion(index, 'analysis', event.target.value)} placeholder="输入观点分析" rows={3} maxLength={20000} /></div>
          </div>)}
        </div>
      </div>
      <DialogFooter><Button variant="outline" onClick={() => setAnalysisOpen(false)}>取消</Button><Button onClick={onSaveAnalysis}>保存</Button></DialogFooter>
    </DialogContent></Dialog>
  </>
}
