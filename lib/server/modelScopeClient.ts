import 'server-only'

import OpenAI from 'openai'

import { getRuntimeEnvValue } from '@/lib/runtimeEnv'
import { reserveModelScopeApiCall } from '@/lib/server/modelScopeQuota'
import { HttpError } from '@/lib/server/session'

export const MODELSCOPE_BASE_URL = 'https://api-inference.modelscope.cn/v1'
export const MODELSCOPE_TIMEOUT_MS = 30_000
export const MODELSCOPE_ALL_MODELS_FAILED_MESSAGE = '所有模型 API 调用失败'

export class ModelScopeConfigurationError extends Error {
  constructor(message = 'MODELSCOPE_CHAT_MODEL 未配置或没有有效模型') {
    super(message)
    this.name = 'ModelScopeConfigurationError'
  }
}

export class ModelScopeModelsExhaustedError extends Error {
  constructor() {
    super(MODELSCOPE_ALL_MODELS_FAILED_MESSAGE)
    this.name = 'ModelScopeModelsExhaustedError'
  }
}

export class ModelScopeRetryableResponseError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message)
    this.name = 'ModelScopeRetryableResponseError'
  }
}

export class ModelScopeMissingChoicesError extends ModelScopeRetryableResponseError {
  constructor() {
    super('ModelScope successful response did not include choices', 'MISSING_CHOICES')
    this.name = 'ModelScopeMissingChoicesError'
  }
}

export class ModelScopeEmptyContentError extends ModelScopeRetryableResponseError {
  constructor() {
    super('ModelScope successful response did not include usable content', 'EMPTY_CONTENT')
    this.name = 'ModelScopeEmptyContentError'
  }
}

export class ModelScopeInvalidAnalysisError extends ModelScopeRetryableResponseError {
  constructor() {
    super('ModelScope analysis response did not match the required contract', 'INVALID_ANALYSIS')
    this.name = 'ModelScopeInvalidAnalysisError'
  }
}

export class ModelScopeInvalidKnowledgeAnswerError extends ModelScopeRetryableResponseError {
  constructor() {
    super('ModelScope knowledge answer did not match the required contract', 'INVALID_KNOWLEDGE_ANSWER')
    this.name = 'ModelScopeInvalidKnowledgeAnswerError'
  }
}

export type SafeModelScopeErrorMetadata = {
  name: string
  status?: number
  code?: string
}

export function safeModelScopeErrorMetadata(error: unknown): SafeModelScopeErrorMetadata {
  if (!error || typeof error !== 'object') return { name: 'UnknownError' }
  const value = error as {
    name?: unknown
    status?: unknown
    code?: unknown
    response?: { status?: unknown }
    constructor?: { name?: unknown }
  }
  const publicName = typeof value.name === 'string' ? value.name : undefined
  const constructorName = typeof value.constructor?.name === 'string' ? value.constructor.name : undefined
  return {
    name: publicName && publicName !== 'Error' ? publicName : constructorName ?? publicName ?? 'Error',
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
  'APIUserAbortError',
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

const RETRYABLE_HTTP_STATUSES = new Set([404, 408, 410, 425, 429])

const RETRYABLE_PROVIDER_ERROR_CODES = new Set([
  'MODEL_ACCESS_DENIED',
  'MODEL_NOT_FOUND',
  'MODEL_NOT_SUPPORTED',
  'MODEL_OVERLOADED',
  'MODEL_UNAVAILABLE',
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
  if (error instanceof ModelScopeRetryableResponseError) return true
  const metadata = safeModelScopeErrorMetadata(error)
  if (metadata.status === 401) return false
  const normalizedCode = metadata.code?.toUpperCase()
  const retryableStatus = metadata.status !== undefined
    && (RETRYABLE_HTTP_STATUSES.has(metadata.status) || metadata.status >= 500)
  return retryableStatus
    || RETRYABLE_ERROR_NAMES.has(metadata.name)
    || (metadata.code !== undefined && RETRYABLE_ERROR_CODES.has(metadata.code))
    || (normalizedCode !== undefined && RETRYABLE_PROVIDER_ERROR_CODES.has(normalizedCode))
}

type ModelScopeChatResponse = {
  choices?: Array<{
    message?: {
      content?: unknown
    }
  }>
}

export function readModelScopeChatContent(response: unknown): string {
  const choices = response && typeof response === 'object'
    ? (response as ModelScopeChatResponse).choices
    : undefined
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new ModelScopeMissingChoicesError()
  }

  const content = choices[0]?.message?.content
  const trimmed = typeof content === 'string' ? content.trim() : ''
  if (!trimmed) throw new ModelScopeEmptyContentError()
  return trimmed
}

export function modelScopeTerminalHttpError(error: unknown, operationLabel: string): HttpError | null {
  const { status } = safeModelScopeErrorMetadata(error)
  if (status === undefined) return null
  if (status === 401) return new HttpError(503, '模型服务认证失败，未切换模型')
  if ([400, 405, 415, 422].includes(status)) {
    return new HttpError(500, `${operationLabel}请求参数或接口不兼容，未切换模型`)
  }
  return new HttpError(502, `${operationLabel}模型请求失败（HTTP ${status}），未切换模型`)
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
  if (!apiKey) throw new ModelScopeConfigurationError('MODELSCOPE_TOKEN_API_KEY 未配置')

  return new OpenAI({
    baseURL: MODELSCOPE_BASE_URL,
    apiKey,
    maxRetries: 0,
  })
}
