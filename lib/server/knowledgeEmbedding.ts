import 'server-only'

export const KNOWLEDGE_EMBEDDING_MODEL = 'Qwen/Qwen3-Embedding-0.6B'
export const KNOWLEDGE_EMBEDDING_DIMENSIONS = 1_024

const LOCAL_EMBEDDING_ENDPOINT = 'http://127.0.0.1:8000/embeddings'
const EMBEDDING_BATCH_SIZE = 16
const EMBEDDING_TIMEOUT_MS = 30_000

type EmbeddingInputType = 'query' | 'document'

type LocalEmbeddingResponse = {
  model?: unknown
  dimensions?: unknown
  count?: unknown
  embeddings?: unknown
}

class LocalEmbeddingRequestError extends Error {
  readonly status: number
  readonly body: string

  constructor(status: number, body: string) {
    super(`Local embedding request failed with status ${status}`)
    this.name = 'LocalEmbeddingRequestError'
    this.status = status
    this.body = body
  }
}

function validateEmbedding(value: unknown): number[] {
  if (!Array.isArray(value) || value.length !== KNOWLEDGE_EMBEDDING_DIMENSIONS || value.some((item) => typeof item !== 'number' || !Number.isFinite(item))) {
    throw new Error('Embedding response has an unexpected shape')
  }
  return value as number[]
}

export async function embedKnowledgeTexts(inputs: string[], inputType: EmbeddingInputType): Promise<number[][]> {
  if (inputs.length === 0) return []

  const embeddings: number[][] = []

  for (let start = 0; start < inputs.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = inputs.slice(start, start + EMBEDDING_BATCH_SIZE)
    const response = await fetch(LOCAL_EMBEDDING_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: batch, input_type: inputType, batch_size: EMBEDDING_BATCH_SIZE }),
      signal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
    })
    if (!response.ok) throw new LocalEmbeddingRequestError(response.status, await response.text())

    const payload = await response.json() as LocalEmbeddingResponse
    if (payload.model !== KNOWLEDGE_EMBEDDING_MODEL || payload.dimensions !== KNOWLEDGE_EMBEDDING_DIMENSIONS || !Array.isArray(payload.embeddings)) {
      throw new Error('Embedding response has an unexpected shape')
    }
    if (payload.count !== batch.length || payload.embeddings.length !== batch.length) {
      throw new Error('Embedding response count does not match the request')
    }
    embeddings.push(...payload.embeddings.map(validateEmbedding))
  }

  return embeddings
}
