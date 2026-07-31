import { afterEach, describe, expect, it, vi } from 'vitest'

import { createOllamaChatCompletion } from '@/lib/server/ollamaClient'
import { DEFAULT_THEME_TIMELINE_GENERATION_CONFIG } from '@/lib/themeTimelineConfig'

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
  vi.restoreAllMocks()
})

describe('local Ollama client', () => {
  it('sends the frozen model controls and JSON schema to the native chat API', async () => {
    process.env.OLLAMA_BASE_URL = 'http://windows-host:11434/'
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      message: { content: '{"relevant":false}' },
    }), { status: 200 }))
    const schema = { type: 'object', properties: { relevant: { type: 'boolean' } } }

    await expect(createOllamaChatCompletion({
      config: { ...DEFAULT_THEME_TIMELINE_GENERATION_CONFIG, temperature: 0.25, thinking: true },
      system: 'system',
      user: 'user',
      maxTokens: 768,
      schema,
    })).resolves.toBe('{"relevant":false}')

    expect(fetchMock).toHaveBeenCalledWith('http://windows-host:11434/api/chat', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        model: 'qwen3.5:4b',
        messages: [
          { role: 'system', content: 'system' },
          { role: 'user', content: 'user' },
        ],
        stream: false,
        think: true,
        format: schema,
        keep_alive: '10m',
        options: {
          num_ctx: 32_768,
          temperature: 0.25,
          top_p: 0.9,
          top_k: 20,
          num_predict: 768,
        },
      }),
    }))
  })

  it('does not expose upstream response bodies when Ollama is unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('secret upstream detail', { status: 500 }))
    await expect(createOllamaChatCompletion({
      config: DEFAULT_THEME_TIMELINE_GENERATION_CONFIG,
      system: 'system',
      user: 'user',
      maxTokens: 128,
      schema: { type: 'object' },
    })).rejects.toEqual(expect.objectContaining({
      reason: 'unavailable',
      status: 500,
    }))
  })

  it('classifies an empty structured response without exposing the upstream payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      message: { content: '' },
    }), { status: 200 }))
    await expect(createOllamaChatCompletion({
      config: DEFAULT_THEME_TIMELINE_GENERATION_CONFIG,
      system: 'system',
      user: 'user',
      maxTokens: 128,
      schema: { type: 'object' },
    })).rejects.toEqual(expect.objectContaining({
      reason: 'invalid-response',
      status: 200,
      diagnosticCode: 'empty_model_content',
    }))
  })
})
