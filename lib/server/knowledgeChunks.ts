import 'server-only'

export type KnowledgeChunk = {
  chunkIndex: number
  content: string
  charStart: number
  charEnd: number
}

const TARGET_CHARS = 900
const MAX_CHARS = 1_200
const OVERLAP_CHARS = 150
const MIN_BOUNDARY_RATIO = 0.6

function trimmedRange(content: string, start: number, end: number): { start: number; end: number } {
  while (start < end && /\s/u.test(content[start]!)) start += 1
  while (end > start && /\s/u.test(content[end - 1]!)) end -= 1
  return { start, end }
}

function preferredBoundary(content: string, start: number): number {
  const maximum = Math.min(content.length, start + MAX_CHARS)
  if (maximum === content.length) return maximum

  const target = Math.min(maximum, start + TARGET_CHARS)
  const minimum = start + Math.floor(TARGET_CHARS * MIN_BOUNDARY_RATIO)
  const boundaryPattern = /[\n。！？!?；;]/u

  for (let index = maximum - 1; index >= target; index -= 1) {
    if (boundaryPattern.test(content[index]!)) return index + 1
  }
  for (let index = target - 1; index >= minimum; index -= 1) {
    if (boundaryPattern.test(content[index]!)) return index + 1
  }
  return maximum
}

export function chunkDiaryContent(content: string): KnowledgeChunk[] {
  const chunks: KnowledgeChunk[] = []
  let cursor = 0

  while (cursor < content.length) {
    const boundary = preferredBoundary(content, cursor)
    const range = trimmedRange(content, cursor, boundary)
    if (range.end > range.start) {
      chunks.push({
        chunkIndex: chunks.length,
        content: content.slice(range.start, range.end),
        charStart: range.start,
        charEnd: range.end,
      })
    }
    if (boundary >= content.length) break

    const next = Math.max(boundary - OVERLAP_CHARS, cursor + 1)
    cursor = trimmedRange(content, next, content.length).start
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
