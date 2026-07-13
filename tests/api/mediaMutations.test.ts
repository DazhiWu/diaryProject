import { describe, expect, it } from 'vitest'

import { createDiaryImage, deleteAudio, parseAudioPath } from '@/lib/server/mediaMutations'

describe('media mutations', () => {
  it('compensates a successful upload when metadata insertion fails', async () => {
    const result = await createDiaryImage(
      { diaryId: 1, diaryDate: '2026-07-13', file: new File(['image'], 'image.webp', { type: 'image/webp' }) },
      {
        nextDiarySequence: async () => 1,
        upload: async () => undefined,
        remove: async () => undefined,
      },
      { appendDiaryImage: async () => { throw new Error('database failure') } },
    )

    expect(result).toEqual({ ok: false, residualPaths: [] })
  })

  it('reports a database-first delete with a residual object', async () => {
    const result = await deleteAudio('audio-1', {
      deleteAudio: async () => 'recording.mp3',
    }, {
      remove: async () => { throw new Error('storage failure') },
    })

    expect(result).toEqual({ databaseDeleted: true, storageDeleted: false, residualPaths: ['recording.mp3'] })
  })

  it('rejects wav and a nested mp3 path', () => {
    expect(() => parseAudioPath('nested/a.mp3')).toThrow()
    expect(() => parseAudioPath('a.wav')).toThrow()
  })
})
