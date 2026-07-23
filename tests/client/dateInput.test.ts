import { describe, expect, it } from 'vitest'

import { KNOWLEDGE_SEARCH_DEFAULT_START_DATE, localDateInputValue } from '@/lib/dateInput'

describe('local date input formatting', () => {
  it('starts knowledge search at the first supported diary date', () => {
    expect(KNOWLEDGE_SEARCH_DEFAULT_START_DATE).toBe('2024-11-04')
  })

  it('uses local calendar fields instead of UTC conversion', () => {
    expect(localDateInputValue(new Date(2026, 6, 23, 0, 5))).toBe('2026-07-23')
  })
})
