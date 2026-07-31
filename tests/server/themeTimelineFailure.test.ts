import { describe, expect, it } from 'vitest'

import {
  parseStoredThemeTimelineFailure,
  serializeThemeTimelineFailure,
} from '@/lib/server/themeTimelineFailure'

describe('theme timeline failure diagnostics', () => {
  it('stores bounded redacted diary and model-output excerpts with a precise category', () => {
    const stored = serializeThemeTimelineFailure({
      category: 'invalid_response',
      code: 'invalid_json',
      status: 200,
      diaryContent: `私人日记 Authorization=top-secret ${'日'.repeat(600)}`,
      modelOutput: `Bearer abc.def ${'输'.repeat(600)}`,
    })

    expect(stored.length).toBeLessThanOrEqual(980)
    expect(stored).not.toContain('top-secret')
    expect(stored).not.toContain('abc.def')
    expect(parseStoredThemeTimelineFailure(stored)).toMatchObject({
      category: 'invalid_response',
      code: 'invalid_json',
      status: 200,
      diary: {
        truncated: true,
      },
      modelOutput: {
        truncated: true,
      },
    })
  })

  it('does not expose unstructured legacy error text', () => {
    expect(parseStoredThemeTimelineFailure('Local Ollama returned invalid structured output')).toEqual({
      category: 'legacy',
      code: null,
      status: null,
      diary: null,
      modelOutput: null,
    })
  })
})
