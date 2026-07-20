import 'server-only'

import { embedKnowledgeTexts } from '@/lib/server/knowledgeEmbedding'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'

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

export async function searchPrivateKnowledge(input: { query: string; limit: number; startDate?: string; endDate?: string }): Promise<KnowledgeSearchResult[]> {
  const [embedding] = await embedKnowledgeTexts([input.query])
  const { data, error } = await (await getSupabaseAdmin()).rpc('search_private_knowledge', {
    p_query_embedding: embedding,
    p_query_text: input.query,
    p_match_count: input.limit,
    p_start_date: input.startDate ?? null,
    p_end_date: input.endDate ?? null,
  })
  if (error) throw new Error('Knowledge search failed')
  return (data ?? []).map((row: Record<string, unknown>) => ({
    chunkId: Number(row.chunk_id),
    sourceId: Number(row.source_id),
    chunkIndex: Number(row.chunk_index),
    sourceDate: String(row.source_date),
    sourceTitle: typeof row.source_title === 'string' ? row.source_title : null,
    content: String(row.content),
    charStart: Number(row.char_start),
    charEnd: Number(row.char_end),
    similarity: typeof row.similarity === 'number' ? row.similarity : null,
    score: Number(row.score),
  }))
}
