import type { ThemeTimelineGenerationConfig } from '@/lib/themeTimelineConfig'
import type { ThemeTimelineThemeSpec } from '@/lib/themeTimelineThemeSpec'

export type KnowledgeIndexStatus = {
  executionMode: 'local' | 'status-only'
  totalSources: number
  indexedSources: number
  totalChunks: number
  pending: number
  processing: number
  failed: number
  completed: number
  excluded: number
  lastIndexedAt: string | null
}

export type KnowledgeSearchResult = {
  chunkId: number
  sourceId: number
  chunkIndex: number
  chunkEndIndex: number
  sourceDate: string
  sourceTitle: string | null
  content: string
  charStart: number
  charEnd: number
  similarity: number | null
  score: number
  vectorSimilarity: number | null
  rerankScore: number | null
}

export type KnowledgeCandidateDiagnostic = {
  fusionRank: number
  sourceId: number
  sourceDate: string
  sourceTitle: string | null
  chunkIndex: number
  content: string
  vectorSimilarity: number | null
  rpcScore: number
}

export type KnowledgeRerankerDiagnostic = {
  rerankRank: number
  candidateRank: number
  sourceId: number
  sourceDate: string
  sourceTitle: string | null
  chunkIndex: number
  content: string
  rerankScore: number
}

export type KnowledgeSearchDiagnostics = {
  candidates: KnowledgeCandidateDiagnostic[]
  reranked: KnowledgeRerankerDiagnostic[]
}

export type KnowledgeSearchResponse = {
  results: KnowledgeSearchResult[]
  rerankApplied: boolean
  diagnostics?: KnowledgeSearchDiagnostics
}

export type KnowledgeAnswerCitation = {
  citationId: string
  sourceId: number
  sourceDate: string
  sourceTitle: string | null
  chunkIndex: number
  chunkEndIndex: number
  charStart: number
  charEnd: number
  excerpt: string
}

export type KnowledgeAnswerResponse = {
  answer: string
  evidenceStatus: 'supported' | 'insufficient'
  citations: KnowledgeAnswerCitation[]
  rerankApplied: boolean
}

export type ThemeTimelineEvidence = {
  id: number
  sourceId: number
  chunkId: number
  chunkIndex: number
  unitId: string | null
  charStart: number
  charEnd: number
  excerpt: string
}

export type ThemeTimelineObservation = {
  id: string
  sourceId: number
  sourceDate: string
  sourceTitle: string | null
  statement: string
  classification: 'fact' | 'summary' | 'inference'
  scopeDecision: 'relevant' | 'uncertain'
  scopeReason: string | null
  reviewState: 'proposed' | 'confirmed' | 'edited' | 'rejected' | 'superseded'
  evidence: ThemeTimelineEvidence[]
  reviews: Array<{
    id: number
    action: 'confirm' | 'edit' | 'reject'
    previousStatement: string
    previousClassification: 'fact' | 'summary' | 'inference'
    previousReviewState: 'proposed' | 'confirmed' | 'edited'
    resultingStatement: string
    resultingClassification: 'fact' | 'summary' | 'inference'
    resultingReviewState: 'confirmed' | 'edited' | 'rejected'
    reviewedAt: string
  }>
}

export type ThemeTimelineSummary = {
  id: string
  statement: string
  classification: 'summary' | 'inference'
  reviewState: 'proposed' | 'confirmed' | 'edited' | 'rejected' | 'superseded'
  supersedesSummaryId: string | null
  observationIds: string[]
  generatedAt: string
  reviewedAt: string | null
}

export type ThemeTimelineAggregate = {
  id: string
  aggregateType: 'theme_timeline_monthly'
  status: 'current' | 'superseded'
  supersedesAggregateId: string | null
  corpusFingerprint: string
  frozenSourceCount: number
  eligibleSourceCount: number
  processedSourceCount: number
  excludedSourceCount: number
  acceptedObservationCount: number
  confirmedObservationCount: number
  editedObservationCount: number
  distinctDiaryCount: number
  firstSupportedDate: string | null
  lastSupportedDate: string | null
  modelVersion: string
  promptVersion: string
  generationConfig: ThemeTimelineGenerationConfig
  staleReasons: string[]
  resultStale: boolean
  periods: Array<{
    period: string
    eligibleSourceCount: number
    processedSourceCount: number
    acceptedObservationCount: number
    confirmedObservationCount: number
    editedObservationCount: number
    distinctDiaryCount: number
    firstSupportedDate: string | null
    lastSupportedDate: string | null
  }>
  contributions: Array<{
    observationId: string
    sourceId: number
    sourceDate: string
    sourceTitle: string | null
    sourceHash: string
    statement: string
    classification: 'fact' | 'summary' | 'inference'
    reviewState: 'confirmed' | 'edited'
    evidenceCount: number
  }>
  comparisons: Array<{
    id: string
    comparisonType: 'theme_timeline_period_change'
    status: 'current' | 'superseded'
    supersedesComparisonId: string | null
    leftPeriod: string
    rightPeriod: string
    leftProcessedSourceCount: number
    rightProcessedSourceCount: number
    leftAcceptedObservationCount: number
    rightAcceptedObservationCount: number
    leftDistinctDiaryCount: number
    rightDistinctDiaryCount: number
    analysisModelVersion: string
    analysisPromptVersion: string
    analysisConfig: ThemeTimelineGenerationConfig
    staleReasons: string[]
    resultStale: boolean
    findings: Array<{
      id: string
      position: number
      findingType: 'continuity' | 'change' | 'possible_contradiction' | 'turning_point'
      statement: string
      classification: 'fact' | 'summary' | 'inference'
      reviewState: 'proposed' | 'confirmed' | 'edited' | 'rejected'
      leftObservationIds: string[]
      rightObservationIds: string[]
      reviews: Array<{
        id: number
        action: 'confirm' | 'edit' | 'reject'
        previousStatement: string
        previousClassification: 'fact' | 'summary' | 'inference'
        previousReviewState: 'proposed' | 'confirmed' | 'edited'
        resultingStatement: string
        resultingClassification: 'fact' | 'summary' | 'inference'
        resultingReviewState: 'confirmed' | 'edited' | 'rejected'
        reviewedAt: string
      }>
      reviewedAt: string | null
    }>
    createdAt: string
  }>
  createdAt: string
}

export type ThemeTimelineFailure = {
  sourceId: number
  sourceDate: string
  sourceTitle: string | null
  attempts: number
  category: 'invalid_input' | 'invalid_response' | 'legacy'
  code: string | null
  status: number | null
  diary: {
    text: string
    originalChars: number
    truncated: boolean
  } | null
  modelOutput: {
    text: string
    originalChars: number
    truncated: boolean
  } | null
}

export type ThemeTimelineRun = {
  id: string
  analysisType: 'theme_timeline'
  theme: string
  themeSpec: ThemeTimelineThemeSpec
  pipelineVersion: string
  startDate: string
  endDate: string
  status: 'pending' | 'extracting' | 'paused' | 'ready_for_summary' | 'awaiting_review' | 'completed' | 'failed'
  corpusFingerprint: string
  frozenSourceCount: number
  modelVersion: string
  promptVersion: string
  generationConfig: ThemeTimelineGenerationConfig
  versionStale: boolean
  resultStale: boolean
  coverage: {
    eligible: number
    processed: number
    failed: number
    stale: number
    excluded: number
    pending: number
    processing: number
  }
  distinctDiaryCount: number
  firstSupportedDate: string | null
  lastSupportedDate: string | null
  periodDistribution: Array<{ period: string; diaryCount: number }>
  failures: ThemeTimelineFailure[]
  observations: ThemeTimelineObservation[]
  summaries: ThemeTimelineSummary[]
  aggregates: ThemeTimelineAggregate[]
  createdAt: string
  completedAt: string | null
}

export type ThemeTimelineProcessResult = {
  outcome: 'processed' | 'failed' | 'complete'
  run: ThemeTimelineRun
}

async function knowledgeRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error ?? 'Knowledge request failed')
  }
  return response.json() as Promise<T>
}

export function fetchKnowledgeIndexStatus(): Promise<KnowledgeIndexStatus> {
  return knowledgeRequest('/api/knowledge/index', { cache: 'no-store' })
}

export function queueKnowledgeRebuild(): Promise<KnowledgeIndexStatus> {
  return knowledgeRequest('/api/knowledge/index', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'rebuild' }),
  })
}

export function retryKnowledgeIndex(): Promise<KnowledgeIndexStatus> {
  return knowledgeRequest('/api/knowledge/index', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'retry' }),
  })
}

export type KnowledgeIndexBatchResult = {
  processed: number
  failed: number
  consecutiveFailures: number
  stoppedForConsecutiveFailures: boolean
  status: KnowledgeIndexStatus
}

export function syncKnowledgeIndex(consecutiveFailures = 0): Promise<KnowledgeIndexBatchResult> {
  return knowledgeRequest('/api/knowledge/index', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'sync', batchSize: 10, consecutiveFailures }),
  })
}

export function searchKnowledge(input: {
  query: string
  startDate?: string
  endDate?: string
  diagnostics?: boolean
}): Promise<KnowledgeSearchResponse> {
  return knowledgeRequest('/api/knowledge/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function answerKnowledgeQuestion(input: {
  question: string
  startDate?: string
  endDate?: string
}): Promise<KnowledgeAnswerResponse> {
  return knowledgeRequest('/api/knowledge/answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function fetchThemeTimelineRuns(): Promise<ThemeTimelineRun[]> {
  return knowledgeRequest('/api/knowledge/understanding', { cache: 'no-store' })
}

export function fetchThemeTimelineRun(runId: string): Promise<ThemeTimelineRun> {
  return knowledgeRequest(`/api/knowledge/understanding?runId=${encodeURIComponent(runId)}`, { cache: 'no-store' })
}

export function createThemeTimeline(input: {
  theme: string
  themeSpec: ThemeTimelineThemeSpec
  startDate: string
  endDate: string
  generationConfig: ThemeTimelineGenerationConfig
}): Promise<ThemeTimelineRun> {
  return knowledgeRequest('/api/knowledge/understanding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', ...input }),
  })
}

export function processThemeTimeline(runId: string): Promise<ThemeTimelineProcessResult> {
  return knowledgeRequest('/api/knowledge/understanding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'process', runId }),
  })
}

export function retryThemeTimeline(runId: string): Promise<ThemeTimelineRun> {
  return knowledgeRequest('/api/knowledge/understanding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'retry', runId }),
  })
}

export function regenerateThemeTimelineSummary(runId: string): Promise<ThemeTimelineRun> {
  return knowledgeRequest('/api/knowledge/understanding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'regenerate-summary', runId }),
  })
}

export function regenerateThemeTimelineAggregate(runId: string): Promise<ThemeTimelineRun> {
  return knowledgeRequest('/api/knowledge/understanding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'regenerate-aggregate', runId }),
  })
}

export function generateThemeTimelineComparison(input: {
  runId: string
  aggregateId: string
  leftPeriod: string
  rightPeriod: string
}): Promise<ThemeTimelineRun> {
  return knowledgeRequest('/api/knowledge/understanding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'generate-comparison', ...input }),
  })
}

export function reviewThemeTimelineComparisonFinding(input: {
  findingId: string
  reviewAction: 'confirm' | 'edit' | 'reject'
  statement?: string
  classification?: 'fact' | 'summary' | 'inference'
}): Promise<ThemeTimelineRun> {
  return knowledgeRequest('/api/knowledge/understanding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'review-comparison', ...input }),
  })
}

export function reviewThemeTimelineSummary(input: {
  summaryId: string
  reviewAction: 'confirm' | 'edit' | 'reject' | 'supersede'
  statement?: string
}): Promise<ThemeTimelineRun> {
  return knowledgeRequest('/api/knowledge/understanding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'review', ...input }),
  })
}

export function reviewThemeTimelineObservation(input: {
  observationId: string
  reviewAction: 'confirm' | 'edit' | 'reject'
  statement?: string
  classification?: 'fact' | 'summary' | 'inference'
}): Promise<ThemeTimelineRun> {
  return knowledgeRequest('/api/knowledge/understanding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'review-observation', ...input }),
  })
}

export function openKnowledgeCitation(
  citation: Pick<KnowledgeAnswerCitation, 'sourceId'>,
  onOpenDiary: (sourceId: number) => Promise<void>,
): Promise<void> {
  return onOpenDiary(citation.sourceId)
}
