import 'server-only'

import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'
import {
  embedKnowledgeQuery,
  QUERY_EMBEDDING_MODEL,
  rerankKnowledgeCandidates,
  RERANKER_MODEL,
  type KnowledgeCandidate,
} from '@/lib/server/workersAi'

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

const MAX_RESULTS_PER_SOURCE = 2
export const VECTOR_CANDIDATE_COUNT = 20
export const RERANK_RESULT_COUNT = 5

type RankedKnowledgeSearchResult = KnowledgeSearchResult & { rank: number }

function withoutRank(result: RankedKnowledgeSearchResult): KnowledgeSearchResult {
  return {
    chunkId: result.chunkId,
    sourceId: result.sourceId,
    chunkIndex: result.chunkIndex,
    chunkEndIndex: result.chunkEndIndex,
    sourceDate: result.sourceDate,
    sourceTitle: result.sourceTitle,
    content: result.content,
    charStart: result.charStart,
    charEnd: result.charEnd,
    similarity: result.similarity,
    score: result.score,
    vectorSimilarity: result.vectorSimilarity,
    rerankScore: result.rerankScore,
  }
}

function mergeContent(left: RankedKnowledgeSearchResult, right: RankedKnowledgeSearchResult): string {
  if (right.charStart < left.charEnd) {
    const overlap = Math.min(right.content.length, left.charEnd - right.charStart)
    return `${left.content}${right.content.slice(overlap)}`
  }
  return `${left.content}\n\n${right.content}`
}

export function mergeAndDiversifyKnowledgeResults(results: KnowledgeSearchResult[], limit: number): KnowledgeSearchResult[] {
  const ranked = results.map((result, rank) => ({ ...result, rank }))
  const bySourceAndChunk = [...ranked].sort((left, right) => left.sourceId - right.sourceId || left.chunkIndex - right.chunkIndex || left.rank - right.rank)
  const merged: RankedKnowledgeSearchResult[] = []

  for (const result of bySourceAndChunk) {
    const previous = merged.at(-1)
    if (previous && previous.sourceId === result.sourceId && result.chunkIndex <= previous.chunkEndIndex + 1) {
      const bestRanked = previous.rank <= result.rank ? previous : result
      previous.chunkId = bestRanked.chunkId
      previous.chunkIndex = Math.min(previous.chunkIndex, result.chunkIndex)
      previous.chunkEndIndex = Math.max(previous.chunkEndIndex, result.chunkEndIndex)
      previous.content = mergeContent(previous, result)
      previous.charStart = Math.min(previous.charStart, result.charStart)
      previous.charEnd = Math.max(previous.charEnd, result.charEnd)
      previous.similarity = previous.similarity === null ? result.similarity : result.similarity === null ? previous.similarity : Math.max(previous.similarity, result.similarity)
      previous.score = Math.max(previous.score, result.score)
      previous.vectorSimilarity = previous.vectorSimilarity === null
        ? result.vectorSimilarity
        : result.vectorSimilarity === null
          ? previous.vectorSimilarity
          : Math.max(previous.vectorSimilarity, result.vectorSimilarity)
      previous.rerankScore = bestRanked.rerankScore
      previous.rank = Math.min(previous.rank, result.rank)
    } else {
      merged.push({ ...result })
    }
  }

  const selected: KnowledgeSearchResult[] = []
  const sourceCounts = new Map<number, number>()
  for (const rankedResult of merged.sort((left, right) => left.rank - right.rank)) {
    const result = withoutRank(rankedResult)
    const sourceCount = sourceCounts.get(result.sourceId) ?? 0
    if (sourceCount >= MAX_RESULTS_PER_SOURCE) continue
    selected.push(result)
    sourceCounts.set(result.sourceId, sourceCount + 1)
    if (selected.length >= limit) break
  }
  return selected
}

export class KnowledgeEmbeddingUnavailableError extends Error {
  constructor() {
    super('Knowledge embedding unavailable')
    this.name = 'KnowledgeEmbeddingUnavailableError'
  }
}

type KnowledgeSearchDependencies = {
  embedQuery: typeof embedKnowledgeQuery
  searchCandidates(input: {
    candidateCount: number
    queryEmbedding: number[]
    queryText: string
    startDate?: string
    endDate?: string
  }): Promise<{ data: unknown[] | null; error: unknown }>
  rerank: typeof rerankKnowledgeCandidates
}

const DEFAULT_DEPENDENCIES: KnowledgeSearchDependencies = {
  embedQuery: embedKnowledgeQuery,
  async searchCandidates(input) {
    return (await getSupabaseAdmin()).rpc('search_private_knowledge', {
      p_query_embedding: input.queryEmbedding,
      p_query_text: input.queryText,
      p_match_count: input.candidateCount,
      p_start_date: input.startDate ?? null,
      p_end_date: input.endDate ?? null,
    })
  },
  rerank: rerankKnowledgeCandidates,
}

function vectorFallback(candidates: KnowledgeCandidate[]): KnowledgeSearchResult[] {
  return candidates
    .map((candidate, rank) => ({ candidate, rank }))
    .sort((left, right) => {
      const leftSimilarity = left.candidate.similarity ?? Number.NEGATIVE_INFINITY
      const rightSimilarity = right.candidate.similarity ?? Number.NEGATIVE_INFINITY
      return rightSimilarity - leftSimilarity || left.rank - right.rank
    })
    .slice(0, RERANK_RESULT_COUNT)
    .map(({ candidate }) => ({
      ...candidate,
      vectorSimilarity: candidate.similarity,
      rerankScore: null,
    }))
}

export async function searchPrivateKnowledge(
  input: { query: string; startDate?: string; endDate?: string; diagnostics?: boolean },
  dependencies: KnowledgeSearchDependencies = DEFAULT_DEPENDENCIES,
): Promise<KnowledgeSearchResponse> {
  let embedding: number[]
  try {
    embedding = await dependencies.embedQuery(input.query)
  } catch (error) {
    console.error('[knowledge-search]', {
      operation: 'embedding',
      outcome: 'failed',
      model: QUERY_EMBEDDING_MODEL,
      name: error instanceof Error ? error.name : 'UnknownError',
    })
    throw new KnowledgeEmbeddingUnavailableError()
  }

  const { data, error } = await dependencies.searchCandidates({
    candidateCount: VECTOR_CANDIDATE_COUNT,
    queryEmbedding: embedding,
    queryText: input.query,
    startDate: input.startDate,
    endDate: input.endDate,
  })
  if (error) throw new Error('Knowledge search failed')
  const candidates: KnowledgeCandidate[] = (data ?? []).map((row) => {
    const candidate = typeof row === 'object' && row !== null ? Object.fromEntries(Object.entries(row)) : {}
    return {
      chunkId: Number(candidate.chunk_id),
      sourceId: Number(candidate.source_id),
      chunkIndex: Number(candidate.chunk_index),
      chunkEndIndex: Number(candidate.chunk_index),
      sourceDate: String(candidate.source_date),
      sourceTitle: typeof candidate.source_title === 'string' ? candidate.source_title : null,
      content: String(candidate.content),
      charStart: Number(candidate.char_start),
      charEnd: Number(candidate.char_end),
      similarity: typeof candidate.similarity === 'number' ? candidate.similarity : null,
      score: Number(candidate.score),
    }
  })
  const candidateDiagnostics = input.diagnostics
    ? candidates.map((candidate, index) => ({
        fusionRank: index + 1,
        sourceId: candidate.sourceId,
        sourceDate: candidate.sourceDate,
        sourceTitle: candidate.sourceTitle,
        chunkIndex: candidate.chunkIndex,
        content: candidate.content,
        vectorSimilarity: candidate.similarity,
        rpcScore: candidate.score,
      }))
    : undefined
  if (candidates.length === 0) {
    return {
      results: [],
      rerankApplied: false,
      ...(candidateDiagnostics ? { diagnostics: { candidates: candidateDiagnostics, reranked: [] } } : {}),
    }
  }

  try {
    const reranked = await dependencies.rerank(input.query, candidates, RERANK_RESULT_COUNT)
    return {
      results: mergeAndDiversifyKnowledgeResults(reranked, RERANK_RESULT_COUNT),
      rerankApplied: true,
      ...(candidateDiagnostics
        ? {
            diagnostics: {
              candidates: candidateDiagnostics,
              reranked: reranked.map((candidate, index) => ({
                rerankRank: index + 1,
                candidateRank: candidate.candidateIndex + 1,
                sourceId: candidate.sourceId,
                sourceDate: candidate.sourceDate,
                sourceTitle: candidate.sourceTitle,
                chunkIndex: candidate.chunkIndex,
                content: candidate.content,
                rerankScore: candidate.rerankScore,
              })),
            },
          }
        : {}),
    }
  } catch (error) {
    console.error('[knowledge-search]', {
      operation: 'reranker',
      outcome: 'fallback',
      model: RERANKER_MODEL,
      name: error instanceof Error ? error.name : 'UnknownError',
    })
    return {
      results: mergeAndDiversifyKnowledgeResults(vectorFallback(candidates), RERANK_RESULT_COUNT),
      rerankApplied: false,
      ...(candidateDiagnostics ? { diagnostics: { candidates: candidateDiagnostics, reranked: [] } } : {}),
    }
  }
}
