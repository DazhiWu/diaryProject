import { describe, expect, it } from 'vitest'

import { chunkDiaryContent, knowledgeSourceText, sha256Hex } from '@/lib/server/knowledgeChunks'

describe('diary knowledge chunking', () => {
  it('keeps exact source offsets and trims surrounding whitespace', () => {
    const content = '  第一段日记。\n\n第二段日记。  '
    const chunks = chunkDiaryContent(content)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toMatchObject({ chunkIndex: 0, content: '第一段日记。\n\n第二段日记。', charStart: 2, charEnd: content.length - 2 })
    expect(content.slice(chunks[0]!.charStart, chunks[0]!.charEnd)).toBe(chunks[0]!.content)
  })

  it('creates bounded overlapping chunks for long Chinese text', () => {
    const content = Array.from({ length: 240 }, (_, index) => `第${index}段记录了一件值得回忆的事情。`).join('\n')
    const chunks = chunkDiaryContent(content)
    expect(chunks.length).toBeGreaterThan(2)
    for (const [index, chunk] of chunks.entries()) {
      expect(chunk.chunkIndex).toBe(index)
      expect(chunk.content.length).toBeLessThanOrEqual(1_200)
      expect(content.slice(chunk.charStart, chunk.charEnd)).toBe(chunk.content)
      if (index > 0) expect(chunk.charStart).toBeLessThan(chunks[index - 1]!.charEnd)
    }
  })

  it('returns no chunks for whitespace and creates stable SHA-256 source hashes', async () => {
    expect(chunkDiaryContent(' \n\t ')).toEqual([])
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(knowledgeSourceText('2026-07-19', '标题', '正文')).toBe('2026-07-19\0标题\0正文')
  })
})
