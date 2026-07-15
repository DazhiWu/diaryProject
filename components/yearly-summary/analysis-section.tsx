import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EditIcon, PlusIcon, Trash2Icon } from '@/components/icons'
import type { AIAnalysisSection } from '@/lib/yearlySummaryApi'

type Props = {
  analyses: AIAnalysisSection[]
  isAdmin: boolean
  viewMode: 'card' | 'screen'
  selectedAnalysisId: string | number | null
  selectedOpinionId: string | number | null
  onViewModeChange: (mode: 'card' | 'screen') => void
  onAnalysisSelect: (analysis: AIAnalysisSection) => void
  onOpinionSelect: (id: string | number) => void
  onAdd: () => void
  onEdit: (analysis: AIAnalysisSection) => void
  onDelete: (id: number) => void
}

export function AnalysisSection({ analyses, isAdmin, viewMode, selectedAnalysisId, selectedOpinionId, onViewModeChange, onAnalysisSelect, onOpinionSelect, onAdd, onEdit, onDelete }: Props) {
  const screenAnalyses = analyses.slice(1, -1)

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">AI读后感</h2>
        <div className="flex items-center gap-2">
          <div className="flex bg-muted p-1 rounded-lg">
            <Button variant={viewMode === 'card' ? 'default' : 'ghost'} size="sm" onClick={() => onViewModeChange('card')} className="h-8 px-3">卡片视图</Button>
            <Button variant={viewMode === 'screen' ? 'default' : 'ghost'} size="sm" onClick={() => onViewModeChange('screen')} className="h-8 px-3">大屏视图</Button>
          </div>
          {isAdmin && <Button onClick={onAdd} className="gap-2"><PlusIcon className="h-4 w-4" />添加内容</Button>}
        </div>
      </div>

      {viewMode === 'card' ? (
        <div className="space-y-4">
          {analyses.map((analysis) => (
            <div key={analysis.id} className="p-4 border rounded-lg">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-xl font-bold">{analysis.title}</h3>
                {isAdmin && (
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => onEdit(analysis)}><EditIcon className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(Number(analysis.id))}><Trash2Icon className="h-4 w-4" /></Button>
                  </div>
                )}
              </div>
              <div className="mb-4">{analysis.content}</div>
              {analysis.opinions.length > 0 && (
                <div className="space-y-3">
                  {analysis.opinions.map((opinion) => (
                    <div key={opinion.id} className="p-3 bg-muted rounded-lg">
                      {opinion.content ? <><strong>{opinion.content}</strong>：{opinion.analysis}</> : opinion.analysis}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="relative">
          {screenAnalyses.length > 0 ? screenAnalyses.map((analysis) => (
            <div key={analysis.id} className={`transition-all duration-500 ease-in-out ${selectedAnalysisId === analysis.id ? 'block' : 'hidden'}`}>
              <div className="relative rounded-xl overflow-hidden bg-gradient-to-br from-orange-900/40 to-red-900/40 border border-orange-500/40 p-8 min-h-[500px] flex flex-col">
                <div className="flex justify-center mb-6"><div className="px-4 py-1 bg-orange-600/80 text-white rounded-full text-sm font-medium flex items-center gap-1"><span className="text-orange-300">✨</span>AI Deep Analysis</div></div>
                <div className="mb-8"><div className="flex flex-wrap gap-2 justify-center">
                  {screenAnalyses.map((item) => (
                    <Button key={item.id} variant={selectedAnalysisId === item.id ? 'default' : 'outline'} onClick={() => onAnalysisSelect(item)} className="px-4 py-2 bg-orange-800/50 hover:bg-orange-700/50 text-white border-orange-600/50">
                      {item.title.length > 2 ? item.title.substring(2) : item.title}
                    </Button>
                  ))}
                </div></div>
                <h3 className="text-4xl font-bold text-center text-orange-200 mb-8">{analysis.title.length > 2 ? analysis.title.substring(2) : analysis.title}</h3>
                <div className="flex-1 flex items-center justify-center text-center text-orange-100 text-lg leading-relaxed mb-8 px-8">
                  {selectedOpinionId ? analysis.opinions.find((opinion) => opinion.id === selectedOpinionId)?.analysis || '' : analysis.opinions[0]?.analysis || analysis.content}
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {analysis.opinions.map((opinion) => (
                    <button type="button" key={opinion.id} className={`px-4 py-2 rounded-full text-sm transition-all cursor-pointer ${selectedOpinionId === opinion.id ? 'bg-orange-600/80 text-white' : 'bg-orange-800/50 hover:bg-orange-700/50 text-white'}`} onClick={() => onOpinionSelect(opinion.id)}>
                      {opinion.content || opinion.analysis}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )) : (
            <div className="flex flex-col items-center justify-center py-16 bg-muted rounded-lg">
              <p className="text-muted-foreground">暂无AI读后感数据</p>
              {isAdmin && <Button onClick={onAdd} className="mt-4">添加内容</Button>}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
