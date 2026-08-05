import 'server-only'

export type ThemeTimelineEvidenceChunk = {
  chunkId: number
  chunkIndex: number
  charStart: number
  charEnd: number
  content: string
  contentHash: string
}

export type ThemeTimelineEvidenceUnit = {
  id: string
  chunkId: number
  chunkIndex: number
  charStart: number
  charEnd: number
  excerpt: string
  chunkContentHash: string
}

const MAX_UNIT_CHARS = 360
const MIN_SOFT_SPLIT_CHARS = 160
const TERMINAL = /[。！？!?；;]/u
const SOFT_BOUNDARY = /[，,：:、]/u
const CLOSER = /[”’"'」』）》】]/u

function trimmedRange(content: string, start: number, end: number): { start: number; end: number } {
  while (start < end && /\s/u.test(content[start]!)) start += 1
  while (end > start && /\s/u.test(content[end - 1]!)) end -= 1
  return { start, end }
}

function boundedRanges(content: string, start: number, end: number): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = []
  let cursor = start
  while (end - cursor > MAX_UNIT_CHARS) {
    const maximum = cursor + MAX_UNIT_CHARS
    let split = -1
    for (let index = maximum - 1; index >= cursor + MIN_SOFT_SPLIT_CHARS; index -= 1) {
      if (SOFT_BOUNDARY.test(content[index]!)) {
        split = index + 1
        break
      }
    }
    const next = split > cursor ? split : maximum
    ranges.push(trimmedRange(content, cursor, next))
    cursor = trimmedRange(content, next, end).start
  }
  ranges.push(trimmedRange(content, cursor, end))
  return ranges.filter((range) => range.end > range.start)
}

function chunkRanges(content: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = []
  let start = 0
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]!
    if (character !== '\n' && !TERMINAL.test(character)) continue
    let end = index + 1
    while (end < content.length && (TERMINAL.test(content[end]!) || CLOSER.test(content[end]!))) end += 1
    ranges.push(...boundedRanges(content, start, end))
    start = end
    index = end - 1
  }
  if (start < content.length) ranges.push(...boundedRanges(content, start, content.length))
  return ranges
}

export function buildThemeTimelineEvidenceUnits(
  chunks: ThemeTimelineEvidenceChunk[],
): ThemeTimelineEvidenceUnit[] {
  const bySourceRange = new Map<string, ThemeTimelineEvidenceUnit>()
  for (const chunk of [...chunks].sort((left, right) => left.chunkIndex - right.chunkIndex)) {
    for (const range of chunkRanges(chunk.content)) {
      const charStart = chunk.charStart + range.start
      const charEnd = chunk.charStart + range.end
      const excerpt = chunk.content.slice(range.start, range.end)
      const key = `${charStart}:${charEnd}:${excerpt}`
      if (bySourceRange.has(key)) continue
      bySourceRange.set(key, {
        id: `c${chunk.chunkIndex}:${charStart}-${charEnd}`,
        chunkId: chunk.chunkId,
        chunkIndex: chunk.chunkIndex,
        charStart,
        charEnd,
        excerpt,
        chunkContentHash: chunk.contentHash,
      })
    }
  }
  return [...bySourceRange.values()].sort((left, right) => (
    left.charStart - right.charStart || left.charEnd - right.charEnd || left.chunkIndex - right.chunkIndex
  ))
}

export function selectThemeTimelineEvidenceUnits(
  unitIds: string[],
  units: ThemeTimelineEvidenceUnit[],
): ThemeTimelineEvidenceUnit[] {
  if (new Set(unitIds).size !== unitIds.length) throw new Error('Duplicate theme evidence unit ids')
  const byId = new Map(units.map((unit) => [unit.id, unit]))
  return unitIds.map((id) => {
    const unit = byId.get(id)
    if (!unit) throw new Error('Unknown theme evidence unit id')
    return unit
  })
}
