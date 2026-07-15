import { describe, expect, it } from 'vitest'

import { diaryNeighbors, entriesVisibleForNavigation } from '@/lib/diaryNavigation'

const entries = [
  { id: 3, date: new Date('2026-01-03') },
  { id: 1, date: new Date('2026-01-01') },
  { id: 2, date: new Date('2026-01-02') },
]

describe('diary navigation', () => {
  it('finds chronological neighbors without mutating input', () => {
    expect(diaryNeighbors(entries, 2)).toEqual({ previous: entries[1], next: entries[0] })
    expect(entries.map((entry) => entry.id)).toEqual([3, 1, 2])
  })

  it('uses only the current guest page and the full calendar set for authenticated roles', () => {
    expect(entriesVisibleForNavigation(true, [entries[0]], entries)).toEqual([entries[0]])
    expect(entriesVisibleForNavigation(false, [entries[0]], entries)).toEqual(entries)
  })
})
