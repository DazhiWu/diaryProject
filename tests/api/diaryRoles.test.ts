import { afterEach, describe, expect, it } from 'vitest'

import { POST as analyze } from '@/app/api/ai-analysis/route'
import { POST as download } from '@/app/api/diary-download/route'
import { POST as translate } from '@/app/api/translate/route'
import { createSession } from '@/lib/server/session'

const originalEnv = { ...process.env }

function request(path: string, cookie?: string) {
  return new Request(`http://localhost${path}`, { method: 'POST', headers: { Origin: 'http://localhost', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify({ content: 'test', startDate: '2026-01-01', endDate: '2026-01-02' }) })
}

afterEach(() => { process.env = { ...originalEnv } })

describe('diary action roles', () => {
  it('denies viewer AI analysis and CSV export, and denies guest translation', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(32); process.env.SESSION_VERSION = '1'
    const viewer = await createSession('viewer')
    const cookie = `diary_session=${viewer.token}`
    expect((await analyze(request('/api/ai-analysis', cookie))).status).toBe(403)
    expect((await download(request('/api/diary-download', cookie))).status).toBe(403)
    expect((await translate(request('/api/translate'))).status).toBe(401)
  })
})
