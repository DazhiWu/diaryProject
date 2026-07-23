import 'server-only'

import { getCloudflareContext } from '@opennextjs/cloudflare'

export const QUERY_EMBEDDING_MODEL = '@cf/qwen/qwen3-embedding-0.6b'
export const RERANKER_MODEL = '@cf/baai/bge-reranker-base'
export const KNOWLEDGE_QUERY_INSTRUCTION =
  'Given a personal diary search query, retrieve diary passages that are relevant to the query.'
export const KNOWLEDGE_EMBEDDING_DIMENSIONS = 1_024

export type KnowledgeCandidate = {
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
}

export type RerankedKnowledgeCandidate = KnowledgeCandidate & {
  candidateIndex: number
  vectorSimilarity: number | null
  rerankScore: number
}

type WorkersAiRunner = {
  runEmbedding(query: string): Promise<unknown>
  runReranker(query: string, contexts: { text: string }[], topK: number): Promise<unknown>
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? Object.fromEntries(Object.entries(value)) : null
}

export function normalizeVector(value: unknown): number[] {
  if (!Array.isArray(value) || value.length !== KNOWLEDGE_EMBEDDING_DIMENSIONS) {
    throw new Error('Workers AI embedding has an unexpected shape')
  }

  const vector: number[] = []
  let magnitudeSquared = 0
  for (const item of value) {
    if (typeof item !== 'number' || !Number.isFinite(item)) {
      throw new Error('Workers AI embedding has an unexpected shape')
    }
    vector.push(item)
    magnitudeSquared += item * item
  }

  const magnitude = Math.sqrt(magnitudeSquared)
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    throw new Error('Workers AI embedding has zero magnitude')
  }
  return vector.map((item) => item / magnitude)
}

function embeddingFromResponse(payload: unknown): number[] {
  const data = record(payload)?.data
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error('Workers AI embedding has an unexpected shape')
  }
  return normalizeVector(data[0])
}

function candidateContext(candidate: KnowledgeCandidate): string {
  return [
    `日期：${candidate.sourceDate}`,
    ...(candidate.sourceTitle ? [`标题：${candidate.sourceTitle}`] : []),
    `正文：${candidate.content}`,
  ].join('\n')
}

function rerankedFromResponse(
  payload: unknown,
  candidates: KnowledgeCandidate[],
  topK: number,
): RerankedKnowledgeCandidate[] {
  const response = record(payload)?.response
  if (!Array.isArray(response)) throw new Error('Workers AI reranker has an unexpected shape')

  const seen = new Set<number>()
  const reranked: RerankedKnowledgeCandidate[] = []
  for (const item of response) {
    const result = record(item)
    const id = result?.id
    const rerankScore = result?.score
    if (
      typeof id !== 'number'
      || !Number.isInteger(id)
      || id < 0
      || id >= candidates.length
      || typeof rerankScore !== 'number'
      || !Number.isFinite(rerankScore)
      || seen.has(id)
    ) {
      continue
    }

    const candidate = candidates[id]
    if (!candidate) continue
    seen.add(id)
    reranked.push({
      ...candidate,
      candidateIndex: id,
      vectorSimilarity: candidate.similarity,
      rerankScore,
    })
    if (reranked.length >= topK) break
  }

  if (reranked.length === 0 && candidates.length > 0) {
    throw new Error('Workers AI reranker returned no valid results')
  }
  return reranked
}

export function createWorkersAiClient(runner: WorkersAiRunner) {
  return {
    async embedKnowledgeQuery(query: string): Promise<number[]> {
      return embeddingFromResponse(await runner.runEmbedding(query))
    },
    async rerankKnowledgeCandidates(
      query: string,
      candidates: KnowledgeCandidate[],
      topK: number,
    ): Promise<RerankedKnowledgeCandidate[]> {
      if (candidates.length === 0 || topK < 1) return []
      return rerankedFromResponse(
        await runner.runReranker(query, candidates.map((candidate) => ({ text: candidateContext(candidate) })), topK),
        candidates,
        topK,
      )
    },
  }
}

async function workersAi(): Promise<CloudflareEnv['AI']> {
  const { env } = await getCloudflareContext({ async: true })
  return env.AI
}

const productionClient = createWorkersAiClient({
  async runEmbedding(query) {
    return (await workersAi()).run(QUERY_EMBEDDING_MODEL, {
      queries: [query],
      instruction: KNOWLEDGE_QUERY_INSTRUCTION,
    })
  },
  async runReranker(query, contexts, topK) {
    const input = { query, contexts, top_k: topK }
    return (await workersAi()).run(RERANKER_MODEL, input)
  },
})

export function embedKnowledgeQuery(query: string): Promise<number[]> {
  return productionClient.embedKnowledgeQuery(query)
}

export function rerankKnowledgeCandidates(
  query: string,
  candidates: KnowledgeCandidate[],
  topK: number,
): Promise<RerankedKnowledgeCandidate[]> {
  return productionClient.rerankKnowledgeCandidates(query, candidates, topK)
}
