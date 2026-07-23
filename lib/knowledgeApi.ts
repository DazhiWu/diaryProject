export type KnowledgeIndexStatus = {
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
