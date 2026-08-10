import 'server-only'

import OpenAI from 'openai'

import { getRuntimeEnvValue } from '@/lib/runtimeEnv'
import { reserveModelScopeApiCall } from '@/lib/server/modelScopeQuota'
import { HttpError } from '@/lib/server/session'

export const MODELSCOPE_BASE_URL = 'https://api-inference.modelscope.cn/v1'
export const MODELSCOPE_TIMEOUT_MS = 30_000
export const MODELSCOPE_ALL_MODELS_FAILED_MESSAGE = '所有模型 API 调用失败'

export class ModelScopeConfigurationError extends Error {
  constructor() {
    super('MODELSCOPE_CHAT_MODEL 未配置或没有有效模型')
    this.name = 'ModelScopeConfigurationError'
  }
}

export class ModelScopeModelsExhaustedError extends Error {
  constructor() {
    super(MODELSCOPE_ALL_MODELS_FAILED_MESSAGE)
    this.name = 'ModelScopeModelsExhaustedError'
  }
}

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

const RETRYABLE_ERROR_NAMES = new Set([
  'TimeoutError',
  'AbortError',
  'APIConnectionTimeoutError',
  'APIConnectionError',
])

const RETRYABLE_ERROR_CODES = new Set([
  'ENOTFOUND',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
])

export function parseModelScopeChatModels(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean)
}

export async function getModelScopeChatModels(): Promise<string[]> {
  const models = parseModelScopeChatModels(await getRuntimeEnvValue('MODELSCOPE_CHAT_MODEL'))
  if (models.length === 0) throw new ModelScopeConfigurationError()
  return models
}

export function isRetryableModelScopeRequestError(error: unknown): boolean {
  if (error instanceof HttpError) return false
  const metadata = safeModelScopeErrorMetadata(error)
  return metadata.status !== undefined
    || RETRYABLE_ERROR_NAMES.has(metadata.name)
    || (metadata.code !== undefined && RETRYABLE_ERROR_CODES.has(metadata.code))
}

export type ModelScopeFallbackOptions<T> = {
  operation: 'analyze' | 'translate' | 'knowledge-answer' | 'test'
  attempt(model: string): Promise<T>
}

export type ModelScopeFallbackDependencies = {
  loadModels(): Promise<string[]>
  reserveQuota(): Promise<unknown>
}

const DEFAULT_FALLBACK_DEPENDENCIES: ModelScopeFallbackDependencies = {
  loadModels: getModelScopeChatModels,
  reserveQuota: reserveModelScopeApiCall,
}

export async function runModelScopeChatFallback<T>(
  options: ModelScopeFallbackOptions<T>,
  dependencies: ModelScopeFallbackDependencies = DEFAULT_FALLBACK_DEPENDENCIES,
): Promise<T> {
  const models = await dependencies.loadModels()
  if (models.length === 0) throw new ModelScopeConfigurationError()

  for (const model of models) {
    await dependencies.reserveQuota()

    try {
      return await options.attempt(model)
    } catch (error) {
      if (!isRetryableModelScopeRequestError(error)) throw error
      console.error('[modelscope]', {
        operation: options.operation,
        outcome: 'failed',
        model,
        ...safeModelScopeErrorMetadata(error),
      })
    }
  }

  throw new ModelScopeModelsExhaustedError()
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
