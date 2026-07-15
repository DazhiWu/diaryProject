export type DatedEntry = { id: number; date: Date }

export function diaryNeighbors<T extends DatedEntry>(entries: T[], currentId: number): { previous: T | null; next: T | null } {
  const sorted = [...entries].sort((left, right) => left.date.getTime() - right.date.getTime())
  const index = sorted.findIndex((entry) => entry.id === currentId)
  if (index < 0) return { previous: null, next: null }
  return { previous: index > 0 ? sorted[index - 1] : null, next: index < sorted.length - 1 ? sorted[index + 1] : null }
}

export function entriesVisibleForNavigation<T>(guest: boolean, pageEntries: T[], calendarEntries: T[]): T[] {
  return guest ? pageEntries : calendarEntries
}
