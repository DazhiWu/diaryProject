import 'server-only'

import OpenAI from 'openai'

import { getRuntimeEnvValue } from '@/lib/runtimeEnv'

export const MODELSCOPE_BASE_URL = 'https://api-inference.modelscope.cn/v1'
export const MODELSCOPE_CHAT_MODEL = 'deepseek-ai/DeepSeek-V4-Pro'
export const MODELSCOPE_TIMEOUT_MS = 30_000

export type SafeModelScopeErrorMetadata = {
  name: string
  status?: number
  code?: string
}

export function safeModelScopeErrorMetadata(error: unknown): SafeModelScopeErrorMetadata {
  if (!error || typeof error !== 'object') return { name: 'UnknownError' }
  const value = error as { name?: unknown; status?: unknown; code?: unknown; response?: { status?: unknown } }
  return {
    name: typeof value.name === 'string' ? value.name : 'Error',
    status: typeof value.status === 'number'
      ? value.status
      : typeof value.response?.status === 'number'
        ? value.response.status
        : undefined,
    code: typeof value.code === 'string' ? value.code : undefined,
  }
}

export async function createModelScopeClient(): Promise<OpenAI> {
  const apiKey = await getRuntimeEnvValue('MODELSCOPE_TOKEN_API_KEY')
  if (!apiKey) throw new Error('MODELSCOPE_TOKEN_API_KEY is not configured')

  return new OpenAI({
    baseURL: MODELSCOPE_BASE_URL,
    apiKey,
    maxRetries: 0,
  })
}
