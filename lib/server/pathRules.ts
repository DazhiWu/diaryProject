import 'server-only'

import { HttpError } from '@/lib/server/session'

const diaryImagePattern = /^(\d{4})\/(\d{8})_(\d+)\.webp$/u
const yearlyImagePattern = /^yearly\/([1-9]\d*)\.webp$/u
const audioPattern = /^([^/\\?%#]+\.mp3)$/u

function invalidPath(): never {
  throw new HttpError(400, 'Invalid media path')
}

function assertSafePath(path: string): void {
  if (!path || path.includes('..') || path.includes('\\') || path.includes('%') || path.includes('//') || /[?#]/u.test(path)) invalidPath()
}

export function parseDiaryImagePath(path: string): { date: string; sequence: number } {
  assertSafePath(path)
  const match = diaryImagePattern.exec(path)
  if (!match) invalidPath()
  const [, year, date, sequence] = match
  const parsedDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
  const calendarDate = new Date(`${parsedDate}T00:00:00Z`)
  if (year !== date.slice(0, 4)
    || !Number.isSafeInteger(Number(sequence))
    || Number(sequence) < 0
    || Number.isNaN(calendarDate.getTime())
    || calendarDate.toISOString().slice(0, 10) !== parsedDate) invalidPath()
  return { date: parsedDate, sequence: Number(sequence) }
}

export function assertDiaryImagePathMatchesDate(path: string, diaryDate: string): void {
  const parsed = parseDiaryImagePath(path)
  if (parsed.date !== diaryDate) invalidPath()
}

export function parseYearlyImagePath(path: string): { sequence: number } {
  assertSafePath(path)
  const match = yearlyImagePattern.exec(path)
  if (!match || !Number.isSafeInteger(Number(match[1]))) invalidPath()
  return { sequence: Number(match[1]) }
}

export function parseAudioPath(path: string): { path: string } {
  assertSafePath(path)
  if (!audioPattern.test(path)) invalidPath()
  return { path }
}

export function parseSingleRange(header: string | null, size: number): { start: number; end: number; length: number } | null {
  if (!header) return null
  if (!Number.isSafeInteger(size) || size < 1) throw new HttpError(416, '416 Range Not Satisfiable')
  const match = /^bytes=(\d*)-(\d*)$/u.exec(header)
  if (!match || (!match[1] && !match[2])) throw new HttpError(416, '416 Range Not Satisfiable')
  const [, startText, endText] = match
  let start: number
  let end: number
  if (!startText) {
    const suffixLength = Number(endText)
    if (!Number.isSafeInteger(suffixLength) || suffixLength < 1) throw new HttpError(416, '416 Range Not Satisfiable')
    start = Math.max(size - suffixLength, 0)
    end = size - 1
  } else {
    start = Number(startText)
    end = endText ? Number(endText) : size - 1
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) throw new HttpError(416, '416 Range Not Satisfiable')
    end = Math.min(end, size - 1)
  }
  return { start, end, length: end - start + 1 }
}
