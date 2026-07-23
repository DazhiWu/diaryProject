"use client"

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'

import { ChevronRightIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { KNOWLEDGE_SEARCH_DEFAULT_START_DATE, localDateInputValue } from '@/lib/dateInput'
import {
  fetchKnowledgeIndexStatus,
  queueKnowledgeRebuild,
  retryKnowledgeIndex,
  searchKnowledge,
  type KnowledgeIndexStatus,
  type KnowledgeSearchDiagnostics,
  type KnowledgeSearchResult,
} from '@/lib/knowledgeApi'
import { runKnowledgeSync, SYNC_BATCH_INTERVAL_MS } from '@/lib/knowledgeSync'

const EMPTY_STATUS: KnowledgeIndexStatus = {
  totalSources: 0,
  indexedSources: 0,
  totalChunks: 0,
  pending: 0,
  processing: 0,
  failed: 0,
  completed: 0,
  excluded: 0,
  lastIndexedAt: null,
}

const COLLAPSED_DIAGNOSTIC_SECTIONS = {
  candidates: false,
  reranked: false,
  final: false,
}

function scoreLabel(score: number | null): string {
  return score === null ? '—' : score.toFixed(6)
}

function DiagnosticSection({
  contentId,
  title,
  expanded,
  onToggle,
  children,
}: {
  contentId: string
  title: ReactNode
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-controls={contentId}
          aria-expanded={expanded}
          onClick={onToggle}
        >
          <ChevronRightIcon className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          {expanded ? '收起' : '展开'}
        </Button>
      </div>
      <div id={contentId} className="space-y-3" hidden={!expanded}>{children}</div>
    </section>
  )
}

function KnowledgeResultCards({
  results,
  onOpenDiary,
  showRank = false,
}: {
  results: KnowledgeSearchResult[]
  onOpenDiary: (sourceId: number) => Promise<void>
  showRank?: boolean
}) {
  if (results.length === 0) return <p className="text-sm text-muted-foreground">没有最终结果。</p>

  return results.map((result, index) => {
    const similarity = result.similarity === null ? null : Math.max(0, Math.min(100, result.similarity * 100))
    return <Card key={`${result.chunkId}-${index}`} className="gap-4 py-4">
      <CardHeader className="px-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="leading-snug">
              {showRank ? `最终排名 #${index + 1} · ` : ''}{result.sourceTitle || `日记 ${result.sourceDate}`}
            </CardTitle>
            <CardDescription className="mt-1">
              {result.sourceDate} · 第 {result.chunkIndex + 1}{result.chunkEndIndex === result.chunkIndex ? '' : `–${result.chunkEndIndex + 1}`} 个片段
              {similarity === null ? '' : ` · 语义相似度 ${similarity.toFixed(1)}%`}
              {result.rerankScore === null ? '' : ` · rerankScore ${scoreLabel(result.rerankScore)}`}
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => void onOpenDiary(result.sourceId)}>打开原日记</Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 sm:px-6"><p className="whitespace-pre-wrap text-sm leading-7">{result.content}</p></CardContent>
    </Card>
  })
}

export function KnowledgeBase({ onOpenDiary }: { onOpenDiary: (sourceId: number) => Promise<void> }) {
  const [status, setStatus] = useState(EMPTY_STATUS)
  const [query, setQuery] = useState('')
  const [startDate, setStartDate] = useState(KNOWLEDGE_SEARCH_DEFAULT_START_DATE)
  const [endDate, setEndDate] = useState('')
  const [results, setResults] = useState<KnowledgeSearchResult[]>([])
  const [rerankApplied, setRerankApplied] = useState<boolean | null>(null)
  const [diagnosticMode, setDiagnosticMode] = useState(false)
  const [diagnostics, setDiagnostics] = useState<KnowledgeSearchDiagnostics | null>(null)
  const [expandedDiagnosticSections, setExpandedDiagnosticSections] = useState(COLLAPSED_DIAGNOSTIC_SECTIONS)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [searching, setSearching] = useState(false)
  const statusRequestVersion = useRef(0)

  const applyStatus = useCallback((nextStatus: KnowledgeIndexStatus) => {
    statusRequestVersion.current += 1
    setStatus(nextStatus)
  }, [])

  const loadLatestStatus = useCallback(async () => {
    const requestVersion = statusRequestVersion.current + 1
    statusRequestVersion.current = requestVersion
    const nextStatus = await fetchKnowledgeIndexStatus()
    if (statusRequestVersion.current === requestVersion) setStatus(nextStatus)
    return nextStatus
  }, [])

  const refreshStatus = useCallback(async (silent = false) => {
    try {
      await loadLatestStatus()
    } catch (error) {
      console.error('Failed to load knowledge index status:', error)
      if (!silent) toast.error('无法加载知识索引状态')
    } finally {
      setLoadingStatus(false)
    }
  }, [loadLatestStatus])

  useEffect(() => { void refreshStatus() }, [refreshStatus])

  useEffect(() => { setEndDate(localDateInputValue(new Date())) }, [])

  useEffect(() => {
    if (!syncing) return
    const interval = window.setInterval(() => { void refreshStatus(true) }, SYNC_BATCH_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [refreshStatus, syncing])

  async function syncAllPending() {
    setSyncing(true)
    try {
      const summary = await runKnowledgeSync({ onStatus: applyStatus, refreshStatus: loadLatestStatus })
      if (summary.stoppedForConsecutiveFailures) toast.error(`连续 3 篇索引失败，已停止本次同步；成功 ${summary.processed} 篇，失败 ${summary.failed} 篇`)
      else if (summary.failed > 0) toast.error(`已同步 ${summary.processed} 篇，${summary.failed} 篇失败`)
      else toast.success(`知识索引同步完成，共处理 ${summary.processed} 篇日记`)
    } catch (error) {
      console.error('Failed to sync knowledge index:', error)
      toast.error(error instanceof Error ? error.message : '知识索引同步失败')
    } finally {
      await refreshStatus(true)
      setSyncing(false)
    }
  }

  async function rebuild() {
    setSyncing(true)
    try {
      applyStatus(await queueKnowledgeRebuild())
      toast.success('已将全部日记加入重建队列')
    } catch (error) {
      console.error('Failed to queue knowledge rebuild:', error)
      toast.error('无法创建知识索引重建任务')
    } finally {
      setSyncing(false)
    }
  }

  async function retryFailed() {
    setSyncing(true)
    try {
      applyStatus(await retryKnowledgeIndex())
      toast.success('失败任务已重新加入队列')
    } catch (error) {
      console.error('Failed to retry knowledge jobs:', error)
      toast.error('无法重试失败任务')
    } finally {
      setSyncing(false)
    }
  }

  async function submitSearch(event: FormEvent) {
    event.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    try {
      const response = await searchKnowledge({
        query: query.trim(),
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        diagnostics: diagnosticMode,
      })
      setResults(response.results)
      setRerankApplied(response.rerankApplied)
      setDiagnostics(response.diagnostics ?? null)
      setExpandedDiagnosticSections(COLLAPSED_DIAGNOSTIC_SECTIONS)
      if (response.results.length === 0) toast.info('没有找到相关日记片段')
    } catch (error) {
      console.error('Failed to search knowledge:', error)
      toast.error(error instanceof Error ? error.message : '知识库搜索失败')
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>个人知识库</CardTitle>
          <CardDescription>管理员专用的日记语义索引。当前模型：Qwen3-Embedding-0.6B。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingStatus ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner className="h-4 w-4" />正在读取索引状态...</div> : (
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div className="rounded-md border p-3"><div className="text-muted-foreground">日记来源</div><div className="mt-1 text-xl font-semibold">{status.indexedSources}/{status.totalSources}</div></div>
              <div className="rounded-md border p-3"><div className="text-muted-foreground">知识片段</div><div className="mt-1 text-xl font-semibold">{status.totalChunks}</div></div>
              <div className="rounded-md border p-3"><div className="text-muted-foreground">待处理</div><div className="mt-1 text-xl font-semibold">{status.pending + status.processing}</div></div>
              <div className="rounded-md border p-3"><div className="text-muted-foreground">失败</div><div className="mt-1 text-xl font-semibold">{status.failed}</div></div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void syncAllPending()} disabled={syncing || status.pending + status.processing === 0}>{syncing ? <Spinner className="h-4 w-4" /> : null}同步待处理日记</Button>
            <Button variant="outline" onClick={() => void rebuild()} disabled={syncing}>重建全部索引</Button>
            <Button variant="outline" onClick={() => void retryFailed()} disabled={syncing || status.failed === 0}>重试失败任务</Button>
            <Button variant="ghost" onClick={() => void refreshStatus()} disabled={syncing}>刷新状态</Button>
          </div>
          <p className="text-xs text-muted-foreground">日记保存不会等待 Embedding；新增或修改后的内容会进入待处理队列。每个任务间隔 2 秒，连续 3 篇失败会停止本次同步；重建只重新排队，不会立即删除现有可搜索片段。</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>搜索日记知识</CardTitle>
          <CardDescription>结合语义相似度、原文精确匹配和日期范围查找日记片段。</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitSearch} className="space-y-3">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={500} placeholder="例如：我什么时候开始认真考虑个人知识库？" />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm"><span className="text-muted-foreground">开始日期（可选）</span><Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
              <label className="space-y-1 text-sm"><span className="text-muted-foreground">结束日期（可选）</span><Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
            </div>
            <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
              <input
                type="checkbox"
                checked={diagnosticMode}
                onChange={(event) => {
                  setDiagnosticMode(event.target.checked)
                  setExpandedDiagnosticSections(COLLAPSED_DIAGNOSTIC_SECTIONS)
                }}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span>
                <span className="font-medium">诊断模式</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">展示 RPC 召回候选、Reranker 原始结果，以及合并和多样化后的最终结果。</span>
              </span>
            </label>
            <Button type="submit" disabled={searching || !query.trim()}>{searching ? <Spinner className="h-4 w-4" /> : null}搜索</Button>
          </form>
        </CardContent>
      </Card>

      {diagnosticMode && diagnostics ? <div className="space-y-8">
        <DiagnosticSection
          contentId="knowledge-diagnostics-candidates"
          title={`1. 召回候选（${diagnostics.candidates.length}/20 条）`}
          expanded={expandedDiagnosticSections.candidates}
          onToggle={() => setExpandedDiagnosticSections((current) => ({ ...current, candidates: !current.candidates }))}
        >
          <div>
            <p className="mt-1 text-xs text-muted-foreground">融合排名为现有 Supabase RPC 的返回顺序；RPC score 是语义与字面匹配融合后的分数。</p>
          </div>
          {diagnostics.candidates.length === 0 ? <p className="text-sm text-muted-foreground">没有召回候选，因此未调用 Reranker。</p> : diagnostics.candidates.map((candidate) => (
            <Card key={`candidate-${candidate.fusionRank}`} className="gap-3 py-4">
              <CardHeader className="px-4 sm:px-6">
                <CardTitle className="text-base">融合排名 #{candidate.fusionRank}</CardTitle>
                <CardDescription>
                  日期 {candidate.sourceDate} · 标题 {candidate.sourceTitle || '（无标题）'} · 片段 #{candidate.chunkIndex + 1}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 px-4 sm:px-6">
                <p className="whitespace-pre-wrap text-sm leading-7">{candidate.content}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
                  <span>vectorSimilarity {scoreLabel(candidate.vectorSimilarity)}</span>
                  <span>RPC score {scoreLabel(candidate.rpcScore)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </DiagnosticSection>

        <DiagnosticSection
          contentId="knowledge-diagnostics-reranked"
          title={`2. Reranker 原始前 5（${diagnostics.reranked.length} 条）`}
          expanded={expandedDiagnosticSections.reranked}
          onToggle={() => setExpandedDiagnosticSections((current) => ({ ...current, reranked: !current.reranked }))}
        >
          <div>
            {rerankApplied === false && diagnostics.candidates.length > 0
              ? <p className="mt-1 text-xs text-muted-foreground">Workers AI 重排失败，本阶段没有结果；最终阶段已按向量相似度降级。</p>
              : <p className="mt-1 text-xs text-muted-foreground">按 Workers AI 原始返回顺序展示，尚未合并相邻片段或执行来源多样化。</p>}
          </div>
          {diagnostics.reranked.length === 0 ? <p className="text-sm text-muted-foreground">没有 Reranker 原始结果。</p> : diagnostics.reranked.map((candidate) => (
            <Card key={`reranked-${candidate.rerankRank}`} className="gap-3 py-4">
              <CardHeader className="px-4 sm:px-6">
                <CardTitle className="text-base">Reranker 排名 #{candidate.rerankRank} · 原候选 #{candidate.candidateRank}</CardTitle>
                <CardDescription>
                  {candidate.sourceDate} · {candidate.sourceTitle || '无标题'} · 片段 #{candidate.chunkIndex + 1}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 px-4 sm:px-6">
                <p className="whitespace-pre-wrap text-sm leading-7">{candidate.content}</p>
                <p className="font-mono text-xs text-muted-foreground">rerankScore {scoreLabel(candidate.rerankScore)}</p>
              </CardContent>
            </Card>
          ))}
        </DiagnosticSection>

        <DiagnosticSection
          contentId="knowledge-diagnostics-final"
          title={`3. 合并/多样化后的最终结果（${results.length} 条）`}
          expanded={expandedDiagnosticSections.final}
          onToggle={() => setExpandedDiagnosticSections((current) => ({ ...current, final: !current.final }))}
        >
          <div>
            <p className="mt-1 text-xs text-muted-foreground">相邻片段会合并，每篇日记最多保留两个独立结果。</p>
          </div>
          <KnowledgeResultCards results={results} onOpenDiary={onOpenDiary} showRank />
        </DiagnosticSection>
      </div> : results.length > 0 && <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">搜索结果</h2>
          {rerankApplied === false && <p className="mt-1 text-xs text-muted-foreground">Workers AI 重排暂时不可用，当前结果按向量相似度排序。</p>}
        </div>
        <KnowledgeResultCards results={results} onOpenDiary={onOpenDiary} />
      </div>}
    </div>
  )
}
