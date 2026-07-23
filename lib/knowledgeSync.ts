import {
  fetchKnowledgeIndexStatus,
  syncKnowledgeIndex,
  type KnowledgeIndexBatchResult,
  type KnowledgeIndexStatus,
} from '@/lib/knowledgeApi'

export const SYNC_BATCH_INTERVAL_MS = 2_000

export type KnowledgeSyncSummary = {
  processed: number
  failed: number
  stoppedForConsecutiveFailures: boolean
  status: KnowledgeIndexStatus
}

type RunKnowledgeSyncOptions = {
  onStatus: (status: KnowledgeIndexStatus) => void
  syncBatch?: (consecutiveFailures: number) => Promise<KnowledgeIndexBatchResult>
  refreshStatus?: () => Promise<KnowledgeIndexStatus>
  waitForNextBatch?: () => Promise<void>
}

function waitForNextBatch(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, SYNC_BATCH_INTERVAL_MS))
}

export async function runKnowledgeSync({
  onStatus,
  syncBatch = syncKnowledgeIndex,
  refreshStatus = fetchKnowledgeIndexStatus,
  waitForNextBatch: waitBetweenBatches = waitForNextBatch,
}: RunKnowledgeSyncOptions): Promise<KnowledgeSyncSummary> {
  let processed = 0
  let failed = 0
  let consecutiveFailures = 0
  let stoppedForConsecutiveFailures = false
  let latestStatus: KnowledgeIndexStatus | undefined
  let syncError: unknown
  let hasSyncError = false

  try {
    for (let batch = 0; ; batch += 1) {
      if (batch > 0) await waitBetweenBatches()
      const result = await syncBatch(consecutiveFailures)
      processed += result.processed
      failed += result.failed
      consecutiveFailures = result.consecutiveFailures
      stoppedForConsecutiveFailures = result.stoppedForConsecutiveFailures
      latestStatus = result.status
      onStatus(result.status)

      if (stoppedForConsecutiveFailures) break
      if ((result.processed === 0 && result.failed === 0) || result.status.pending + result.status.processing === 0) break
    }
  } catch (error) {
    syncError = error
    hasSyncError = true
  }

  try {
    latestStatus = await refreshStatus()
    onStatus(latestStatus)
  } catch (refreshError) {
    if (!hasSyncError) {
      syncError = refreshError
      hasSyncError = true
    }
  }

  if (hasSyncError) throw syncError
  if (!latestStatus) throw new Error('Knowledge index status refresh failed')

  return { processed, failed, stoppedForConsecutiveFailures, status: latestStatus }
}
