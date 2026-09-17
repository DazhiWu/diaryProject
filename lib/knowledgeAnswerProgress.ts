export const KNOWLEDGE_ANSWER_MAX_SEARCHES = 5

export type KnowledgeAnswerProgress =
  | {
      phase: 'retrieving'
      searchCount: number
      maxSearchCount: number
      kind: 'primary' | 'direction' | 'followup'
    }
  | {
      phase: 'evidence-ready'
      searchCount: number
      diaryCount: number
      excerptCount: number
      partial: boolean
    }
  | {
      phase: 'generating' | 'finalizing'
      model: string
      attempt: number
      totalAttempts: number
    }
  | {
      phase: 'retrying'
      completedAttempt: number
      totalAttempts: number
    }

export type KnowledgeAnswerProgressHandler = (progress: KnowledgeAnswerProgress) => void

function isSafeCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function isKnowledgeAnswerProgress(value: unknown): value is KnowledgeAnswerProgress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const progress = value as Record<string, unknown>
  if (progress.phase === 'retrieving') {
    return isSafeCount(progress.searchCount)
      && isSafeCount(progress.maxSearchCount)
      && ['primary', 'direction', 'followup'].includes(String(progress.kind))
  }
  if (progress.phase === 'evidence-ready') {
    return isSafeCount(progress.searchCount)
      && isSafeCount(progress.diaryCount)
      && isSafeCount(progress.excerptCount)
      && typeof progress.partial === 'boolean'
  }
  if (progress.phase === 'generating' || progress.phase === 'finalizing') {
    return typeof progress.model === 'string'
      && progress.model.length > 0
      && progress.model.length <= 200
      && isSafeCount(progress.attempt)
      && isSafeCount(progress.totalAttempts)
  }
  if (progress.phase === 'retrying') {
    return isSafeCount(progress.completedAttempt) && isSafeCount(progress.totalAttempts)
  }
  return false
}
