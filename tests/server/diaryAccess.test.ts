import { describe, expect, it } from 'vitest'

import { getDiaryById, getDiaryList, type DiaryRepository, type DiaryRow } from '@/lib/server/diaryAccess'

const rows: DiaryRow[] = Array.from({ length: 9 }, (_, index) => ({
  id: 9 - index,
  date: `2030-01-${String(9 - index).padStart(2, '0')}`,
  subtitle: `entry ${9 - index}`,
  content: index === 0 ? 'x future' : 'x',
  image_paths: [],
  modifiedAt: null,
  created_at: null,
}))

const repository: DiaryRepository = {
  latestIds: async () => rows.slice(0, 5).map((row) => row.id),
  list: async ({ page, pageSize, search }, allowedIds) => {
    const filtered = rows.filter((row) => (!allowedIds || allowedIds.includes(row.id)) && (!search || row.content.includes(search) || row.subtitle?.includes(search)))
    return { entries: filtered.slice((page - 1) * pageSize, page * pageSize), totalCount: filtered.length }
  },
  byId: async (id) => rows.find((row) => row.id === id) ?? null,
  byDate: async (date) => rows.find((row) => row.date === date) ?? null,
  calendar: async (allowedIds) => rows.filter((row) => !allowedIds || allowedIds.includes(row.id)).map(({ id, date, subtitle }) => ({ id, date, subtitle })),
  ordered: async (allowedIds) => rows.filter((row) => !allowedIds || allowedIds.includes(row.id)),
}

describe('diary access', () => {
  it('includes a future date when it is in the five newest rows', async () => {
    const result = await getDiaryList({ page: 1, pageSize: 50, search: 'x' }, 'guest', repository)
    expect(result.entries.map((entry) => entry.id)).toEqual([9, 8, 7, 6, 5])
    expect(result.totalCount).toBe(5)
  })

  it('returns 403 for a real sixth diary and 404 for an absent diary', async () => {
    await expect(getDiaryById(4, 'guest', repository)).rejects.toMatchObject({ status: 403 })
    await expect(getDiaryById(404, 'guest', repository)).rejects.toMatchObject({ status: 404 })
  })
})
