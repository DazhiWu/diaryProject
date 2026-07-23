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

  it('treats single and blank line breaks as equal strong boundaries', () => {
    for (const separator of ['\n', '\n\n']) {
      const first = '甲'.repeat(450)
      const second = '乙'.repeat(450)
      const content = `${first}${separator}${second}`
      const chunks = chunkDiaryContent(content)
      expect(chunks.map((chunk) => chunk.content)).toEqual([first, second])
      expect(chunks[1]!.charStart).toBe(first.length + separator.length)
    }
  })

  it('merges adjacent short lines and balances the final chunk', () => {
    const lines = ['甲'.repeat(200), '乙'.repeat(200), '丙'.repeat(200), '丁'.repeat(200)]
    expect(chunkDiaryContent(lines.slice(0, 3).join('\n'))).toHaveLength(1)
    const chunks = chunkDiaryContent(lines.join('\n'))
    expect(chunks).toHaveLength(2)
    expect(chunks.every((chunk) => chunk.content.length >= 400 && chunk.content.length <= 700)).toBe(true)
  })

  it('prefers a newline boundary over a closer sentence boundary', () => {
    const firstLine = `${'甲。'.repeat(200)}${'乙'.repeat(350)}`
    const secondLine = '丙'.repeat(450)
    const chunks = chunkDiaryContent(`${firstLine}\n${secondLine}`)
    expect(chunks[0]!.content).toBe(firstLine)
    expect(chunks[0]!.content.length).toBe(750)
    expect(chunks[1]!.content).toBe(secondLine)
  })

  it('uses complete sentence overlap only when splitting a long line', () => {
    const content = Array.from({ length: 80 }, (_, index) => `第${index}件事情值得认真记录。`).join('')
    const chunks = chunkDiaryContent(content)
    expect(chunks.length).toBeGreaterThan(1)
    for (const [index, chunk] of chunks.entries()) {
      expect(chunk.chunkIndex).toBe(index)
      expect(chunk.content.length).toBeLessThanOrEqual(800)
      expect(content.slice(chunk.charStart, chunk.charEnd)).toBe(chunk.content)
      if (index > 0) {
        const previous = chunks[index - 1]!
        expect(chunk.charStart).toBeLessThan(previous.charEnd)
        const overlap = content.slice(chunk.charStart, previous.charEnd)
        expect(overlap).toMatch(/。$/u)
        expect(overlap.length).toBeLessThanOrEqual(120)
      }
    }
  })

  it('balances hard splits for a long sentence without punctuation', () => {
    const content = '长'.repeat(1_700)
    const chunks = chunkDiaryContent(content)
    expect(chunks.map((chunk) => chunk.content.length)).toEqual([800, 500, 400])
    expect(chunks.every((chunk, index) => index === 0 || chunk.charStart === chunks[index - 1]!.charEnd)).toBe(true)
  })

  it('returns no chunks for whitespace and creates stable SHA-256 source hashes', async () => {
    expect(chunkDiaryContent(' \n\t ')).toEqual([])
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(knowledgeSourceText('2026-07-19', '标题', '正文')).toBe('2026-07-19\0标题\0正文')
  })
})
