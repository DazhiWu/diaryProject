import { describe, expect, it } from 'vitest'

import { KnowledgeIndexStepError, sanitizeKnowledgeIndexFailure } from '@/lib/server/knowledgeIndexFailure'

describe('knowledge index failure sanitization', () => {
  it('stores ModelScope status, code, upstream detail, and diary content', () => {
    const failure = sanitizeKnowledgeIndexFailure({
      name: 'RateLimitError',
      status: 429,
      code: 'rate_limit_exceeded',
      message: 'upstream response body',
      error: { reason: 'capacity' },
    }, 'private diary content')

    expect(failure.category).toBe('modelscope_rate_limit')
    expect(failure.status).toBe(429)
    expect(failure.code).toBe('rate_limit_exceeded')
    expect(JSON.parse(failure.storedMessage)).toMatchObject({
      category: 'modelscope_rate_limit',
      status: 429,
      code: 'rate_limit_exceeded',
      upstream: { text: 'upstream response body\n{"reason":"capacity"}', truncated: false },
      diary: { text: 'private diary content', truncated: false },
    })
  })

  it('classifies timeouts and invalid embedding responses', () => {
    expect(JSON.parse(sanitizeKnowledgeIndexFailure(new DOMException('The operation timed out', 'TimeoutError')).storedMessage).category).toBe('modelscope_timeout')
    expect(JSON.parse(sanitizeKnowledgeIndexFailure(new Error('Embedding response has an unexpected shape')).storedMessage).category).toBe('embedding_response_shape')
  })

  it('keeps only safe database error metadata', () => {
    const failure = sanitizeKnowledgeIndexFailure(new KnowledgeIndexStepError({
      category: 'chunk_replace_failed',
      code: 'PGRST204',
    }))

    expect(JSON.parse(failure.storedMessage)).toEqual({ category: 'chunk_replace_failed', code: 'PGRST204' })
  })

  it('drops unsafe status and code values while redacting credentials', () => {
    const failure = sanitizeKnowledgeIndexFailure({ status: 999, code: 'bad;secret=value', message: 'Authorization=top-secret Bearer abc.def', error: { api_key: 'sk-abcdefghijklmnop' } })
    expect(failure.category).toBe('unexpected')
    expect(failure.status).toBeUndefined()
    expect(failure.code).toBeUndefined()
    expect(failure.storedMessage).not.toContain('top-secret')
    expect(failure.storedMessage).not.toContain('abc.def')
    expect(failure.storedMessage).not.toContain('abcdefghijklmnop')
  })
})
