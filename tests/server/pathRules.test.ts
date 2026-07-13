import { describe, expect, it } from 'vitest'

import {
  assertDiaryImagePathMatchesDate,
  parseAudioPath,
  parseDiaryImagePath,
  parseSingleRange,
  parseYearlyImagePath,
} from '@/lib/server/pathRules'

describe('media path rules', () => {
  it.each(['', '../x.webp', '2026//20260118_1.webp', '2026/20260118_1.webp?x=1', '2026%2f20260118_1.webp'])('rejects diary path %s', (path) => {
    expect(() => parseDiaryImagePath(path)).toThrow()
  })

  it('accepts exactly a diary date-matched webp path', () => {
    expect(parseDiaryImagePath('2026/20260118_1.webp')).toEqual({ date: '2026-01-18', sequence: 1 })
    expect(() => assertDiaryImagePathMatchesDate('2026/20260118_1.webp', '2026-01-18')).not.toThrow()
  })

  it('rejects a mismatched directory year even when the filename date matches', () => {
    expect(() => assertDiaryImagePathMatchesDate('2025/20260118_1.webp', '2026-01-18')).toThrow()
  })

  it('rejects a filename date that differs from the owning diary date', () => {
    expect(() => assertDiaryImagePathMatchesDate('2026/20260119_1.webp', '2026-01-18')).toThrow()
  })

  it('accepts strict yearly and root-level MP3 paths', () => {
    expect(parseYearlyImagePath('yearly/123.webp')).toEqual({ sequence: 123 })
    expect(parseAudioPath('recording.mp3')).toEqual({ path: 'recording.mp3' })
  })

  it.each(['yearly/0.webp', 'yearly/a.webp', 'nested/recording.mp3', 'recording.wav'])('rejects invalid yearly or audio paths %s', (path) => {
    expect(() => path.startsWith('yearly/') ? parseYearlyImagePath(path) : parseAudioPath(path)).toThrow()
  })
})

describe('single HTTP byte ranges', () => {
  it('parses bounded, open-ended, and suffix ranges', () => {
    expect(parseSingleRange('bytes=0-3', 6)).toEqual({ start: 0, end: 3, length: 4 })
    expect(parseSingleRange('bytes=3-', 6)).toEqual({ start: 3, end: 5, length: 3 })
    expect(parseSingleRange('bytes=-2', 6)).toEqual({ start: 4, end: 5, length: 2 })
  })

  it('returns 416 for an unsatisfiable Range', () => {
    expect(() => parseSingleRange('bytes=20-30', 20)).toThrow(/416/)
  })
})
