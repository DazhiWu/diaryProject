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
  generateThemeTimelineComparison,
  processThemeTimeline,
  regenerateThemeTimelineAggregate,
  regenerateThemeTimelineSummary,
  retryThemeTimeline,
  reviewThemeTimelineObservation,
  reviewThemeTimelineComparisonFinding,
  reviewThemeTimelineSummary,
  type ThemeTimelineRun,
  type ThemeTimelineAggregate,
  type ThemeTimelineSummary,
} from '@/lib/knowledgeApi'
import {
  DEFAULT_THEME_TIMELINE_GENERATION_CONFIG,
  THEME_TIMELINE_CONFIG_LIMITS,
  type ThemeTimelineGenerationConfig,
} from '@/lib/themeTimelineConfig'
import {
  buildDefaultThemeTimelineThemeSpec,
  parseThemeSpecRules,
  parseThemeTimelineThemeSpec,
} from '@/lib/themeTimelineThemeSpec'

const PROCESS_INTERVAL_MS = 2_000

const STATUS_LABELS: Record<ThemeTimelineRun['status'], string> = {
  pending: '待处理',
  extracting: '提取中',
  paused: '已暂停',
  ready_for_summary: '待生成摘要',
  awaiting_review: '待审核观察',
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

const AGGREGATE_STALE_LABELS: Record<string, string> = {
  aggregate_superseded: '已被后续聚合版本取代',
  run_metadata_changed: '运行覆盖或版本元数据已变化',
  source_snapshot_changed: '来源索引快照已变化',
  observation_snapshot_changed: '审核观察集合或内容已变化',
  aggregate_generation_config_invalid: '冻结的生成配置无法解析',
}

const COMPARISON_STALE_LABELS: Record<string, string> = {
  comparison_superseded: '已被后续比较版本取代',
  aggregate_changed: '所属聚合已变化或 stale',
  period_snapshot_changed: '期间统计快照已变化',
  finding_links_changed: '候选结论的左右证据链接已变化',
  comparison_analysis_config_invalid: '冻结的比较配置无法解析',
}

const FINDING_TYPE_LABELS: Record<ThemeTimelineAggregate['comparisons'][number]['findings'][number]['findingType'], string> = {
  continuity: '连续性',
  change: '变化',
  possible_contradiction: '可能矛盾',
  turning_point: '可能转折点',
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

function finiteInputValue(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function mergeThemeSpecRules(base: string[], additions: string): string[] {
  return Array.from(new Set([...base, ...parseThemeSpecRules(additions)]))
}

type GenerationNumberField = {
  [Key in keyof ThemeTimelineGenerationConfig]:
    ThemeTimelineGenerationConfig[Key] extends number ? Key : never
}[keyof ThemeTimelineGenerationConfig]

function currentSummary(run: ThemeTimelineRun): ThemeTimelineSummary | null {
  return run.summaries.find((summary) => summary.reviewState !== 'superseded') ?? run.summaries[0] ?? null
}

function currentAggregate(run: ThemeTimelineRun): ThemeTimelineAggregate | null {
  return run.aggregates.find((aggregate) => aggregate.status === 'current') ?? null
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
        本主题运行首次证据处理最多调用 {run.coverage.eligible * 2} 次（每篇 eligible 来源 1 次范围判定，relevant/uncertain 再 1 次观察合成；失败重试另计）。全部观察审核完成后，首个摘要最多再调用 1 次。
      </p>
    </div>
  )
}

function ComparisonFindingCard({
  finding,
  aggregate,
  disabled,
  onRun,
  onOpenDiary,
}: {
  finding: ThemeTimelineAggregate['comparisons'][number]['findings'][number]
  aggregate: ThemeTimelineAggregate
  disabled: boolean
  onRun: (run: ThemeTimelineRun) => void
  onOpenDiary: (sourceId: number) => Promise<void>
}) {
  const [statement, setStatement] = useState(finding.statement)
  const [classification, setClassification] = useState(finding.classification)
  const [reviewing, setReviewing] = useState(false)
  const contributionById = useMemo(
    () => new Map(aggregate.contributions.map((item) => [item.observationId, item])),
    [aggregate.contributions],
  )
  const inferenceOnly = finding.findingType === 'possible_contradiction' || finding.findingType === 'turning_point'
  const changed = statement.trim() !== finding.statement || classification !== finding.classification

  useEffect(() => {
    setStatement(finding.statement)
    setClassification(finding.classification)
  }, [finding.classification, finding.id, finding.statement])

  async function review(reviewAction: 'confirm' | 'edit' | 'reject') {
    setReviewing(true)
    try {
      const updated = await reviewThemeTimelineComparisonFinding({
        findingId: finding.id,
        reviewAction,
        statement: reviewAction === 'edit' ? statement.trim() : undefined,
        classification: reviewAction === 'edit' ? classification : undefined,
      })
      onRun(updated)
      toast.success(reviewAction === 'confirm' ? '比较结论已确认' : reviewAction === 'edit' ? '比较结论已编辑' : '比较结论已拒绝')
    } catch (error) {
      console.error('Failed to review theme timeline comparison finding:', error)
      toast.error(error instanceof Error ? error.message : '比较结论审核失败')
    } finally {
      setReviewing(false)
    }
  }

  function evidenceList(side: 'left' | 'right', ids: string[]) {
    return (
      <div className="space-y-1 rounded-md border p-2">
        <div className="text-xs font-medium text-muted-foreground">{side === 'left' ? '较早期间证据' : '较晚期间证据'}</div>
        {ids.map((id) => {
          const contribution = contributionById.get(id)
          if (!contribution) return <div key={id} className="text-xs text-destructive">证据链接缺失：{id}</div>
          return (
            <button
              key={id}
              type="button"
              className="block w-full rounded px-1 py-1 text-left text-xs hover:bg-muted"
              onClick={() => void onOpenDiary(contribution.sourceId)}
            >
              {contribution.sourceDate} · {contribution.sourceTitle || `日记 ${contribution.sourceId}`} · {contribution.classification}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">
          #{finding.position} {FINDING_TYPE_LABELS[finding.findingType]}
        </div>
        <div className="text-xs text-muted-foreground">{finding.classification} · {REVIEW_LABELS[finding.reviewState]}</div>
      </div>
      <textarea
        value={statement}
        onChange={(event) => setStatement(event.target.value)}
        maxLength={2_000}
        className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm leading-6"
        disabled={disabled || finding.reviewState === 'rejected'}
      />
      <select
        value={classification}
        onChange={(event) => setClassification(event.target.value as typeof classification)}
        className="h-9 rounded-md border bg-background px-2 text-sm"
        disabled={disabled || finding.reviewState === 'rejected' || inferenceOnly}
      >
        {inferenceOnly ? <option value="inference">inference</option> : null}
        {!inferenceOnly ? <option value="fact">fact</option> : null}
        {!inferenceOnly ? <option value="summary">summary</option> : null}
        {!inferenceOnly ? <option value="inference">inference</option> : null}
      </select>
      <div className="grid gap-2 sm:grid-cols-2">
        {evidenceList('left', finding.leftObservationIds)}
        {evidenceList('right', finding.rightObservationIds)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void review('confirm')} disabled={disabled || reviewing || finding.reviewState === 'confirmed' || finding.reviewState === 'rejected'}>确认</Button>
        <Button size="sm" variant="outline" onClick={() => void review('edit')} disabled={disabled || reviewing || finding.reviewState === 'rejected' || !statement.trim() || !changed}>保存编辑</Button>
        <Button size="sm" variant="destructive" onClick={() => void review('reject')} disabled={disabled || reviewing || finding.reviewState === 'rejected'}>拒绝</Button>
      </div>
      {finding.reviews.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">查看审核历史（{finding.reviews.length}）</summary>
          <div className="mt-2 space-y-2">
            {finding.reviews.map((review) => (
              <div key={review.id} className="rounded-md border p-2">
                {new Date(review.reviewedAt).toLocaleString()} · {review.action} · {REVIEW_LABELS[review.resultingReviewState]}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function PeriodComparison({
  run,
  aggregate,
  localProcessingEnabled,
  onRun,
  onOpenDiary,
}: {
  run: ThemeTimelineRun
  aggregate: ThemeTimelineAggregate
  localProcessingEnabled: boolean
  onRun: (run: ThemeTimelineRun) => void
  onOpenDiary: (sourceId: number) => Promise<void>
}) {
  const usablePeriods = useMemo(
    () => aggregate.periods.filter((period) => period.acceptedObservationCount > 0),
    [aggregate.periods],
  )
  const [leftPeriod, setLeftPeriod] = useState(usablePeriods[0]?.period ?? '')
  const [rightPeriod, setRightPeriod] = useState(usablePeriods[1]?.period ?? '')
  const [generating, setGenerating] = useState(false)
  const comparison = aggregate.comparisons.find((item) => (
    item.status === 'current' && item.leftPeriod === leftPeriod && item.rightPeriod === rightPeriod
  )) ?? null

  useEffect(() => {
    setLeftPeriod(usablePeriods[0]?.period ?? '')
    setRightPeriod(usablePeriods[1]?.period ?? '')
  }, [aggregate.id, usablePeriods])

  async function generate() {
    setGenerating(true)
    try {
      const updated = await generateThemeTimelineComparison({
        runId: run.id,
        aggregateId: aggregate.id,
        leftPeriod,
        rightPeriod,
      })
      onRun(updated)
      toast.success(comparison ? '期间比较已重新生成' : '期间比较已生成，所有结论等待审核')
    } catch (error) {
      console.error('Failed to generate theme timeline comparison:', error)
      toast.error(error instanceof Error ? error.message : '期间比较生成失败')
    } finally {
      setGenerating(false)
    }
  }

  const ready = localProcessingEnabled
    && !aggregate.resultStale
    && usablePeriods.length >= 2
    && leftPeriod < rightPeriod

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div>
        <h4 className="font-semibold">期间变化与可能矛盾（Phase 3D）</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          仅比较同一聚合中的两个完整自然月。Ollama 生成的变化、连续性、可能矛盾和转折点全部是待审核解释；精确计数仍来自 PostgreSQL。
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <select value={leftPeriod} onChange={(event) => setLeftPeriod(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm">
          <option value="">较早期间</option>
          {usablePeriods.map((period) => <option key={period.period} value={period.period}>{period.period}</option>)}
        </select>
        <select value={rightPeriod} onChange={(event) => setRightPeriod(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm">
          <option value="">较晚期间</option>
          {usablePeriods.map((period) => <option key={period.period} value={period.period}>{period.period}</option>)}
        </select>
        <Button size="sm" onClick={() => void generate()} disabled={!ready || generating}>
          {generating ? <Spinner className="h-4 w-4" /> : null}
          {comparison ? '重新生成比较' : '生成比较'}
        </Button>
      </div>
      {!localProcessingEnabled && <p className="text-xs text-muted-foreground">比较生成会调用本地 Ollama，因此生产环境只允许读取和审核，不允许生成。</p>}
      {usablePeriods.length < 2 && <p className="text-sm text-muted-foreground">当前聚合只有一个含审核观察的月份；至少两个自然月后才能比较，不会跨独立运行拼接。</p>}
      {leftPeriod && rightPeriod && leftPeriod >= rightPeriod && <p className="text-sm text-destructive">较早期间必须早于较晚期间。</p>}
      {comparison && (
        <div className="space-y-3 border-t pt-3">
          {comparison.resultStale && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
              此比较已 stale：{comparison.staleReasons.map((reason) => COMPARISON_STALE_LABELS[reason] ?? reason).join('；')}。
            </div>
          )}
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-md border p-3">{comparison.leftPeriod}：来源 {comparison.leftProcessedSourceCount} · 观察 {comparison.leftAcceptedObservationCount} · 日记 {comparison.leftDistinctDiaryCount}</div>
            <div className="rounded-md border p-3">{comparison.rightPeriod}：来源 {comparison.rightProcessedSourceCount} · 观察 {comparison.rightAcceptedObservationCount} · 日记 {comparison.rightDistinctDiaryCount}</div>
          </div>
          <div className="space-y-2">
            {comparison.findings.map((finding) => (
              <ComparisonFindingCard
                key={finding.id}
                finding={finding}
                aggregate={aggregate}
                disabled={comparison.resultStale || comparison.status !== 'current'}
                onRun={onRun}
                onOpenDiary={onOpenDiary}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Model {comparison.analysisModelVersion} · Prompt {comparison.analysisPromptVersion} · {new Date(comparison.createdAt).toLocaleString()}</p>
        </div>
      )}
      {aggregate.comparisons.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">比较版本历史（{aggregate.comparisons.length}）</summary>
          <div className="mt-2 space-y-1">
            {aggregate.comparisons.map((item) => <div key={item.id}>{item.leftPeriod} → {item.rightPeriod} · {item.status === 'current' ? '当前' : '已取代'} · {item.findings.length} 条候选</div>)}
          </div>
        </details>
      )}
    </div>
  )
}

function CorpusAggregate({
  run,
  onRun,
  onOpenDiary,
  localProcessingEnabled,
}: {
  run: ThemeTimelineRun
  onRun: (run: ThemeTimelineRun) => void
  onOpenDiary: (sourceId: number) => Promise<void>
  localProcessingEnabled: boolean
}) {
  const aggregate = currentAggregate(run)
  const [aggregating, setAggregating] = useState(false)
  const unreviewedCount = run.observations.filter((observation) => (
    observation.reviewState !== 'confirmed'
    && observation.reviewState !== 'edited'
    && observation.reviewState !== 'rejected'
  )).length
  const ready = run.status === 'completed' && !run.resultStale && unreviewedCount === 0

  async function regenerate() {
    setAggregating(true)
    try {
      const updated = await regenerateThemeTimelineAggregate(run.id)
      onRun(updated)
      toast.success(aggregate ? '确定性语料聚合已重新生成' : '确定性语料聚合已生成')
    } catch (error) {
      console.error('Failed to regenerate theme timeline aggregate:', error)
      toast.error(error instanceof Error ? error.message : '语料聚合生成失败')
    } finally {
      setAggregating(false)
    }
  }

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">确定性语料聚合（Phase 3C）</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            PostgreSQL 对单个运行的已确认/已编辑观察生成月度快照；不会合并其他试跑，也不会调用模型或付费服务。
          </p>
        </div>
        <Button size="sm" onClick={() => void regenerate()} disabled={!ready || aggregating}>
          {aggregating ? <Spinner className="h-4 w-4" /> : null}
          {aggregate ? '重新生成聚合快照' : '生成聚合快照'}
        </Button>
      </div>

      {!ready && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          {run.resultStale
            ? '当前运行已 stale，不能生成聚合。'
            : run.status !== 'completed'
              ? '运行完成后才能生成聚合。'
              : `仍有 ${unreviewedCount} 条观察未审核；全部确认、编辑或拒绝后才能生成聚合。`}
        </p>
      )}

      {aggregate ? (
        <>
          {aggregate.resultStale && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
              此聚合已 stale：{aggregate.staleReasons.map((reason) => AGGREGATE_STALE_LABELS[reason] ?? reason).join('；')}。请显式重新生成，旧版本会保留为历史。
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div className="rounded-md border p-3"><div className="text-muted-foreground">字面来源覆盖</div><div className="mt-1 text-xl font-semibold">{aggregate.processedSourceCount} / {aggregate.eligibleSourceCount}</div></div>
            <div className="rounded-md border p-3"><div className="text-muted-foreground">审核语义观察</div><div className="mt-1 text-xl font-semibold">{aggregate.acceptedObservationCount}</div></div>
            <div className="rounded-md border p-3"><div className="text-muted-foreground">支持日记</div><div className="mt-1 text-xl font-semibold">{aggregate.distinctDiaryCount}</div></div>
            <div className="rounded-md border p-3"><div className="text-muted-foreground">确认 / 编辑</div><div className="mt-1 text-xl font-semibold">{aggregate.confirmedObservationCount} / {aggregate.editedObservationCount}</div></div>
          </div>
          <p className="text-xs text-muted-foreground">
            “来源覆盖”是数据库行的字面计数；观察数和支持日记数是语义提取结果的确定性计数，不是主题关键词在原文中的出现次数。
            支持日期 {aggregate.firstSupportedDate ?? '—'} 至 {aggregate.lastSupportedDate ?? '—'}。
          </p>
          <div className="space-y-2">
            <h4 className="text-sm font-medium">月度覆盖与语义结果</h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {aggregate.periods.map((period) => (
                <div key={period.period} className="rounded-md border p-3 text-sm">
                  <div className="font-medium">{period.period}</div>
                  <div className="mt-1 text-muted-foreground">
                    来源 {period.processedSourceCount}/{period.eligibleSourceCount} · 审核观察 {period.acceptedObservationCount} · 支持日记 {period.distinctDiaryCount}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            冻结语料 {aggregate.frozenSourceCount} 篇 · fingerprint {aggregate.corpusFingerprint} · Model {aggregate.modelVersion} · Prompt {aggregate.promptVersion} · 生成于 {new Date(aggregate.createdAt).toLocaleString()}
          </p>
          {aggregate.contributions.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">查看聚合所冻结的观察与原日记链（{aggregate.contributions.length}）</summary>
              <div className="mt-3 space-y-2">
                {aggregate.contributions.map((contribution) => (
                  <div key={contribution.observationId} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{contribution.sourceTitle || `日记 ${contribution.sourceDate}`}</div>
                        <div className="text-xs text-muted-foreground">{contribution.sourceDate} · {contribution.classification} · {contribution.reviewState} · {contribution.evidenceCount} 条原文证据</div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => void onOpenDiary(contribution.sourceId)}>打开原日记</Button>
                    </div>
                    <p className="mt-2 leading-7">{contribution.statement}</p>
                  </div>
                ))}
              </div>
            </details>
          )}
          {run.aggregates.length > 1 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">查看聚合历史（{run.aggregates.length}）</summary>
              <div className="mt-3 space-y-2">
                {run.aggregates.map((item) => (
                  <div key={item.id} className="rounded-md border p-3 text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()} · {item.status === 'current' ? '当前' : '已取代'} · 观察 {item.acceptedObservationCount} · 支持日记 {item.distinctDiaryCount}
                  </div>
                ))}
              </div>
            </details>
          )}
          <PeriodComparison
            run={run}
            aggregate={aggregate}
            localProcessingEnabled={localProcessingEnabled}
            onRun={onRun}
            onOpenDiary={onOpenDiary}
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">尚未生成 Phase 3C 聚合。已审核的月度试跑可以直接作为首个聚合输入，无需处理 pending 日记或重新提取。</p>
      )}
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

  const unreviewedCount = run.observations.filter((observation) => (
    observation.reviewState !== 'confirmed'
    && observation.reviewState !== 'edited'
    && observation.reviewState !== 'rejected'
  )).length
  const acceptedCount = run.observations.filter((observation) => (
    observation.reviewState === 'confirmed' || observation.reviewState === 'edited'
  )).length
  const rejectedCount = run.observations.filter((observation) => observation.reviewState === 'rejected').length

  async function review(reviewAction: 'confirm' | 'edit' | 'reject' | 'supersede') {
    if (!summary) return
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
  if (!summary) {
    if (run.status !== 'awaiting_review') return null
    return (
      <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
        <h3 className="font-semibold">先审核观察，再生成首个摘要</h3>
        <p>证据范围判定和逐日记观察已完成。摘要不会直接使用模型的未审核结果，只会读取你已确认或编辑的观察，并排除已拒绝观察。</p>
        <p className="text-xs text-muted-foreground">
          已保留 {acceptedCount} 条 · 已拒绝 {rejectedCount} 条 · 待审核 {unreviewedCount} 条
        </p>
        {unreviewedCount > 0 && (
          <p className="text-amber-700 dark:text-amber-300">请先审核剩余 {unreviewedCount} 条观察。</p>
        )}
        {!localProcessingEnabled && (
          <p className="text-amber-700 dark:text-amber-300">首个摘要需要访问本地 Ollama，只能在本地开发服务器执行。</p>
        )}
        <div>
          <Button
            size="sm"
            onClick={() => void regenerate()}
            disabled={!localProcessingEnabled || regenerating || run.resultStale || unreviewedCount > 0}
          >
            {regenerating ? <Spinner className="h-4 w-4" /> : null}
            生成首个待审核摘要
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">有保留观察时只调用一次本地 Ollama；全部拒绝时由服务器生成固定说明，不调用模型。</p>
      </div>
    )
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
  const reviewBlockedMessage = run.versionStale
    ? '本次运行的模型或 Prompt 版本已变化；该观察只能作为历史记录查看，不能审核。'
    : run.coverage.stale > 0
      ? `有 ${run.coverage.stale} 篇冻结来源的哈希、索引状态或原文分块已变化；该观察只能作为历史记录查看，不能审核。`
      : run.status !== 'completed' && run.status !== 'awaiting_review'
        ? `本次运行尚未完成证据处理（已处理 ${run.coverage.processed}/${run.coverage.eligible}，失败 ${run.coverage.failed}，待处理 ${run.coverage.pending}）。这不是来源内容发生变化。`
        : '本次运行的处理覆盖不完整；该观察暂时不能审核。'

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
              <CardDescription>
                {observation.sourceDate} · {observation.classification} · {observation.scopeDecision === 'uncertain' ? '范围不确定' : '范围相关'} · {REVIEW_LABELS[observation.reviewState]}
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => void onOpenDiary(observation.sourceId)}>打开原日记</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 px-4 sm:px-6">
          <p className="text-sm leading-7">{observation.statement}</p>
          {observation.scopeReason && (
            <p className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              范围判定理由：{observation.scopeReason}
            </p>
          )}
          {observation.scopeDecision === 'uncertain' && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
              模型无法确认人物关系或主题边界。该观察在人工确认或编辑前不会进入摘要或 Phase 3C 聚合。
            </p>
          )}
          {observation.evidence.map((evidence) => (
            <blockquote key={evidence.id} className="border-l-2 pl-3 text-sm leading-7 text-muted-foreground">
              {evidence.unitId
                ? `证据 ${evidence.unitId}（原片段 #${evidence.chunkIndex + 1}，字符 ${evidence.charStart}–${evidence.charEnd}）：`
                : `旧证据片段 #${evidence.chunkIndex + 1}：`}
              {evidence.excerpt}
            </blockquote>
          ))}
          {run.resultStale && (
            <p className="text-sm text-amber-700 dark:text-amber-300">{reviewBlockedMessage}</p>
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
  const [additionalIncludeRules, setAdditionalIncludeRules] = useState('')
  const [additionalExcludeRules, setAdditionalExcludeRules] = useState('')
  const [additionalAmbiguousRules, setAdditionalAmbiguousRules] = useState('')
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
      const defaultThemeSpec = buildDefaultThemeTimelineThemeSpec(theme.trim())
      const themeSpec = parseThemeTimelineThemeSpec({
        ...defaultThemeSpec,
        include: mergeThemeSpecRules(defaultThemeSpec.include, additionalIncludeRules),
        exclude: mergeThemeSpecRules(defaultThemeSpec.exclude, additionalExcludeRules),
        ambiguous: mergeThemeSpecRules(defaultThemeSpec.ambiguous, additionalAmbiguousRules),
      })
      const run = await createThemeTimeline({
        theme: theme.trim(),
        themeSpec,
        startDate,
        endDate,
        generationConfig,
      })
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
        if (response.run.status === 'awaiting_review') {
          toast.success('证据筛选和观察生成已完成；请审核观察后生成首个摘要')
          break
        }
        if (response.outcome === 'complete') {
          toast.success('主题时间线已完成')
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
        <CardTitle>可审核主题时间线（Phase 3A–3C）</CardTitle>
        <CardDescription>按冻结语料逐篇提取、审核指定主题，并由 PostgreSQL 生成可追踪、可再生的确定性语料聚合。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className={`rounded-md border px-3 py-2 text-sm ${localProcessingEnabled ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300' : 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'}`}>
          {localProcessingEnabled
            ? '本地 Phase 3 处理已启用；每篇 eligible 来源先做一次主题范围/句子证据选择，relevant 或 uncertain 时再用所选证据合成观察。所有观察须先人工审核，之后才生成首个摘要。'
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
            <summary className="cursor-pointer font-medium">主题范围契约（创建后冻结）</summary>
            <p className="mt-2 text-xs text-muted-foreground">
              将主题写成“名称：定义”会自动拆分名称与定义，并生成通用排除/不确定规则。“友情/友谊/朋友”会额外排除未明示为朋友的家庭、亲密关系、同事等邻近关系。下方每行可再增加一条本主题的约束。
            </p>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">额外纳入规则</span>
                <textarea value={additionalIncludeRules} onChange={(event) => setAdditionalIncludeRules(event.target.value)} className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="例：明确记录朋友之间的联系或帮助" />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">额外排除规则</span>
                <textarea value={additionalExcludeRules} onChange={(event) => setAdditionalExcludeRules(event.target.value)} className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="例：只描述行程价格，没有朋友互动" />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">额外边界/不确定规则</span>
                <textarea value={additionalAmbiguousRules} onChange={(event) => setAdditionalAmbiguousRules(event.target.value)} className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="例：无法确认某人是否为朋友时标记 uncertain" />
              </label>
            </div>
          </details>
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
                  disabled={!localProcessingEnabled || processing || ['ready_for_summary', 'awaiting_review', 'completed'].includes(selectedRun.status) || selectedRun.coverage.stale > 0}
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

            <details className="rounded-md border p-3 text-sm">
              <summary className="cursor-pointer font-medium">查看本运行冻结的主题范围契约</summary>
              <div className="mt-3 space-y-3">
                <p><span className="text-muted-foreground">名称：</span>{selectedRun.themeSpec.name}</p>
                <p><span className="text-muted-foreground">定义：</span>{selectedRun.themeSpec.definition}</p>
                {([
                  ['纳入', selectedRun.themeSpec.include],
                  ['排除', selectedRun.themeSpec.exclude],
                  ['不确定边界', selectedRun.themeSpec.ambiguous],
                ] as const).map(([label, rules]) => (
                  <div key={label}>
                    <div className="text-muted-foreground">{label}：</div>
                    {rules.length > 0 ? (
                      <ul className="mt-1 list-disc space-y-1 pl-5">
                        {rules.map((rule) => <li key={rule}>{rule}</li>)}
                      </ul>
                    ) : <p className="mt-1 text-muted-foreground">无</p>}
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">Pipeline {selectedRun.pipelineVersion}</p>
              </div>
            </details>

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
                <h3 className="font-semibold">语义提取结果的月份预览</h3>
                <p className="text-xs text-muted-foreground">这是审核界面对当前结构化观察的即时预览，不是关键词字面出现次数；下方 Phase 3C 聚合快照才是 PostgreSQL 生成并冻结的确定性统计。</p>
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

            <CorpusAggregate
              run={selectedRun}
              onRun={applyRun}
              onOpenDiary={onOpenDiary}
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
