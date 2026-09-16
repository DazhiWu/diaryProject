import { afterEach, describe, expect, it, vi } from 'vitest'
import { runWorkersAiWithDeadline } from '@/lib/server/workersAi'
import { workersAiFailureDetails } from '@/lib/server/workersAiFailure'

afterEach(() => vi.useRealTimers())
const ai = {} as CloudflareEnv['AI']
describe('Workers AI deadlines', () => {
  it('bounds a stalled binding and does not run inference when the late binding resolves', async () => {
    vi.useFakeTimers()
    let resolve!: (value: CloudflareEnv['AI']) => void
    const binding = new Promise<CloudflareEnv['AI']>((done) => { resolve = done })
    const run = vi.fn()
    const pending = runWorkersAiWithDeadline(() => binding, run, 20000)
    const check = expect(pending).rejects.toMatchObject({ reason: 'timeout', stage: 'binding', elapsedMs: 20000 })
    await vi.advanceTimersByTimeAsync(20000)
    await check
    resolve(ai)
    await vi.advanceTimersByTimeAsync(1)
    expect(run).not.toHaveBeenCalled()
  })
  it('aborts a hung inference, including a runner that ignores cancellation', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    const pending = runWorkersAiWithDeadline(async () => ai, async (_ai, nextSignal) => {
      signal = nextSignal
      return new Promise(() => {})
    }, 8000)
    const check = expect(pending).rejects.toMatchObject({ reason: 'timeout', stage: 'inference' })
    await vi.advanceTimersByTimeAsync(8000)
    await check
    expect(signal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('cleans up deadlines on success and preserves Access classification', async () => {
    vi.useFakeTimers()
    await expect(runWorkersAiWithDeadline(async () => ai, async () => 42, 20000)).resolves.toBe(42)
    await expect(runWorkersAiWithDeadline(async () => { throw new Error('domain is behind Cloudflare Access, no Access Service Token') }, vi.fn(), 20000))
      .rejects.toMatchObject({ reason: 'access', stage: 'binding' })
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('safe failure classification', () => {
  it.each([
    [Object.assign(new Error('private text'), { status: 429 }), 'rate-limit'],
    [Object.assign(new Error('private text'), { status: 401 }), 'auth'],
    [new Error('fetch failed', { cause: { code: 'ECONNRESET' } }), 'network'],
    [new Error('fetch failed', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }), 'timeout'],
    [new Error('Cloudflare Access: secret=private'), 'access'],
    [new Error('embedding has an unexpected shape'), 'invalid-response'],
  ])('classifies without leaking raw content', (error, reason) => {
    expect(workersAiFailureDetails(error)).toMatchObject({ reason })
    expect(JSON.stringify(workersAiFailureDetails(error))).not.toContain('private')
  })
})
