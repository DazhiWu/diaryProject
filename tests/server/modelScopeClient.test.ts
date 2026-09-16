import { afterEach, describe, expect, it, vi } from 'vitest'
import OpenAI from 'openai'

import {
  isRetryableModelScopeRequestError,
  ModelScopeConfigurationError,
  ModelScopeModelsExhaustedError,
  parseModelScopeChatModels,
  runModelScopeChatFallback,
  safeModelScopeErrorMetadata,
} from '@/lib/server/modelScopeClient'
import { HttpError } from '@/lib/server/session'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ModelScope model configuration', () => {
  it('preserves the configured model order while trimming empty entries', () => {
    expect(parseModelScopeChatModels(' first/model, ,second/model,first/model ')).toEqual([
      'first/model',
      'second/model',
      'first/model',
    ])
  })

  it('stops before quota reservation when the configured model list is empty', async () => {
    const reserveQuota = vi.fn()

    await expect(runModelScopeChatFallback(
      { operation: 'test', attempt: vi.fn() },
      { loadModels: async () => [], reserveQuota },
    )).rejects.toBeInstanceOf(ModelScopeConfigurationError)
    expect(reserveQuota).not.toHaveBeenCalled()
  })
})

describe('ModelScope retryable request errors', () => {
  it.each([
    [{ status: 404 }],
    [{ status: 408 }],
    [{ status: 410 }],
    [{ status: 425 }],
    [{ response: { status: 429 } }],
    [{ status: 503 }],
    [{ name: 'TimeoutError' }],
    [{ name: 'AbortError' }],
    [{ name: 'APIConnectionTimeoutError' }],
    [{ name: 'APIConnectionError' }],
    [new OpenAI.APIUserAbortError()],
    [{ code: 'ENOTFOUND' }],
    [{ code: 'ECONNREFUSED' }],
    [{ code: 'ECONNRESET' }],
    [{ code: 'ETIMEDOUT' }],
    [{ code: 'EAI_AGAIN' }],
  ])('classifies an upstream request failure as retryable: %j', (error) => {
    expect(isRetryableModelScopeRequestError(error)).toBe(true)
  })

  it('reports the concrete SDK error type when its public name is only Error', () => {
    expect(safeModelScopeErrorMetadata(new OpenAI.APIUserAbortError())).toMatchObject({
      name: 'APIUserAbortError',
    })
  })

  it.each([
    [{ status: 400 }],
    [{ status: 401 }],
    [{ status: 401, code: 'model_access_denied' }],
    [{ status: 403 }],
    [{ status: 405 }],
    [{ status: 409 }],
    [{ status: 415 }],
    [{ status: 422 }],
    [{ status: 418 }],
  ])('keeps an ambiguous project/request HTTP failure terminal: %j', (error) => {
    expect(isRetryableModelScopeRequestError(error)).toBe(false)
  })

  it.each([
    [{ status: 400, code: 'model_not_found' }],
    [{ status: 403, code: 'MODEL_ACCESS_DENIED' }],
    [{ status: 409, code: 'model_unavailable' }],
    [{ status: 422, code: 'model_not_supported' }],
  ])('switches on an explicit model-level provider error: %j', (error) => {
    expect(isRetryableModelScopeRequestError(error)).toBe(true)
  })

  it('keeps an ordinary response-validation error terminal', () => {
    expect(isRetryableModelScopeRequestError(new Error('invalid response'))).toBe(false)
  })

  it('keeps a local HTTP response-validation error terminal', () => {
    expect(isRetryableModelScopeRequestError(new HttpError(502, '模型返回结果格式错误'))).toBe(false)
  })
})

describe('ModelScope ordered fallback', () => {
  it('reserves once per attempted model and returns the first successful result', async () => {
    const reserveQuota = vi.fn().mockResolvedValue({})
    const attempt = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('private upstream body'), { status: 503 }))
      .mockResolvedValueOnce('second result')

    await expect(runModelScopeChatFallback(
      { operation: 'test', attempt },
      {
        loadModels: async () => ['first/model', 'second/model', 'third/model'],
        reserveQuota,
      },
    )).resolves.toBe('second result')
    expect(attempt.mock.calls.map(([model]) => model)).toEqual(['first/model', 'second/model'])
    expect(reserveQuota).toHaveBeenCalledTimes(2)
  })

  it('does not switch models after an HTTP-successful response-validation error', async () => {
    const terminal = new Error('invalid response')
    const attempt = vi.fn().mockRejectedValue(terminal)
    const reserveQuota = vi.fn().mockResolvedValue({})

    await expect(runModelScopeChatFallback(
      { operation: 'test', attempt },
      { loadModels: async () => ['first/model', 'second/model'], reserveQuota },
    )).rejects.toBe(terminal)
    expect(attempt).toHaveBeenCalledOnce()
    expect(reserveQuota).toHaveBeenCalledOnce()
  })

  it('stops before an upstream attempt when quota reservation fails', async () => {
    const quotaError = new Error('quota stopped')
    const reserveQuota = vi.fn().mockRejectedValue(quotaError)
    const attempt = vi.fn()

    await expect(runModelScopeChatFallback(
      { operation: 'test', attempt },
      { loadModels: async () => ['first/model', 'second/model'], reserveQuota },
    )).rejects.toBe(quotaError)
    expect(reserveQuota).toHaveBeenCalledOnce()
    expect(attempt).not.toHaveBeenCalled()
  })

  it('reports exhaustion after every configured model has a retryable failure', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const attempt = vi.fn().mockRejectedValue(
      Object.assign(new Error('private upstream body'), { status: 503, code: 'provider_down' }),
    )

    await expect(runModelScopeChatFallback(
      { operation: 'test', attempt },
      {
        loadModels: async () => ['first/model', 'second/model'],
        reserveQuota: vi.fn().mockResolvedValue({}),
      },
    )).rejects.toBeInstanceOf(ModelScopeModelsExhaustedError)
    expect(attempt).toHaveBeenCalledTimes(2)

    const logged = JSON.stringify(consoleError.mock.calls)
    expect(logged).toContain('first/model')
    expect(logged).toContain('second/model')
    expect(logged).toContain('provider_down')
    expect(logged).not.toContain('private upstream body')
  })
})
