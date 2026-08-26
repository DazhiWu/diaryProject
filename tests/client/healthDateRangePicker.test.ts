import { describe, expect, it } from 'vitest'

import { formatHealthDateRange, healthMonthsForYear, isHealthDateAllowed, selectHealthDateRangeDate } from '@/components/health-date-range-picker'

describe('health date range picker', () => {
  it('uses the requested date-range display format', () => {
    expect(formatHealthDateRange({ startDate: '', endDate: '' })).toBe('YYYY/MM/DD - YYYY/MM/DD')
    expect(formatHealthDateRange({ startDate: '2026-03-05', endDate: '2026-03-20' })).toBe('2026/03/05 - 2026/03/20')
  })

  it('creates a range in either selection order and begins a new range after completion', () => {
    const afterFirstDate = selectHealthDateRangeDate({ startDate: '', endDate: '' }, new Date(2026, 2, 20))
    expect(afterFirstDate).toEqual({ startDate: '2026-03-20', endDate: '' })

    const afterEarlierDate = selectHealthDateRangeDate(afterFirstDate, new Date(2026, 2, 5))
    expect(afterEarlierDate).toEqual({ startDate: '2026-03-05', endDate: '2026-03-20' })

    expect(selectHealthDateRangeDate(afterEarlierDate, new Date(2026, 3, 1))).toEqual({ startDate: '2026-04-01', endDate: '' })
  })

  it('keeps the earliest selectable date at November 2024', () => {
    expect(isHealthDateAllowed(new Date(2024, 9, 31))).toBe(false)
    expect(isHealthDateAllowed(new Date(2024, 10, 1))).toBe(true)
    expect(healthMonthsForYear(2023)).toEqual([])
    expect(healthMonthsForYear(2024)).toEqual([10, 11])
    expect(healthMonthsForYear(2025)).toHaveLength(12)
  })

  it('can apply a maximum date for date-range consumers such as downloads', () => {
    const maxDate = new Date(2026, 7, 26)
    expect(isHealthDateAllowed(new Date(2026, 7, 26), maxDate)).toBe(true)
    expect(isHealthDateAllowed(new Date(2026, 7, 27), maxDate)).toBe(false)
    expect(healthMonthsForYear(2026, maxDate)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })
})
