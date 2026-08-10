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

beforeEach(() => {
  vi.clearAllMocks()
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
  ])('returns a terminal response error for %s', async (_name, content) => {
    mocks.completionCreate.mockResolvedValue({ choices: [{ message: { content } }] })

    await expect(analyzeDiaryWithAI('日记正文')).rejects.toMatchObject({ status: 502 })
    expect(mocks.runFallback).toHaveBeenCalledOnce()
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

  it('returns a terminal response error for blank successful content', async () => {
    mocks.completionCreate.mockResolvedValue({ choices: [{ message: { content: '   ' } }] })

    await expect(translateDiaryContent('日记正文')).rejects.toMatchObject({
      status: 502,
      message: '模型返回结果为空',
    })
    expect(mocks.completionCreate).toHaveBeenCalledOnce()
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
