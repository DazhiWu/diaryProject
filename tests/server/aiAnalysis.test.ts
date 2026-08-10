import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  completionCreate: vi.fn(),
  runFallback: vi.fn(),
}))

vi.mock('@/lib/server/modelScopeClient', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/server/modelScopeClient')>()
  return {
    ...original,
    createModelScopeClient: vi.fn().mockResolvedValue({
      chat: { completions: { create: mocks.completionCreate } },
    }),
    runModelScopeChatFallback: mocks.runFallback,
  }
})

import { analyzeDiaryWithAI, translateDiaryContent } from '@/lib/aiAnalysis'
import {
  MODELSCOPE_ALL_MODELS_FAILED_MESSAGE,
  ModelScopeModelsExhaustedError,
} from '@/lib/server/modelScopeClient'

async function useActualFallback(models: string[] = ['first/model', 'second/model']) {
  const actual = await vi.importActual<typeof import('@/lib/server/modelScopeClient')>(
    '@/lib/server/modelScopeClient',
  )
  const reserveQuota = vi.fn().mockResolvedValue({})
  mocks.runFallback.mockImplementation((options) => actual.runModelScopeChatFallback(
    options,
    { loadModels: async () => models, reserveQuota },
  ))
  return reserveQuota
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.completionCreate.mockReset()
  mocks.runFallback.mockReset()
  mocks.runFallback.mockImplementation(async (options: {
    attempt(model: string): Promise<unknown>
  }) => options.attempt('first/model'))
})

describe('diary ModelScope analysis', () => {
  it('sends the fallback-selected model and returns a valid structured analysis', async () => {
    mocks.completionCreate.mockResolvedValue({
      choices: [{ message: { content: '{"summary":"短标题","emotion":"平静"}' } }],
    })

    await expect(analyzeDiaryWithAI('日记正文')).resolves.toEqual({
      summary: '短标题',
      emotion: '平静',
    })
    expect(mocks.completionCreate.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      model: 'first/model',
      stream: false,
    }))
  })

  it.each([
    ['empty content', ''],
    ['malformed JSON', 'not json'],
    ['missing emotion', '{"summary":"标题"}'],
    ['blank summary', '{"summary":" ","emotion":"平静"}'],
  ])('switches models after %s', async (_name, content) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const reserveQuota = await useActualFallback()
    mocks.completionCreate
      .mockResolvedValueOnce({ choices: [{ message: { content } }] })
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"summary":"备用标题","emotion":"平静"}' } }],
      })

    await expect(analyzeDiaryWithAI('日记正文')).resolves.toEqual({
      summary: '备用标题',
      emotion: '平静',
    })
    expect(mocks.completionCreate.mock.calls.map(([request]) => request.model)).toEqual([
      'first/model',
      'second/model',
    ])
    expect(reserveQuota).toHaveBeenCalledTimes(2)
  })

  it('switches models when a successful response omits choices', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const reserveQuota = await useActualFallback()
    mocks.completionCreate
      .mockResolvedValueOnce({
        id: 'chatcmpl-missing-choices',
        object: 'chat.completion',
        created: 1,
        model: 'first/model',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"summary":"备用标题","emotion":"平静"}' } }],
      })

    await expect(analyzeDiaryWithAI('日记正文')).resolves.toEqual({
      summary: '备用标题',
      emotion: '平静',
    })
    expect(mocks.completionCreate.mock.calls.map(([request]) => request.model)).toEqual([
      'first/model',
      'second/model',
    ])
    expect(reserveQuota).toHaveBeenCalledTimes(2)
    expect(consoleError).toHaveBeenCalledWith('[modelscope]', {
      operation: 'analyze',
      outcome: 'failed',
      model: 'first/model',
      name: 'ModelScopeMissingChoicesError',
      code: 'MISSING_CHOICES',
    })
  })

  it('reports a terminal request-contract failure without exposing the provider body', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.completionCreate.mockRejectedValue(
      Object.assign(new Error('private upstream body'), { status: 400, code: 'invalid_request' }),
    )

    await expect(analyzeDiaryWithAI('日记正文')).rejects.toMatchObject({
      status: 500,
      message: 'AI分析请求参数或接口不兼容，未切换模型',
    })
    expect(mocks.completionCreate).toHaveBeenCalledOnce()
  })

  it('reports an unexpected project error without exposing its internal message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.completionCreate.mockRejectedValue(new TypeError('private internal detail'))

    await expect(analyzeDiaryWithAI('日记正文')).rejects.toMatchObject({
      status: 500,
      message: 'AI分析项目处理异常，请稍后重试',
    })
    expect(mocks.completionCreate).toHaveBeenCalledOnce()
  })
})

describe('diary ModelScope translation', () => {
  it('sends the fallback-selected model and trims a non-empty translation', async () => {
    mocks.completionCreate.mockResolvedValue({
      choices: [{ message: { content: '  English translation.  ' } }],
    })

    await expect(translateDiaryContent('日记正文')).resolves.toBe('English translation.')
    expect(mocks.completionCreate.mock.calls[0]?.[0].model).toBe('first/model')
  })

  it('switches models after blank successful content', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const reserveQuota = await useActualFallback()
    mocks.completionCreate
      .mockResolvedValueOnce({ choices: [{ message: { content: '   ' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: '  English translation.  ' } }] })

    await expect(translateDiaryContent('日记正文')).resolves.toBe('English translation.')
    expect(mocks.completionCreate.mock.calls.map(([request]) => request.model)).toEqual([
      'first/model',
      'second/model',
    ])
    expect(reserveQuota).toHaveBeenCalledTimes(2)
  })

  it('switches models when a successful response omits choices', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const reserveQuota = await useActualFallback()
    mocks.completionCreate
      .mockResolvedValueOnce({
        id: 'chatcmpl-missing-choices',
        object: 'chat.completion',
        created: 1,
        model: 'first/model',
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: '  English translation.  ' } }],
      })

    await expect(translateDiaryContent('日记正文')).resolves.toBe('English translation.')
    expect(mocks.completionCreate.mock.calls.map(([request]) => request.model)).toEqual([
      'first/model',
      'second/model',
    ])
    expect(reserveQuota).toHaveBeenCalledTimes(2)
  })

  it('maps complete model exhaustion to the required feedback', async () => {
    mocks.runFallback.mockRejectedValueOnce(new ModelScopeModelsExhaustedError())

    await expect(translateDiaryContent('日记正文')).rejects.toMatchObject({
      status: 502,
      message: MODELSCOPE_ALL_MODELS_FAILED_MESSAGE,
    })
    expect(mocks.completionCreate).not.toHaveBeenCalled()
  })
})
