"use client"

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { KNOWLEDGE_SEARCH_DEFAULT_START_DATE, localDateInputValue } from '@/lib/dateInput'
import {
  createThemeTimeline,
  fetchThemeTimelineRuns,
  processThemeTimeline,
  retryThemeTimeline,
  reviewThemeTimelineSummary,
  type ThemeTimelineRun,
  type ThemeTimelineSummary,
} from '@/lib/knowledgeApi'

const PROCESS_INTERVAL_MS = 2_000

const STATUS_LABELS: Record<ThemeTimelineRun['status'], string> = {
  pending: '待处理',
  extracting: '提取中',
  paused: '已暂停',
  ready_for_summary: '待生成摘要',
  completed: '已完成',
  failed: '运行失败',
}

const REVIEW_LABELS: Record<ThemeTimelineSummary['reviewState'], string> = {
  proposed: '待审核',
  confirmed: '已确认',
  edited: '用户已编辑',
  rejected: '已拒绝',
  superseded: '已被取代',
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

function currentSummary(run: ThemeTimelineRun): ThemeTimelineSummary | null {
  return run.summaries.find((summary) => summary.reviewState !== 'superseded') ?? run.summaries[0] ?? null
}

function Coverage({ run }: { run: ThemeTimelineRun }) {
  const complete = run.coverage.processed === run.coverage.eligible
    && run.coverage.failed === 0
    && run.coverage.stale === 0
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div className="rounded-md border p-3"><div className="text-muted-foreground">范围内 eligible</div><div className="mt-1 text-xl font-semibold">{run.coverage.eligible}</div></div>
        <div className="rounded-md border p-3"><div className="text-muted-foreground">已处理</div><div className="mt-1 text-xl font-semibold">{run.coverage.processed}</div></div>
        <div className="rounded-md border p-3"><div className="text-muted-foreground">失败 / stale</div><div className="mt-1 text-xl font-semibold">{run.coverage.failed} / {run.coverage.stale}</div></div>
        <div className="rounded-md border p-3"><div className="text-muted-foreground">主题日记</div><div className="mt-1 text-xl font-semibold">{run.distinctDiaryCount}</div></div>
      </div>
      <div className={`rounded-md border px-3 py-2 text-sm ${complete && !run.versionStale ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300' : 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'}`}>
        {complete && !run.versionStale
          ? `本次范围已覆盖全部 ${run.coverage.eligible} 篇 eligible 日记。`
          : `覆盖未闭合：pending ${run.coverage.pending}，processing ${run.coverage.processing}，failed ${run.coverage.failed}，stale ${run.coverage.stale}。`}
        {run.coverage.excluded > 0 ? ` 另有 ${run.coverage.excluded} 篇 excluded 来源未参与。` : ''}
      </div>
      <p className="text-xs text-muted-foreground">
        冻结基线 {run.frozenSourceCount} 篇 · corpus fingerprint {run.corpusFingerprint} ·
        Model {run.modelVersion} · Prompt {run.promptVersion}
      </p>
    </div>
  )
}

function SummaryReview({
  run,
  onRun,
}: {
  run: ThemeTimelineRun
  onRun: (run: ThemeTimelineRun) => void
}) {
  const summary = currentSummary(run)
  const [replacement, setReplacement] = useState(summary?.statement ?? '')
  const [reviewing, setReviewing] = useState(false)

  useEffect(() => setReplacement(summary?.statement ?? ''), [summary?.id, summary?.statement])
  if (!summary) return null

  async function review(reviewAction: 'confirm' | 'edit' | 'reject' | 'supersede') {
    if ((reviewAction === 'edit' || reviewAction === 'supersede') && !replacement.trim()) return
    setReviewing(true)
    try {
      const updated = await reviewThemeTimelineSummary({
        summaryId: summary!.id,
        reviewAction,
        statement: reviewAction === 'edit' || reviewAction === 'supersede' ? replacement.trim() : undefined,
      })
      onRun(updated)
      toast.success('主题摘要审核状态已更新')
    } catch (error) {
      console.error('Failed to review theme timeline summary:', error)
      toast.error(error instanceof Error ? error.message : '主题摘要审核失败')
    } finally {
      setReviewing(false)
    }
  }

  const reviewable = !run.resultStale && summary.reviewState !== 'rejected' && summary.reviewState !== 'superseded'
  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">待审核主题摘要</h3>
        <span className="rounded-full border px-2 py-1 text-xs">{REVIEW_LABELS[summary.reviewState]}</span>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-7">{summary.statement}</p>
      {run.resultStale && (
        <p className="text-sm text-amber-700 dark:text-amber-300">来源哈希、处理覆盖或模型/Prompt 版本已变化；该摘要只能作为 stale 历史记录查看，不能确认。</p>
      )}
      {reviewable && (
        <>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">编辑或取代后的陈述</span>
            <textarea
              value={replacement}
              onChange={(event) => setReplacement(event.target.value)}
              maxLength={5_000}
              className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void review('confirm')} disabled={reviewing}>确认</Button>
            <Button size="sm" variant="outline" onClick={() => void review('edit')} disabled={reviewing || !replacement.trim()}>保存编辑</Button>
            <Button size="sm" variant="outline" onClick={() => void review('supersede')} disabled={reviewing || !replacement.trim()}>取代旧摘要</Button>
            <Button size="sm" variant="destructive" onClick={() => void review('reject')} disabled={reviewing}>拒绝</Button>
          </div>
        </>
      )}
      {run.summaries.length > 1 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">查看历史版本（{run.summaries.length}）</summary>
          <div className="mt-3 space-y-2">
            {run.summaries.map((item) => (
              <div key={item.id} className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">{REVIEW_LABELS[item.reviewState]} · {new Date(item.generatedAt).toLocaleString()}</div>
                <p className="mt-2 whitespace-pre-wrap">{item.statement}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

export function ThemeTimeline({
  localProcessingEnabled,
  onOpenDiary,
}: {
  localProcessingEnabled: boolean
  onOpenDiary: (sourceId: number) => Promise<void>
}) {
  const [runs, setRuns] = useState<ThemeTimelineRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [theme, setTheme] = useState('')
  const [startDate, setStartDate] = useState(KNOWLEDGE_SEARCH_DEFAULT_START_DATE)
  const [endDate, setEndDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? runs[0] ?? null,
    [runs, selectedRunId],
  )

  function applyRun(run: ThemeTimelineRun) {
    setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)])
    setSelectedRunId(run.id)
  }

  useEffect(() => {
    setEndDate(localDateInputValue(new Date()))
    void fetchThemeTimelineRuns()
      .then((loaded) => {
        setRuns(loaded)
        setSelectedRunId((current) => current ?? loaded[0]?.id ?? null)
      })
      .catch((error) => {
        console.error('Failed to load theme timeline runs:', error)
        toast.error('无法加载主题时间线')
      })
      .finally(() => setLoading(false))
  }, [])

  async function create(event: FormEvent) {
    event.preventDefault()
    if (!theme.trim() || !startDate || !endDate) return
    setProcessing(true)
    try {
      const run = await createThemeTimeline({ theme: theme.trim(), startDate, endDate })
      applyRun(run)
      toast.success(`已冻结 ${run.frozenSourceCount} 篇来源，并选出范围内 ${run.coverage.eligible} 篇`)
    } catch (error) {
      console.error('Failed to create theme timeline:', error)
      toast.error(error instanceof Error ? error.message : '无法创建主题时间线')
    } finally {
      setProcessing(false)
    }
  }

  async function processAll(runId: string) {
    setProcessing(true)
    let consecutiveFailures = 0
    try {
      while (true) {
        const response = await processThemeTimeline(runId)
        applyRun(response.run)
        if (response.outcome === 'complete') {
          toast.success('主题时间线提取和待审核摘要已完成')
          break
        }
        if (response.outcome === 'failed') {
          consecutiveFailures += 1
          if (consecutiveFailures >= 3 || response.run.coverage.pending === 0) {
            toast.error('主题提取已暂停；请检查失败来源后重试')
            break
          }
        } else {
          consecutiveFailures = 0
        }
        await delay(PROCESS_INTERVAL_MS)
      }
    } catch (error) {
      console.error('Failed to process theme timeline:', error)
      toast.error(error instanceof Error ? error.message : '主题时间线处理已暂停')
    } finally {
      setProcessing(false)
    }
  }

  async function retry(runId: string) {
    setProcessing(true)
    try {
      applyRun(await retryThemeTimeline(runId))
      toast.success('失败来源已重新加入本次运行')
    } catch (error) {
      console.error('Failed to retry theme timeline:', error)
      toast.error(error instanceof Error ? error.message : '无法重试主题时间线')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>可审核主题时间线（Phase 3A）</CardTitle>
        <CardDescription>按冻结语料逐篇提取指定主题，显示完整覆盖率、确定性月份分布、原日记证据和可保留历史的审核状态。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className={`rounded-md border px-3 py-2 text-sm ${localProcessingEnabled ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300' : 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'}`}>
          {localProcessingEnabled
            ? '本地 Phase 3 提取已启用；每篇来源单独预留 ModelScope 日额度并可中断续跑。'
            : '线上只读取和审核已存储结果；创建、提取和失败重试必须在本地开发服务器执行。'}
        </div>

        <form onSubmit={create} className="space-y-3">
          <Input value={theme} onChange={(event) => setTheme(event.target.value)} maxLength={200} placeholder="主题，例如：个人知识库、运动习惯、职业目标" />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm"><span className="text-muted-foreground">开始日期</span><Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
            <label className="space-y-1 text-sm"><span className="text-muted-foreground">结束日期</span><Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
          </div>
          <Button type="submit" disabled={!localProcessingEnabled || processing || !theme.trim() || !startDate || !endDate}>
            {processing ? <Spinner className="h-4 w-4" /> : null}创建冻结运行
          </Button>
        </form>

        {loading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner className="h-4 w-4" />正在读取主题时间线...</div> : runs.length > 0 && (
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">查看运行</span>
            <select
              value={selectedRun?.id ?? ''}
              onChange={(event) => setSelectedRunId(event.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              {runs.map((run) => (
                <option key={run.id} value={run.id}>{run.theme} · {run.startDate}–{run.endDate} · {STATUS_LABELS[run.status]}</option>
              ))}
            </select>
          </label>
        )}

        {selectedRun && (
          <div className="space-y-5 border-t pt-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{selectedRun.theme}</h3>
                <p className="text-sm text-muted-foreground">{selectedRun.startDate} 至 {selectedRun.endDate} · {STATUS_LABELS[selectedRun.status]}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => void processAll(selectedRun.id)}
                  disabled={!localProcessingEnabled || processing || selectedRun.status === 'completed' || selectedRun.coverage.stale > 0}
                >
                  {processing ? <Spinner className="h-4 w-4" /> : null}
                  {selectedRun.status === 'paused' ? '继续处理' : '处理到完成'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void retry(selectedRun.id)}
                  disabled={!localProcessingEnabled || processing || selectedRun.coverage.failed === 0}
                >
                  重试失败来源
                </Button>
              </div>
            </div>

            <Coverage run={selectedRun} />

            {selectedRun.periodDistribution.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold">语义提取结果的月份分布</h3>
                <p className="text-xs text-muted-foreground">数量由 PostgreSQL 对结构化观察中的 distinct diary 计算；它不是关键词字面出现次数。覆盖与 extractor 版本见上方。</p>
                <div className="flex flex-wrap gap-2">
                  {selectedRun.periodDistribution.map((period) => (
                    <span key={period.period} className="rounded-md border px-3 py-2 text-sm">{period.period} · {period.diaryCount} 篇</span>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">首个支持日期 {selectedRun.firstSupportedDate ?? '—'} · 最后支持日期 {selectedRun.lastSupportedDate ?? '—'}</p>
              </div>
            )}

            <SummaryReview run={selectedRun} onRun={applyRun} />

            {selectedRun.observations.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold">逐日记观察与原文证据（{selectedRun.observations.length}）</h3>
                {selectedRun.observations.map((observation) => (
                  <Card key={observation.id} className="gap-3 py-4">
                    <CardHeader className="px-4 sm:px-6">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <CardTitle className="text-base">{observation.sourceTitle || `日记 ${observation.sourceDate}`}</CardTitle>
                          <CardDescription>{observation.sourceDate} · {observation.classification} · {observation.reviewState}</CardDescription>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => void onOpenDiary(observation.sourceId)}>打开原日记</Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 px-4 sm:px-6">
                      <p className="text-sm leading-7">{observation.statement}</p>
                      {observation.evidence.map((evidence) => (
                        <blockquote key={evidence.id} className="border-l-2 pl-3 text-sm leading-7 text-muted-foreground">
                          片段 #{evidence.chunkIndex + 1}：{evidence.excerpt}
                        </blockquote>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
