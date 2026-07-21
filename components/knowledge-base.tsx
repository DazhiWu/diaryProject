"use client"

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import {
  fetchKnowledgeIndexStatus,
  queueKnowledgeRebuild,
  retryKnowledgeIndex,
  searchKnowledge,
  syncKnowledgeIndex,
  type KnowledgeIndexStatus,
  type KnowledgeSearchResult,
} from '@/lib/knowledgeApi'

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

const MAX_SYNC_BATCHES_PER_CLICK = 50
const SYNC_BATCH_INTERVAL_MS = 3_000

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export function KnowledgeBase({ onOpenDiary }: { onOpenDiary: (sourceId: number) => Promise<void> }) {
  const [status, setStatus] = useState(EMPTY_STATUS)
  const [query, setQuery] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [results, setResults] = useState<KnowledgeSearchResult[]>([])
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [searching, setSearching] = useState(false)

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await fetchKnowledgeIndexStatus())
    } catch (error) {
      console.error('Failed to load knowledge index status:', error)
      toast.error('无法加载知识索引状态')
    } finally {
      setLoadingStatus(false)
    }
  }, [])

  useEffect(() => { void refreshStatus() }, [refreshStatus])

  async function syncAllPending() {
    setSyncing(true)
    let processed = 0
    let failed = 0
    let consecutiveFailures = 0
    let stoppedForConsecutiveFailures = false
    try {
      for (let batch = 0; batch < MAX_SYNC_BATCHES_PER_CLICK; batch += 1) {
        if (batch > 0) await wait(SYNC_BATCH_INTERVAL_MS)
        const result = await syncKnowledgeIndex(consecutiveFailures)
        processed += result.processed
        failed += result.failed
        consecutiveFailures = result.consecutiveFailures
        stoppedForConsecutiveFailures = result.stoppedForConsecutiveFailures
        setStatus(result.status)
        if (stoppedForConsecutiveFailures) break
        if ((result.processed === 0 && result.failed === 0) || result.status.pending === 0) break
      }
      if (stoppedForConsecutiveFailures) toast.error(`连续 3 篇索引失败，已停止本次同步；成功 ${processed} 篇，失败 ${failed} 篇`)
      else if (failed > 0) toast.error(`已同步 ${processed} 篇，${failed} 篇失败`)
      else toast.success(`知识索引同步完成，共处理 ${processed} 篇日记`)
    } catch (error) {
      console.error('Failed to sync knowledge index:', error)
      toast.error(error instanceof Error ? error.message : '知识索引同步失败')
      await refreshStatus()
    } finally {
      setSyncing(false)
    }
  }

  async function rebuild() {
    setSyncing(true)
    try {
      setStatus(await queueKnowledgeRebuild())
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
      setStatus(await retryKnowledgeIndex())
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
      const response = await searchKnowledge({ query: query.trim(), startDate: startDate || undefined, endDate: endDate || undefined })
      setResults(response.results)
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
          <p className="text-xs text-muted-foreground">日记保存不会等待 Embedding；新增或修改后的内容会进入待处理队列。每个任务间隔 3 秒，连续 3 篇失败会停止本次同步；重建只重新排队，不会立即删除现有可搜索片段。</p>
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
            <Button type="submit" disabled={searching || !query.trim()}>{searching ? <Spinner className="h-4 w-4" /> : null}搜索</Button>
          </form>
        </CardContent>
      </Card>

      {results.length > 0 && <div className="space-y-3">
        <h2 className="text-lg font-semibold">搜索结果</h2>
        {results.map((result) => {
          const similarity = result.similarity === null ? null : Math.max(0, Math.min(100, result.similarity * 100))
          return <Card key={result.chunkId} className="gap-4 py-4">
            <CardHeader className="px-4 sm:px-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><CardTitle className="leading-snug">{result.sourceTitle || `日记 ${result.sourceDate}`}</CardTitle><CardDescription className="mt-1">{result.sourceDate} · 第 {result.chunkIndex + 1} 个片段{similarity === null ? '' : ` · 语义相似度 ${similarity.toFixed(1)}%`}</CardDescription></div>
                <Button size="sm" variant="outline" onClick={() => void onOpenDiary(result.sourceId)}>打开原日记</Button>
              </div>
            </CardHeader>
            <CardContent className="px-4 sm:px-6"><p className="whitespace-pre-wrap text-sm leading-7">{result.content}</p></CardContent>
          </Card>
        })}
      </div>}
    </div>
  )
}
