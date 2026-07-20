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
  sourceDate: string
  sourceTitle: string | null
  content: string
  charStart: number
  charEnd: number
  similarity: number | null
  score: number
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
  return knowledgeRequest('/api/knowledge/index')
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

export function syncKnowledgeIndex(): Promise<{ processed: number; failed: number; status: KnowledgeIndexStatus }> {
  return knowledgeRequest('/api/knowledge/index', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'sync', batchSize: 10 }),
  })
}

export function searchKnowledge(input: { query: string; startDate?: string; endDate?: string; limit?: number }): Promise<{ results: KnowledgeSearchResult[] }> {
  return knowledgeRequest('/api/knowledge/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, limit: input.limit ?? 10 }),
  })
}
