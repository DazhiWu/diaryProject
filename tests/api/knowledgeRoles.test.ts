import { afterEach, describe, expect, it } from 'vitest'

import { GET as indexStatus, POST as indexAction } from '@/app/api/knowledge/index/route'
import { POST as knowledgeSearch } from '@/app/api/knowledge/search/route'
import { createSession } from '@/lib/server/session'

const originalEnv = { ...process.env }

function request(path: string, body: unknown, cookie?: string) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { Origin: 'http://localhost', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  })
}

afterEach(() => { process.env = { ...originalEnv } })

describe('knowledge base roles and request validation', () => {
  it('keeps index status, indexing, and search admin-only', async () => {
    process.env.SESSION_SECRET = 'k'.repeat(32)
    process.env.SESSION_VERSION = '1'
    const viewer = await createSession('viewer')
    const cookie = `diary_session=${viewer.token}`

    expect((await indexStatus(new Request('http://localhost/api/knowledge/index', { headers: { Cookie: cookie } }))).status).toBe(403)
    expect((await indexAction(request('/api/knowledge/index', { action: 'sync' }, cookie))).status).toBe(403)
    expect((await knowledgeSearch(request('/api/knowledge/search', { query: '过去的目标' }, cookie))).status).toBe(403)
    expect((await knowledgeSearch(request('/api/knowledge/search', { query: '过去的目标' }))).status).toBe(401)
  })

  it('rejects invalid admin actions and date ranges before database or model calls', async () => {
    process.env.SESSION_SECRET = 'k'.repeat(32)
    process.env.SESSION_VERSION = '1'
    const admin = await createSession('admin')
    const cookie = `diary_session=${admin.token}`

    expect((await indexAction(request('/api/knowledge/index', { action: 'unknown' }, cookie))).status).toBe(400)
    expect((await indexAction(request('/api/knowledge/index', { action: 'sync', consecutiveFailures: 3 }, cookie))).status).toBe(400)
    expect((await knowledgeSearch(request('/api/knowledge/search', { query: '目标', startDate: '2026-07-20', endDate: '2026-07-19' }, cookie))).status).toBe(400)
  })
})
