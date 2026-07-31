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
  regenerateThemeTimelineSummary,
  retryThemeTimeline,
  reviewThemeTimelineObservation,
  reviewThemeTimelineSummary,
  type ThemeTimelineRun,
  type ThemeTimelineSummary,
} from '@/lib/knowledgeApi'
import {
  DEFAULT_THEME_TIMELINE_GENERATION_CONFIG,
  THEME_TIMELINE_CONFIG_LIMITS,
  type ThemeTimelineGenerationConfig,
} from '@/lib/themeTimelineConfig'

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

const FAILURE_LABELS: Record<ThemeTimelineRun['failures'][number]['category'], string> = {
  invalid_input: '输入准备失败',
  invalid_response: '模型结构化输出无效',
  legacy: '旧格式错误',
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

function finiteInputValue(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

type GenerationNumberField = {
  [Key in keyof ThemeTimelineGenerationConfig]:
    ThemeTimelineGenerationConfig[Key] extends number ? Key : never
}[keyof ThemeTimelineGenerationConfig]

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
      <p className="text-xs text-muted-foreground">
        Ollama 参数：num_ctx {run.generationConfig.numCtx} · temperature {run.generationConfig.temperature} ·
        top_p {run.generationConfig.topP} · top_k {run.generationConfig.topK} ·
        thinking {run.generationConfig.thinking ? '开启' : '关闭'} ·
        提取/摘要输出上限 {run.generationConfig.extractionMaxTokens}/{run.generationConfig.summaryMaxTokens} tokens
      </p>
      <p className="text-xs text-muted-foreground">
        本主题运行首次完整处理最多调用 {run.coverage.eligible + 1} 次（每篇 eligible 来源 1 次，存在观察时摘要 1 次；无观察不调用摘要，失败重试另计）。
      </p>
    </div>
  )
}

function SummaryReview({
  run,
  onRun,
  localProcessingEnabled,
}: {
  run: ThemeTimelineRun
  onRun: (run: ThemeTimelineRun) => void
  localProcessingEnabled: boolean
}) {
  const summary = currentSummary(run)
  const [replacement, setReplacement] = useState(summary?.statement ?? '')
  const [reviewing, setReviewing] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

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

  async function regenerate() {
    setRegenerating(true)
    try {
      const updated = await regenerateThemeTimelineSummary(run.id)
      onRun(updated)
      toast.success('已基于审核通过的观察生成新的待审核摘要')
    } catch (error) {
      console.error('Failed to regenerate theme timeline summary:', error)
      toast.error(error instanceof Error ? error.message : '主题摘要重新生成失败')
    } finally {
      setRegenerating(false)
    }
  }

  const hasActiveSummary = run.summaries.some((item) => (
    item.reviewState === 'proposed'
    || item.reviewState === 'confirmed'
    || item.reviewState === 'edited'
  ))
  const unreviewedCount = run.observations.filter((observation) => (
    observation.reviewState !== 'confirmed'
    && observation.reviewState !== 'edited'
    && observation.reviewState !== 'rejected'
  )).length
  const acceptedCount = run.observations.filter((observation) => (
    observation.reviewState === 'confirmed' || observation.reviewState === 'edited'
  )).length
  const rejectedCount = run.observations.filter((observation) => observation.reviewState === 'rejected').length
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
      {!hasActiveSummary && (
        <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <p>旧摘要已进入历史。新摘要只会使用已确认或已编辑的观察，并排除已拒绝的观察。</p>
          <p className="text-xs text-muted-foreground">
            已保留 {acceptedCount} 条 · 已拒绝 {rejectedCount} 条 · 待审核 {unreviewedCount} 条
          </p>
          {unreviewedCount > 0 && (
            <p className="text-amber-700 dark:text-amber-300">请先审核剩余 {unreviewedCount} 条观察，完成后才能重新生成摘要。</p>
          )}
          {!localProcessingEnabled && (
            <p className="text-amber-700 dark:text-amber-300">摘要重新生成需要访问本地 Ollama，只能在本地开发服务器执行。</p>
          )}
          <Button
            size="sm"
            onClick={() => void regenerate()}
            disabled={!localProcessingEnabled || regenerating || run.resultStale || unreviewedCount > 0}
          >
            {regenerating ? <Spinner className="h-4 w-4" /> : null}
            重新生成待审核摘要
          </Button>
          <p className="text-xs text-muted-foreground">有保留观察时，此操作只调用一次本地 Ollama；全部拒绝时生成固定说明。两种情况都不会重新提取日记。</p>
        </div>
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

function ObservationPager({
  run,
  onOpenDiary,
  onRun,
}: {
  run: ThemeTimelineRun
  onOpenDiary: (sourceId: number) => Promise<void>
  onRun: (run: ThemeTimelineRun) => void
}) {
  const observations = run.observations
  const [observationIndex, setObservationIndex] = useState(0)
  const [replacement, setReplacement] = useState('')
  const [classification, setClassification] = useState<'fact' | 'summary' | 'inference'>('summary')
  const [reviewing, setReviewing] = useState(false)
  const lastIndex = observations.length - 1
  const observation = observations[observationIndex] ?? observations[0]

  useEffect(() => setObservationIndex(0), [run.id])
  useEffect(() => {
    setObservationIndex((current) => Math.min(current, Math.max(lastIndex, 0)))
  }, [lastIndex])
  useEffect(() => {
    setReplacement(observation?.statement ?? '')
    setClassification(observation?.classification ?? 'summary')
  }, [observation?.id, observation?.statement, observation?.classification])

  if (!observation) return null

  const reviewedCount = observations.filter((item) => (
    item.reviewState === 'confirmed'
    || item.reviewState === 'edited'
    || item.reviewState === 'rejected'
  )).length
  const acceptedCount = observations.filter((item) => (
    item.reviewState === 'confirmed' || item.reviewState === 'edited'
  )).length
  const reviewable = !run.resultStale
    && observation.reviewState !== 'rejected'
    && observation.reviewState !== 'superseded'
  const changed = replacement.trim() !== observation.statement
    || classification !== observation.classification

  async function review(reviewAction: 'confirm' | 'edit' | 'reject') {
    if (reviewAction === 'edit' && (!replacement.trim() || !changed)) return
    setReviewing(true)
    try {
      const updated = await reviewThemeTimelineObservation({
        observationId: observation!.id,
        reviewAction,
        statement: reviewAction === 'edit' ? replacement.trim() : undefined,
        classification: reviewAction === 'edit' ? classification : undefined,
      })
      onRun(updated)
      toast.success(reviewAction === 'confirm'
        ? '逐日记观察已确认'
        : reviewAction === 'edit'
          ? '逐日记观察已保存编辑'
          : '逐日记观察已拒绝')
    } catch (error) {
      console.error('Failed to review theme timeline observation:', error)
      toast.error(error instanceof Error ? error.message : '逐日记观察审核失败')
    } finally {
      setReviewing(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">逐日记观察与原文证据（{observations.length}）</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            已审核 {reviewedCount} / {observations.length} · 可供 Phase 3C 聚合 {acceptedCount} 条
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            aria-label="查看上一篇主题观察"
            onClick={() => setObservationIndex((current) => Math.max(0, current - 1))}
            disabled={observationIndex === 0}
          >
            ← 上一篇
          </Button>
          <span className="min-w-16 text-center text-sm text-muted-foreground">
            {observationIndex + 1} / {observations.length}
          </span>
          <Button
            size="sm"
            variant="outline"
            aria-label="查看下一篇主题观察"
            onClick={() => setObservationIndex((current) => Math.min(lastIndex, current + 1))}
            disabled={observationIndex === lastIndex}
          >
            下一篇 →
          </Button>
        </div>
      </div>
      <Card key={observation.id} className="gap-3 py-4">
        <CardHeader className="px-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">{observation.sourceTitle || `日记 ${observation.sourceDate}`}</CardTitle>
              <CardDescription>{observation.sourceDate} · {observation.classification} · {REVIEW_LABELS[observation.reviewState]}</CardDescription>
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
          {run.resultStale && (
            <p className="text-sm text-amber-700 dark:text-amber-300">来源、覆盖或模型/Prompt 版本已变化；该观察只能作为历史记录查看，不能审核。</p>
          )}
          {reviewable && (
            <div className="space-y-3 border-t pt-3">
              <p className="text-xs text-muted-foreground">编辑或拒绝观察会把引用它的当前主题摘要转为历史版本，避免旧摘要继续参与后续审核。</p>
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">审核后的观察陈述</span>
                <textarea
                  value={replacement}
                  onChange={(event) => setReplacement(event.target.value)}
                  maxLength={2_000}
                  className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">分类</span>
                <select
                  value={classification}
                  onChange={(event) => setClassification(event.target.value as typeof classification)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="fact">fact</option>
                  <option value="summary">summary</option>
                  <option value="inference">inference</option>
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => void review('confirm')}
                  disabled={reviewing || observation.reviewState === 'confirmed'}
                >
                  确认
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void review('edit')}
                  disabled={reviewing || !replacement.trim() || !changed}
                >
                  保存编辑
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => void review('reject')}
                  disabled={reviewing}
                >
                  拒绝
                </Button>
              </div>
            </div>
          )}
          {observation.reviews.length > 0 && (
            <details className="border-t pt-3 text-sm">
              <summary className="cursor-pointer text-muted-foreground">查看审核历史（{observation.reviews.length}）</summary>
              <div className="mt-3 space-y-2">
                {observation.reviews.map((review) => (
                  <div key={review.id} className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">
                      {new Date(review.reviewedAt).toLocaleString()} · {review.action} · {REVIEW_LABELS[review.resultingReviewState]}
                    </div>
                    {review.action === 'edit' && (
                      <>
                        <p className="mt-2 text-xs text-muted-foreground">修改前：{review.previousStatement}</p>
                        <p className="mt-1">修改后：{review.resultingStatement}</p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
        </CardContent>
      </Card>
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
  const [generationConfig, setGenerationConfig] = useState<ThemeTimelineGenerationConfig>({
    ...DEFAULT_THEME_TIMELINE_GENERATION_CONFIG,
  })
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

  function setGenerationNumber(field: GenerationNumberField, value: number) {
    setGenerationConfig((current) => ({
      ...current,
      [field]: finiteInputValue(value, current[field]),
    }))
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
      const run = await createThemeTimeline({ theme: theme.trim(), startDate, endDate, generationConfig })
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
            ? '本地 Phase 3 提取已启用；每篇 eligible 来源调用一次本地 Ollama，并可中断续跑。存在观察时，最后再调用一次生成待审核摘要。'
            : '线上只读取和审核已存储结果；创建、提取和失败重试必须在本地开发服务器执行。'}
        </div>

        <form onSubmit={create} className="space-y-3">
          <Input value={theme} onChange={(event) => setTheme(event.target.value)} maxLength={200} placeholder="主题，例如：个人知识库、运动习惯、职业目标" />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm"><span className="text-muted-foreground">开始日期</span><Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
            <label className="space-y-1 text-sm"><span className="text-muted-foreground">结束日期</span><Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
          </div>
          <p className="text-xs text-muted-foreground">
            每个运行的主题、日期范围、冻结来源和 Ollama 参数创建后不可变。小范围试跑是独立运行，不能扩展为全量运行，也不会自动复用到另一运行。
          </p>
          <details className="rounded-md border p-3" open>
            <summary className="cursor-pointer font-medium">Ollama 运行参数（创建后冻结）</summary>
            <p className="mt-2 text-xs text-muted-foreground">
              API 地址由服务端 OLLAMA_BASE_URL 控制，不接受浏览器传入。自定义提示词之后仍会附加不可覆盖的证据、结构化 JSON 与防提示注入规则。
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-muted-foreground">模型</span>
                <Input
                  value={generationConfig.model}
                  onChange={(event) => setGenerationConfig((current) => ({ ...current, model: event.target.value }))}
                  maxLength={THEME_TIMELINE_CONFIG_LIMITS.modelLength}
                  required
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">num_ctx</span>
                <Input
                  type="number"
                  min={THEME_TIMELINE_CONFIG_LIMITS.minNumCtx}
                  max={THEME_TIMELINE_CONFIG_LIMITS.maxNumCtx}
                  step={1024}
                  value={generationConfig.numCtx}
                  onChange={(event) => setGenerationNumber('numCtx', event.currentTarget.valueAsNumber)}
                  required
                />
              </label>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={generationConfig.thinking}
                  onChange={(event) => setGenerationConfig((current) => ({ ...current, thinking: event.target.checked }))}
                  className="h-4 w-4"
                />
                启用 thinking
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">temperature</span>
                <Input type="number" min={0} max={2} step={0.05} value={generationConfig.temperature} onChange={(event) => setGenerationNumber('temperature', event.currentTarget.valueAsNumber)} required />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">top_p</span>
                <Input type="number" min={0} max={1} step={0.05} value={generationConfig.topP} onChange={(event) => setGenerationNumber('topP', event.currentTarget.valueAsNumber)} required />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">top_k</span>
                <Input type="number" min={0} max={200} step={1} value={generationConfig.topK} onChange={(event) => setGenerationNumber('topK', event.currentTarget.valueAsNumber)} required />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">单篇提取输出 tokens</span>
                <Input type="number" min={THEME_TIMELINE_CONFIG_LIMITS.minOutputTokens} max={THEME_TIMELINE_CONFIG_LIMITS.maxOutputTokens} step={64} value={generationConfig.extractionMaxTokens} onChange={(event) => setGenerationNumber('extractionMaxTokens', event.currentTarget.valueAsNumber)} required />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">最终摘要输出 tokens</span>
                <Input type="number" min={THEME_TIMELINE_CONFIG_LIMITS.minOutputTokens} max={THEME_TIMELINE_CONFIG_LIMITS.maxOutputTokens} step={64} value={generationConfig.summaryMaxTokens} onChange={(event) => setGenerationNumber('summaryMaxTokens', event.currentTarget.valueAsNumber)} required />
              </label>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">单篇提取系统提示词</span>
                <textarea
                  value={generationConfig.extractionSystemPrompt}
                  onChange={(event) => setGenerationConfig((current) => ({ ...current, extractionSystemPrompt: event.target.value }))}
                  maxLength={THEME_TIMELINE_CONFIG_LIMITS.maxSystemPromptLength}
                  className="min-h-36 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  required
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">最终摘要系统提示词</span>
                <textarea
                  value={generationConfig.summarySystemPrompt}
                  onChange={(event) => setGenerationConfig((current) => ({ ...current, summarySystemPrompt: event.target.value }))}
                  maxLength={THEME_TIMELINE_CONFIG_LIMITS.maxSystemPromptLength}
                  className="min-h-36 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  required
                />
              </label>
            </div>
          </details>
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

            {selectedRun.failures.length > 0 && (
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold">失败来源安全诊断</h3>
                  <p className="mt-1 text-xs text-muted-foreground">仅管理员可见。日记与模型输出片段均经过凭据脱敏和长度限制，仍可能包含私人日记内容。</p>
                </div>
                {selectedRun.failures.map((failure) => (
                  <Card key={failure.sourceId} className="gap-3 py-4">
                    <CardHeader className="px-4 sm:px-6">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <CardTitle className="text-base">{failure.sourceTitle || `日记 ${failure.sourceDate}`}</CardTitle>
                          <CardDescription>
                            {failure.sourceDate} · {FAILURE_LABELS[failure.category]}
                            {failure.code ? ` · ${failure.code}` : ''}
                            {failure.status ? ` · HTTP ${failure.status}` : ''}
                            {` · 第 ${failure.attempts} 次尝试`}
                          </CardDescription>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => void onOpenDiary(failure.sourceId)}>打开原日记</Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 px-4 sm:px-6">
                      {failure.diary && (
                        <div>
                          <div className="text-xs font-medium text-muted-foreground">
                            日记诊断片段（{failure.diary.originalChars} 字符{failure.diary.truncated ? '，已截断' : ''}）
                          </div>
                          <blockquote className="mt-1 whitespace-pre-wrap break-words border-l-2 pl-3 text-sm leading-7 text-muted-foreground">{failure.diary.text}</blockquote>
                        </div>
                      )}
                      {failure.modelOutput && (
                        <div>
                          <div className="text-xs font-medium text-muted-foreground">
                            模型输出片段（{failure.modelOutput.originalChars} 字符{failure.modelOutput.truncated ? '，已截断' : ''}）
                          </div>
                          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 text-xs">{failure.modelOutput.text}</pre>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

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

            <SummaryReview
              run={selectedRun}
              onRun={applyRun}
              localProcessingEnabled={localProcessingEnabled}
            />

            {selectedRun.observations.length > 0 && (
              <ObservationPager
                run={selectedRun}
                onOpenDiary={onOpenDiary}
                onRun={applyRun}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
