import 'server-only'

import OpenAI from 'openai'

import { requireServerEnv } from '@/lib/server/env'
import { reserveModelScopeApiCall } from '@/lib/server/modelScopeQuota'

export const KNOWLEDGE_EMBEDDING_MODEL = 'Qwen/Qwen3-Embedding-0.6B'
export const KNOWLEDGE_EMBEDDING_DIMENSIONS = 1_024

const MODELSCOPE_BASE_URL = 'https://api-inference.modelscope.cn/v1'
const EMBEDDING_BATCH_SIZE = 16
const EMBEDDING_TIMEOUT_MS = 30_000

function validateEmbedding(value: unknown): number[] {
  if (!Array.isArray(value) || value.length !== KNOWLEDGE_EMBEDDING_DIMENSIONS || value.some((item) => typeof item !== 'number' || !Number.isFinite(item))) {
    throw new Error('Embedding response has an unexpected shape')
  }
  return value as number[]
}

export async function embedKnowledgeTexts(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return []

  const client = new OpenAI({
    baseURL: MODELSCOPE_BASE_URL,
    apiKey: await requireServerEnv('MODELSCOPE_TOKEN_API_KEY'),
    maxRetries: 0,
  })
  const embeddings: number[][] = []

  for (let start = 0; start < inputs.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = inputs.slice(start, start + EMBEDDING_BATCH_SIZE)
    await reserveModelScopeApiCall()
    const response = await client.embeddings.create({
      model: KNOWLEDGE_EMBEDDING_MODEL,
      input: batch,
      encoding_format: 'float',
    }, { signal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS) })
    const ordered = [...response.data].sort((left, right) => left.index - right.index)
    if (ordered.length !== batch.length) throw new Error('Embedding response count does not match the request')
    embeddings.push(...ordered.map((item) => validateEmbedding(item.embedding)))
  }

  return embeddings
}
