import type { RecallTrace } from '@/lib/knowledgeRecall'

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
  retrieval?: RecallTrace
  clarification?: string
  answer: string
  evidenceStatus: 'supported' | 'insufficient'
  citations: KnowledgeAnswerCitation[]
  rerankApplied: boolean
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
  context?: string
  question: string
  startDate?: string
  endDate?: string
}): Promise<KnowledgeAnswerResponse> {
  return fetch('/api/knowledge/answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }).then(async (response) => {
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null
      throw new Error(body?.error ?? 'Knowledge request failed')
    }

    if (!response.headers.get('Content-Type')?.includes('application/x-ndjson')) {
      return response.json() as Promise<KnowledgeAnswerResponse>
    }
    if (!response.body) throw new Error('Knowledge answer stream was unavailable')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let result: KnowledgeAnswerResponse | undefined

    function processLine(line: string) {
      if (!line.trim()) return
      const event = JSON.parse(line) as {
        type?: unknown
        data?: KnowledgeAnswerResponse
        error?: unknown
      }
      if (event.type === 'result' && event.data) result = event.data
      if (event.type === 'error') {
        throw new Error(typeof event.error === 'string' ? event.error : 'Knowledge answer failed')
      }
    }

    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) processLine(line)
      if (done) break
    }
    processLine(buffer)
    if (!result) throw new Error('Knowledge answer stream ended without a result')
    return result
  })
}

export function openKnowledgeCitation(
  citation: Pick<KnowledgeAnswerCitation, 'sourceId'>,
  onOpenDiary: (sourceId: number) => Promise<void>,
): Promise<void> {
  return onOpenDiary(citation.sourceId)
}
