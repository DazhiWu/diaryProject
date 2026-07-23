import 'server-only'

import { chunkDiaryContent, knowledgeSourceText, sha256Hex } from '@/lib/server/knowledgeChunks'
import { embedKnowledgeTexts, KNOWLEDGE_EMBEDDING_MODEL } from '@/lib/server/knowledgeEmbedding'
import { KnowledgeIndexStepError, sanitizeKnowledgeIndexFailure } from '@/lib/server/knowledgeIndexFailure'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'

export const KNOWLEDGE_INDEX_TASK_INTERVAL_MS = 2_000
export const KNOWLEDGE_INDEX_CONSECUTIVE_FAILURE_LIMIT = 3
const KNOWLEDGE_INDEX_LAST_ERROR_MAX_CHARS = 8_000

type DiarySource = {
  id: number
  date: string
  subtitle: string | null
  content: string | null
}

type SourceSetting = {
  source_id: number
  usage_scope: 'private' | 'excluded'
  indexed_content_hash: string | null
  indexed_model: string | null
}

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

export type KnowledgeIndexBatchResult = {
  processed: number
  failed: number
  consecutiveFailures: number
  stoppedForConsecutiveFailures: boolean
  status: KnowledgeIndexStatus
}

async function exactCount(table: string, configure?: (query: any) => any): Promise<number> {
  let query = (await getSupabaseAdmin()).from(table).select('*', { count: 'exact', head: true })
  if (configure) query = configure(query)
  const { count, error } = await query
  if (error) throw new Error('Knowledge index status query failed')
  return count ?? 0
}

export async function getKnowledgeIndexStatus(): Promise<KnowledgeIndexStatus> {
  const supabase = await getSupabaseAdmin()
  const [totalSources, totalChunks, pending, processing, failed, completed, excluded, latest] = await Promise.all([
    exactCount('knowledge_source_settings'),
    exactCount('knowledge_chunks'),
    exactCount('knowledge_index_jobs', (query) => query.eq('status', 'pending')),
    exactCount('knowledge_index_jobs', (query) => query.eq('status', 'processing')),
    exactCount('knowledge_index_jobs', (query) => query.eq('status', 'failed')),
    exactCount('knowledge_index_jobs', (query) => query.eq('status', 'completed')),
    exactCount('knowledge_source_settings', (query) => query.eq('usage_scope', 'excluded')),
    supabase.from('knowledge_source_settings').select('last_indexed_at').not('last_indexed_at', 'is', null).order('last_indexed_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (latest.error) throw new Error('Knowledge index status query failed')
  return { totalSources, indexedSources: completed, totalChunks, pending, processing, failed, completed, excluded, lastIndexedAt: latest.data?.last_indexed_at ?? null }
}

export async function queueKnowledgeRebuild(): Promise<KnowledgeIndexStatus> {
  const supabase = await getSupabaseAdmin()
  const { data: sources, error: sourceError } = await supabase.from('knowledge_source_settings').select('source_id')
  if (sourceError) throw new Error('Knowledge rebuild query failed')
  const ids = (sources ?? []).map((row) => Number(row.source_id))
  if (ids.length > 0) {
    const { error: resetError } = await supabase.from('knowledge_source_settings').update({ indexed_content_hash: null, indexed_model: null, updated_at: new Date().toISOString() }).in('source_id', ids)
    if (resetError) throw new Error('Knowledge rebuild reset failed')
    for (let start = 0; start < ids.length; start += 500) {
      const now = new Date().toISOString()
      const jobs = ids.slice(start, start + 500).map((sourceId) => ({ source_id: sourceId, status: 'pending', queued_at: now, started_at: null, completed_at: null, last_error: null, updated_at: now }))
      const { error } = await supabase.from('knowledge_index_jobs').upsert(jobs, { onConflict: 'source_id' })
      if (error) throw new Error('Knowledge rebuild queue failed')
    }
  }
  return getKnowledgeIndexStatus()
}

export async function retryFailedKnowledgeJobs(): Promise<KnowledgeIndexStatus> {
  const now = new Date().toISOString()
  const { error } = await (await getSupabaseAdmin()).from('knowledge_index_jobs').update({ status: 'pending', queued_at: now, started_at: null, completed_at: null, last_error: null, updated_at: now }).eq('status', 'failed')
  if (error) throw new Error('Knowledge retry failed')
  return getKnowledgeIndexStatus()
}

async function failJobs(sourceIds: number[], message: string): Promise<void> {
  if (sourceIds.length === 0) return
  const { error } = await (await getSupabaseAdmin()).from('knowledge_index_jobs').update({ status: 'failed', last_error: message.slice(0, KNOWLEDGE_INDEX_LAST_ERROR_MAX_CHARS), updated_at: new Date().toISOString() }).in('source_id', sourceIds)
  if (error) console.error('[knowledge-index]', { operation: 'mark-failed', outcome: 'failed' })
}

async function requeueJobs(sourceIds: number[], message: string): Promise<void> {
  if (sourceIds.length === 0) return
  const now = new Date().toISOString()
  const { error } = await (await getSupabaseAdmin()).from('knowledge_index_jobs').update({
    status: 'pending',
    queued_at: now,
    started_at: null,
    completed_at: null,
    last_error: message.slice(0, KNOWLEDGE_INDEX_LAST_ERROR_MAX_CHARS),
    updated_at: now,
  }).in('source_id', sourceIds)
  if (error) console.error('[knowledge-index]', { operation: 'requeue-quota-stopped', outcome: 'failed' })
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export async function processKnowledgeIndexBatch(batchSize = 10, initialConsecutiveFailures = 0): Promise<KnowledgeIndexBatchResult> {
  const supabase = await getSupabaseAdmin()
  const safeBatchSize = Math.min(10, Math.max(1, batchSize))
  let consecutiveFailures = Math.min(KNOWLEDGE_INDEX_CONSECUTIVE_FAILURE_LIMIT - 1, Math.max(0, initialConsecutiveFailures))
  const { data: claimed, error: claimError } = await supabase.rpc('claim_knowledge_index_jobs', { p_limit: safeBatchSize })
  if (claimError) throw new Error('Knowledge index claim failed')
  const claimedIds = (claimed ?? []).map((row: { source_id: number | string }) => Number(row.source_id))
  if (claimedIds.length === 0) return { processed: 0, failed: 0, consecutiveFailures, stoppedForConsecutiveFailures: false, status: await getKnowledgeIndexStatus() }

  const [{ data: diaries, error: diaryError }, { data: settings, error: settingError }, { data: existingChunks, error: chunkError }] = await Promise.all([
    supabase.from('diaryContent').select('id, date, subtitle, content').in('id', claimedIds),
    supabase.from('knowledge_source_settings').select('source_id, usage_scope, indexed_content_hash, indexed_model').in('source_id', claimedIds),
    supabase.from('knowledge_chunks').select('source_id').in('source_id', claimedIds),
  ])
  if (diaryError || settingError || chunkError) {
    const failure = sanitizeKnowledgeIndexFailure(new KnowledgeIndexStepError({
      category: 'source_query_failed',
      code: diaryError?.code ?? settingError?.code ?? chunkError?.code,
    }))
    await failJobs(claimedIds, failure.storedMessage)
    throw new Error('Knowledge source query failed')
  }

  const diaryById = new Map((diaries as DiarySource[] ?? []).map((diary) => [Number(diary.id), diary]))
  const settingById = new Map((settings as SourceSetting[] ?? []).map((setting) => [Number(setting.source_id), setting]))
  const sourcesWithChunks = new Set((existingChunks ?? []).map((row) => Number(row.source_id)))
  let processed = 0
  let failed = 0
  let stoppedForConsecutiveFailures = false

  for (const [sourceIndex, sourceId] of claimedIds.entries()) {
    if (sourceIndex > 0) await wait(KNOWLEDGE_INDEX_TASK_INTERVAL_MS)
    const diary = diaryById.get(sourceId)
    const setting = settingById.get(sourceId)
    if (!diary || !setting) {
      const failure = sanitizeKnowledgeIndexFailure(new KnowledgeIndexStepError({ category: 'source_not_found' }))
      await failJobs([sourceId], failure.storedMessage)
      failed += 1
      consecutiveFailures += 1
      if (consecutiveFailures >= KNOWLEDGE_INDEX_CONSECUTIVE_FAILURE_LIMIT) {
        const stop = sanitizeKnowledgeIndexFailure(new KnowledgeIndexStepError({ category: 'consecutive_failure_stop' }))
        await requeueJobs(claimedIds.slice(sourceIndex + 1), stop.storedMessage)
        stoppedForConsecutiveFailures = true
        break
      }
      continue
    }

    const content = diary.content ?? ''
    try {
      const sourceHash = await sha256Hex(knowledgeSourceText(diary.date, diary.subtitle, content))
      const chunks = setting.usage_scope === 'excluded' ? [] : chunkDiaryContent(content)
      if (setting.indexed_content_hash === sourceHash && setting.indexed_model === KNOWLEDGE_EMBEDDING_MODEL && (chunks.length === 0 || sourcesWithChunks.has(sourceId))) {
        const { error } = await supabase.from('knowledge_index_jobs').update({ status: 'completed', completed_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq('source_id', sourceId)
        if (error) throw new KnowledgeIndexStepError({ category: 'job_completion_failed', code: error.code })
        processed += 1
        consecutiveFailures = 0
        continue
      }

      const embeddings = await embedKnowledgeTexts(chunks.map((chunk) => diary.subtitle ? `${diary.subtitle}\n${chunk.content}` : chunk.content), 'document')
      const payload = await Promise.all(chunks.map(async (chunk, index) => ({
        chunk_index: chunk.chunkIndex,
        content: chunk.content,
        char_start: chunk.charStart,
        char_end: chunk.charEnd,
        content_hash: await sha256Hex(chunk.content),
        embedding: embeddings[index],
      })))
      const { error } = await supabase.rpc('replace_diary_knowledge_chunks', {
        p_source_id: sourceId,
        p_source_date: diary.date,
        p_source_title: diary.subtitle,
        p_source_hash: sourceHash,
        p_embedding_model: KNOWLEDGE_EMBEDDING_MODEL,
        p_chunks: payload,
      })
      if (error) throw new KnowledgeIndexStepError({ category: 'chunk_replace_failed', code: error.code })
      processed += 1
      consecutiveFailures = 0
    } catch (error) {
      const failure = sanitizeKnowledgeIndexFailure(error, content)
      console.error('[knowledge-index]', { operation: 'index-source', sourceId, outcome: 'failed', category: failure.category, status: failure.status, code: failure.code })
      await failJobs([sourceId], failure.storedMessage)
      failed += 1
      consecutiveFailures += 1
      if (consecutiveFailures >= KNOWLEDGE_INDEX_CONSECUTIVE_FAILURE_LIMIT) {
        const stop = sanitizeKnowledgeIndexFailure(new KnowledgeIndexStepError({ category: 'consecutive_failure_stop' }))
        await requeueJobs(claimedIds.slice(sourceIndex + 1), stop.storedMessage)
        stoppedForConsecutiveFailures = true
        break
      }
    }
  }

  return { processed, failed, consecutiveFailures, stoppedForConsecutiveFailures, status: await getKnowledgeIndexStatus() }
}
