import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const database = vi.hoisted(() => ({
  writes: 0,
  rows: {
    yearly_summaries: [{ id: 1, year: '2025' }],
    important_events: [{ id: 10, yearly_summary_id: 2 }],
    ai_analysis_sections: [{ id: 20, yearly_summary_id: 2 }],
    ai_analysis_opinions: [{ id: 30, ai_analysis_section_id: 20 }],
    yearly_images: [{ id: 40, yearly_summary_id: 2, storage_path: 'yearly/40.webp' }],
  } as Record<string, Array<Record<string, unknown>>>,
}))

vi.mock('@/lib/server/supabaseAdmin', () => ({
  getSupabaseAdmin: async () => ({
    from(table: string) {
      const filters: Array<[string, unknown]> = []
      const builder: any = {
        select: () => builder,
        eq: (column: string, value: unknown) => { filters.push([column, value]); return builder },
        maybeSingle: async () => ({
          data: (database.rows[table] ?? []).find((row) => filters.every(([column, value]) => row[column] === value)) ?? null,
          error: null,
        }),
        single: async () => ({ data: null, error: null }),
        insert: () => { database.writes += 1; return builder },
        update: () => { database.writes += 1; return builder },
        delete: () => { database.writes += 1; return builder },
      }
      return builder
    },
  }),
}))

import { DELETE as deleteItem, PATCH as updateItem, POST as createItem } from '@/app/api/yearly-summaries/[year]/route'
import { DELETE as deleteImage, PUT as updateImage } from '@/app/api/yearly-summaries/[year]/images/[imageId]/route'
import { createSession } from '@/lib/server/session'

const originalEnv = { ...process.env }

async function adminCookie() {
  process.env.SESSION_SECRET = 'a'.repeat(32)
  process.env.SESSION_VERSION = '1'
  return `diary_session=${(await createSession('admin')).token}`
}

async function request(method: string, path: string, body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      Origin: 'http://localhost',
      Cookie: await adminCookie(),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('yearly URL ownership enforcement', () => {
  beforeEach(() => { database.writes = 0; process.env.APP_ORIGIN = 'http://localhost' })
  afterEach(() => { process.env = { ...originalEnv } })

  it.each([
    ['event', 10, { startDate: '2025-01-01', endDate: '2025-01-01', description: 'event' }],
    ['section', 20, { title: 'section', content: 'content' }],
    ['opinion', 30, { content: 'opinion', analysis: 'analysis' }],
  ])('rejects wrong-year %s updates before writing', async (kind, id, value) => {
    const response = await updateItem(await request('PATCH', '/api/yearly-summaries/2025', { kind, id, value }), { params: Promise.resolve({ year: '2025' }) })
    expect(response.status).toBe(404)
    expect(database.writes).toBe(0)
  })

  it.each([['event', 10], ['section', 20], ['opinion', 30]])('rejects wrong-year %s deletes before writing', async (kind, id) => {
    const response = await deleteItem(await request('DELETE', `/api/yearly-summaries/2025?kind=${kind}&id=${id}`), { params: Promise.resolve({ year: '2025' }) })
    expect(response.status).toBe(404)
    expect(database.writes).toBe(0)
  })

  it('rejects creating an opinion under a section owned by another year', async () => {
    const response = await createItem(await request('POST', '/api/yearly-summaries/2025', {
      action: 'opinion.create', sectionId: 20, opinion: { content: 'opinion', analysis: 'analysis' },
    }), { params: Promise.resolve({ year: '2025' }) })
    expect(response.status).toBe(404)
    expect(database.writes).toBe(0)
  })

  it.each(['PUT', 'DELETE'])('rejects wrong-year image %s before storage or database mutation', async (method) => {
    const response = method === 'PUT'
      ? await updateImage(await request('PUT', '/api/yearly-summaries/2025/images/40'), { params: Promise.resolve({ year: '2025', imageId: '40' }) })
      : await deleteImage(await request('DELETE', '/api/yearly-summaries/2025/images/40'), { params: Promise.resolve({ year: '2025', imageId: '40' }) })
    expect(response.status).toBe(404)
    expect(database.writes).toBe(0)
  })
})
