import 'server-only'

import { embedKnowledgeTexts } from '@/lib/server/knowledgeEmbedding'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'

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
}

const MAX_RESULTS_PER_SOURCE = 2
const MAX_SEARCH_CANDIDATES = 20

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

export async function searchPrivateKnowledge(input: { query: string; limit: number; startDate?: string; endDate?: string }): Promise<KnowledgeSearchResult[]> {
  const [embedding] = await embedKnowledgeTexts([input.query], 'query')
  const candidateLimit = Math.min(MAX_SEARCH_CANDIDATES, Math.max(input.limit, input.limit * 4))
  const { data, error } = await (await getSupabaseAdmin()).rpc('search_private_knowledge', {
    p_query_embedding: embedding,
    p_query_text: input.query,
    p_match_count: candidateLimit,
    p_start_date: input.startDate ?? null,
    p_end_date: input.endDate ?? null,
  })
  if (error) throw new Error('Knowledge search failed')
  const results = (data ?? []).map((row: Record<string, unknown>) => ({
    chunkId: Number(row.chunk_id),
    sourceId: Number(row.source_id),
    chunkIndex: Number(row.chunk_index),
    chunkEndIndex: Number(row.chunk_index),
    sourceDate: String(row.source_date),
    sourceTitle: typeof row.source_title === 'string' ? row.source_title : null,
    content: String(row.content),
    charStart: Number(row.char_start),
    charEnd: Number(row.char_end),
    similarity: typeof row.similarity === 'number' ? row.similarity : null,
    score: Number(row.score),
  }))
  return mergeAndDiversifyKnowledgeResults(results, input.limit)
}
