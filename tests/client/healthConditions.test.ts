import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchHealthConditions } from '@/lib/diaryApi'
import { getHealthConditionsForMonth } from '@/hooks/useHealthConditions'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('health condition API conversion', () => {
  it('parses the API camelCase date fields returned for existing conditions', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      {
        id: 'condition-1',
        condition: '感冒',
        startDate: '2026-08-20',
        endDate: '2026-08-23',
        color: '#FFD700',
        created_at: '2026-08-20T00:00:00.000Z',
      },
    ]), { status: 200 }))

    const [condition] = await fetchHealthConditions()

    expect(condition.startDate.getTime()).not.toBeNaN()
    expect(condition.endDate.getTime()).not.toBeNaN()
    expect(condition.startDate.toISOString().slice(0, 10)).toBe('2026-08-20')
    expect(condition.endDate.toISOString().slice(0, 10)).toBe('2026-08-23')
  })

  it('includes only conditions overlapping the calendar month', () => {
    const conditions = [
      {
        id: 'march-only',
        condition: 'March condition',
        startDate: new Date(2026, 2, 5),
        endDate: new Date(2026, 2, 20),
        color: '#111111',
      },
      {
        id: 'cross-month',
        condition: 'Cross-month condition',
        startDate: new Date(2026, 1, 25),
        endDate: new Date(2026, 3, 3),
        color: '#222222',
      },
    ]

    expect(getHealthConditionsForMonth(conditions, new Date(2026, 1, 1)).map((condition) => condition.id)).toEqual(['cross-month'])
    expect(getHealthConditionsForMonth(conditions, new Date(2026, 2, 1)).map((condition) => condition.id)).toEqual(['march-only', 'cross-month'])
    expect(getHealthConditionsForMonth(conditions, new Date(2026, 3, 1)).map((condition) => condition.id)).toEqual(['cross-month'])
    expect(getHealthConditionsForMonth(conditions, new Date(2026, 4, 1))).toEqual([])
  })
})
