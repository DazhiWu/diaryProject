import { describe, expect, it } from 'vitest'

import {
  audioMedia,
  diaryMedia,
  diaryMediaUrl,
  jsonbContainsPath,
  streamStorageBody,
  storageObjectUrl,
  storageSizeFromContentRange,
  yearlyMedia,
  yearlyMediaUrl,
  type MediaStore,
} from '@/lib/server/media'

function stream(value: string): ReadableStream<Uint8Array> {
  return new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(value)); controller.close() } })
}

const store: MediaStore = {
  diaryOwner: async (path) => path === '2020/20200101_1.webp' ? { id: 6 } : null,
  latestDiaryIds: async () => [1, 2, 3, 4, 5],
  yearlyOwner: async (path) => path === 'yearly/1.webp' ? { id: 1 } : null,
  audioOwner: async (path) => path === 'recording.mp3' ? { id: 'audio-1' } : null,
  stat: async () => ({ contentType: 'audio/mpeg', size: 6 }),
  download: async (_bucket, _path, range) => {
    const source = 'abcdef'
    const body = range ? source.slice(range.start, range.end + 1) : source
    return { body: stream(body), contentType: 'audio/mpeg', size: source.length }
  },
}

function request(path: string, range?: string) {
  return new Request(`http://localhost${path}`, { headers: range ? { Range: range } : undefined })
}

describe('media proxies', () => {
  it('serializes a diary JSONB containment value for the Storage path query', () => {
    expect(jsonbContainsPath('2026/20260713_1.webp')).toBe('["2026/20260713_1.webp"]')
  })

  it('adapts an upstream Storage stream without buffering it', async () => {
    const source = stream('abcdef')
    const adapted = streamStorageBody(source)

    expect(adapted).not.toBe(source)
    await expect(new Response(adapted).text()).resolves.toBe('abcdef')
  })

  it('normalizes a CRLF runtime Storage URL before appending an object path', () => {
    expect(storageObjectUrl('https://project.supabase.co\r', 'bucket', '2026/20260713_1.webp'))
      .toBe('https://project.supabase.co/storage/v1/object/bucket/2026/20260713_1.webp')
  })

  it('derives the audio size from a GET Range Content-Range instead of a Storage HEAD response', () => {
    expect(storageSizeFromContentRange('bytes 0-0/12345')).toBe(12345)
    expect(() => storageSizeFromContentRange(null)).toThrow('Invalid storage range response')
  })

  it('returns 403 for a real image owned by the sixth diary and 404 for no owner', async () => {
    expect((await diaryMedia(request('/api/media/diary?path=2020%2F20200101_1.webp'), 'guest', store)).status).toBe(403)
    expect((await diaryMedia(request('/api/media/diary?path=2020%2F20200101_9.webp'), 'guest', store)).status).toBe(404)
  })

  it('allows a guest to read an owned yearly image', async () => {
    expect((await yearlyMedia(request('/api/media/yearly?path=yearly%2F1.webp'), 'guest', store)).status).toBe(200)
  })

  it('requires admin for audio and forwards a valid audio range without buffering', async () => {
    expect((await audioMedia(request('/api/media/audio?path=recording.mp3', 'bytes=0-3'), 'viewer', store)).status).toBe(403)
    const response = await audioMedia(request('/api/media/audio?path=recording.mp3', 'bytes=0-3'), 'admin', store)
    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Range')).toBe('bytes 0-3/6')
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    expect(await response.text()).toBe('abcd')
  })

  it('builds versioned proxy URLs from record timestamps', () => {
    expect(diaryMediaUrl('2026/20260118_1.webp', '2026-01-18T00:00:00.000Z')).toContain('v=2026-01-18T00%3A00%3A00.000Z')
    expect(yearlyMediaUrl('yearly/1.webp', '2026-01-18T00:00:00.000Z')).toContain('path=yearly%2F1.webp')
  })
})
