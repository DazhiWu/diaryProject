import { describe, expect, it } from 'vitest'

import { convertToEntry } from '@/hooks/useDiaryController'

describe('convertToEntry', () => {
  it('keeps Storage paths separate from image URLs used by the UI', () => {
    const entry = convertToEntry({
      id: 10,
      date: new Date('2026-08-17T00:00:00.000Z'),
      subtitle: 'With image',
      content: 'content',
      images: ['2026/20260817_1.webp'],
      modifiedAt: new Date('2026-08-17T01:00:00.000Z'),
    })

    expect(entry.imagePaths).toEqual(['2026/20260817_1.webp'])
    expect(entry.images).toEqual(['/api/media/diary?path=2026%2F20260817_1.webp&v=2026-08-17T01%3A00%3A00.000Z'])
  })
})
