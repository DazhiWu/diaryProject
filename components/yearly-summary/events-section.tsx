import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EditIcon, PlusIcon, Trash2Icon } from '@/components/icons'
import type { ImportantEvent } from '@/lib/yearlySummaryApi'

type Props = {
  events: ImportantEvent[]
  isAdmin: boolean
  viewMode: 'list' | 'timeline'
  onViewModeChange: (mode: 'list' | 'timeline') => void
  onAdd: () => void
  onEdit: (event: ImportantEvent) => void
  onDelete: (id: number) => void
}

function shortDate(date: string) { const [, month, day] = date.split('-'); return `${month}/${day}` }
function chineseDate(date: string) { const [, month, day] = date.split('-'); return `${parseInt(month)}月${parseInt(day)}日` }
function eventCopy(event: ImportantEvent) {
  const start = chineseDate(event.startDate)
  const end = chineseDate(event.endDate)
  const sentences = event.description.split(/[。！？]/)
  const title = sentences.find((sentence) => sentence.trim()) || ''
  const joined = `${sentences.slice(1).filter((sentence) => sentence.trim()).join('。')}。`
  return { timeRange: start === end ? start : `${start}-${end}`, title, detail: joined === '。' ? '' : joined }
}

export function EventsSection({ events, isAdmin, viewMode, onViewModeChange, onAdd, onEdit, onDelete }: Props) {
  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">重要事件</h2>
        <div className="flex items-center gap-2">
          <div className="flex bg-muted p-1 rounded-lg">
            <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="sm" onClick={() => onViewModeChange('list')} className="h-8 px-3">列表视图</Button>
            <Button variant={viewMode === 'timeline' ? 'default' : 'ghost'} size="sm" onClick={() => onViewModeChange('timeline')} className="h-8 px-3">时间轴视图</Button>
          </div>
          {isAdmin && <Button onClick={onAdd} className="gap-2 h-8"><PlusIcon className="h-4 w-4" />添加事件</Button>}
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="space-y-3">
          {events.map((event) => (
            <div key={event.id} className="flex items-center gap-3 p-3 border rounded-lg">
              <div className="flex-1">
                <div className="flex gap-2 text-sm text-muted-foreground"><span>{shortDate(event.startDate)}</span><span>至</span><span>{shortDate(event.endDate)}</span></div>
                <div className="text-base font-medium">{event.description}</div>
              </div>
              {isAdmin && <div className="flex gap-2">
                <Button variant="ghost" size="icon" onClick={() => onEdit(event)}><EditIcon className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => onDelete(Number(event.id))}><Trash2Icon className="h-4 w-4" /></Button>
              </div>}
            </div>
          ))}
        </div>
      ) : (
        <div className="relative">
          <div className="space-y-16">
            {events.map((event, index) => {
              const { timeRange, title, detail } = eventCopy(event)
              const isRight = index % 2 === 0
              const content = (
                <div className="relative p-6 rounded-xl bg-background border border-primary/20 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden">
                  <div className={`absolute top-0 ${isRight ? 'right-0 bg-gradient-to-l' : 'left-0 bg-gradient-to-r'} w-full h-1 from-primary via-primary/70 to-primary/30`} />
                  <div className="flex items-center justify-between text-sm text-primary mb-4"><span className="font-semibold">{timeRange}</span><span className="px-3 py-1 bg-primary/10 text-primary text-xs rounded-full">{isRight ? '成就⭐' : '生活❤'}</span></div>
                  <h3 className="text-xl font-bold mb-4 text-foreground">{title}</h3>
                  {detail && <p className="text-sm text-muted-foreground leading-relaxed">{detail}</p>}
                </div>
              )
              return <div key={event.id} className="flex items-center gap-0">
                {!isRight ? <div className="flex-1">{content}</div> : <div className="flex-1" />}
                <div className="relative z-10 flex items-center justify-center w-4 h-4 bg-primary rounded-full shadow-lg" />
                {isRight ? <div className="flex-1">{content}</div> : <div className="flex-1" />}
              </div>
            })}
          </div>
          <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-primary/50 transform -translate-x-1/2 z-0" />
        </div>
      )}
    </Card>
  )
}
