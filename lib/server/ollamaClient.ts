import 'server-only'

import { getRuntimeEnvValue } from '@/lib/runtimeEnv'
import type { ThemeTimelineFailureCode } from '@/lib/server/themeTimelineFailure'
import type { ThemeTimelineGenerationConfig } from '@/lib/themeTimelineConfig'

export const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434'
export const OLLAMA_TIMEOUT_MS = 120_000

export class OllamaClientError extends Error {
  constructor(
    public readonly reason: 'timeout' | 'invalid-response' | 'unavailable',
    public readonly status?: number,
    public readonly diagnosticCode?: ThemeTimelineFailureCode,
  ) {
    super('Ollama request failed')
    this.name = 'OllamaClientError'
  }
}

async function ollamaBaseUrl(): Promise<string> {
  const configured = (await getRuntimeEnvValue('OLLAMA_BASE_URL'))?.trim() || DEFAULT_OLLAMA_BASE_URL
  let url: URL
  try {
    url = new URL(configured)
  } catch {
    throw new OllamaClientError('unavailable')
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:')
    || url.username
    || url.password
    || url.search
    || url.hash) {
    throw new OllamaClientError('unavailable')
  }
  return url.toString().replace(/\/$/u, '')
}

export async function createOllamaChatCompletion(input: {
  config: ThemeTimelineGenerationConfig
  system: string
  user: string
  maxTokens: number
  schema: Record<string, unknown>
}): Promise<string> {
  let response: Response
  try {
    response = await fetch(`${await ollamaBaseUrl()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: input.config.model,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
        stream: false,
        think: input.config.thinking,
        format: input.schema,
        keep_alive: '10m',
        options: {
          num_ctx: input.config.numCtx,
          temperature: input.config.temperature,
          top_p: input.config.topP,
          top_k: input.config.topK,
          num_predict: input.maxTokens,
        },
      }),
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
    })
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    throw new OllamaClientError(
      name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'unavailable',
    )
  }

  if (!response.ok) throw new OllamaClientError('unavailable', response.status)

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new OllamaClientError('invalid-response', response.status, 'ollama_payload_invalid')
  }
  const content = (payload as { message?: { content?: unknown } } | null)?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new OllamaClientError('invalid-response', response.status, 'empty_model_content')
  }
  return content
}
