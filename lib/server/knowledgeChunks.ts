import 'server-only'

export type KnowledgeChunk = {
  chunkIndex: number
  content: string
  charStart: number
  charEnd: number
}

const MIN_CHARS = 400
const TARGET_CHARS = 600
const PREFERRED_MAX_CHARS = 700
const MAX_CHARS = 800
const SENTENCE_OVERLAP_MAX_CHARS = 120

type ChunkBoundary = {
  end: number
  kind: 'line' | 'sentence' | 'hard' | 'end'
}

function trimmedRange(content: string, start: number, end: number): { start: number; end: number } {
  while (start < end && /\s/u.test(content[start]!)) start += 1
  while (end > start && /\s/u.test(content[end - 1]!)) end -= 1
  return { start, end }
}

function chooseClosestBoundary(content: string, start: number, candidates: number[]): number | undefined {
  if (candidates.length === 0) return undefined

  const avoidsShortTail = candidates.filter((end) => {
    const tail = trimmedRange(content, end, content.length)
    return tail.end === tail.start || tail.end - tail.start >= MIN_CHARS
  })
  const pool = avoidsShortTail.length > 0 ? avoidsShortTail : candidates
  return pool.reduce((best, candidate) => {
    const bestLength = best - start
    const candidateLength = candidate - start
    const bestPreferredPenalty = bestLength <= PREFERRED_MAX_CHARS ? 0 : 1
    const candidatePreferredPenalty = candidateLength <= PREFERRED_MAX_CHARS ? 0 : 1
    if (candidatePreferredPenalty !== bestPreferredPenalty) return candidatePreferredPenalty < bestPreferredPenalty ? candidate : best
    return Math.abs(candidateLength - TARGET_CHARS) < Math.abs(bestLength - TARGET_CHARS) ? candidate : best
  })
}

function preferredBoundary(content: string, start: number): ChunkBoundary {
  const maximum = Math.min(content.length, start + MAX_CHARS)
  if (maximum === content.length) return { end: maximum, kind: 'end' }

  const minimum = Math.min(maximum, start + MIN_CHARS)
  const lineBoundaries: number[] = []
  const sentenceBoundaries: number[] = []

  for (let index = minimum; index < maximum; index += 1) {
    const character = content[index]!
    if (character === '\n') lineBoundaries.push(index)
    else if (/[。！？!?；;]/u.test(character)) sentenceBoundaries.push(index + 1)
  }

  const lineBoundary = chooseClosestBoundary(content, start, lineBoundaries)
  if (lineBoundary !== undefined) return { end: lineBoundary, kind: 'line' }
  const sentenceBoundary = chooseClosestBoundary(content, start, sentenceBoundaries)
  if (sentenceBoundary !== undefined) return { end: sentenceBoundary, kind: 'sentence' }
  const tail = trimmedRange(content, maximum, content.length)
  if (tail.end > tail.start && tail.end - tail.start < MIN_CHARS && content.length - start <= MAX_CHARS + MIN_CHARS) {
    return { end: content.length - MIN_CHARS, kind: 'hard' }
  }
  return { end: maximum, kind: 'hard' }
}

function sentenceOverlapStart(content: string, chunkStart: number, chunkEnd: number): number | undefined {
  let sentenceStart = chunkStart
  for (let index = chunkEnd - 2; index >= chunkStart; index -= 1) {
    if (content[index] === '\n' || /[。！？!?；;]/u.test(content[index]!)) {
      sentenceStart = index + 1
      break
    }
  }
  const range = trimmedRange(content, sentenceStart, chunkEnd)
  const length = range.end - range.start
  return length > 0 && length <= SENTENCE_OVERLAP_MAX_CHARS ? range.start : undefined
}

export function chunkDiaryContent(content: string): KnowledgeChunk[] {
  const chunks: KnowledgeChunk[] = []
  let cursor = 0

  while (cursor < content.length) {
    const boundary = preferredBoundary(content, cursor)
    const range = trimmedRange(content, cursor, boundary.end)
    if (range.end > range.start) {
      chunks.push({
        chunkIndex: chunks.length,
        content: content.slice(range.start, range.end),
        charStart: range.start,
        charEnd: range.end,
      })
    }
    if (boundary.end >= content.length) break

    const overlapStart = boundary.kind === 'sentence' ? sentenceOverlapStart(content, cursor, boundary.end) : undefined
    const next = overlapStart ?? boundary.end
    cursor = trimmedRange(content, Math.max(next, cursor + 1), content.length).start
  }

  return chunks
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function knowledgeSourceText(date: string, title: string | null, content: string): string {
  return `${date}\0${title ?? ''}\0${content}`
}
