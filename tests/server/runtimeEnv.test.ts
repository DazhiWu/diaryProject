import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCloudflareContext: vi.fn(),
}))

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: mocks.getCloudflareContext,
}))

import { getRuntimeEnvValue } from '@/lib/runtimeEnv'

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
  vi.clearAllMocks()
})

describe('runtime environment lookup', () => {
  it('uses local process values without opening a Cloudflare remote binding', async () => {
    process.env = { ...process.env, NODE_ENV: 'development' }
    process.env.RUNTIME_ENV_TEST_VALUE = 'local-value'

    await expect(getRuntimeEnvValue('RUNTIME_ENV_TEST_VALUE')).resolves.toBe('local-value')
    expect(mocks.getCloudflareContext).not.toHaveBeenCalled()
  })

  it('falls back to Cloudflare bindings when a local value is absent', async () => {
    process.env = { ...process.env, NODE_ENV: 'development' }
    delete process.env.RUNTIME_ENV_TEST_VALUE
    mocks.getCloudflareContext.mockResolvedValue({
      env: { RUNTIME_ENV_TEST_VALUE: 'binding-value' },
    })

    await expect(getRuntimeEnvValue('RUNTIME_ENV_TEST_VALUE')).resolves.toBe('binding-value')
    expect(mocks.getCloudflareContext).toHaveBeenCalledOnce()
  })

  it('keeps Cloudflare bindings authoritative in production', async () => {
    process.env = { ...process.env, NODE_ENV: 'production' }
    process.env.RUNTIME_ENV_TEST_VALUE = 'process-value'
    mocks.getCloudflareContext.mockResolvedValue({
      env: { RUNTIME_ENV_TEST_VALUE: 'binding-value' },
    })

    await expect(getRuntimeEnvValue('RUNTIME_ENV_TEST_VALUE')).resolves.toBe('binding-value')
    expect(mocks.getCloudflareContext).toHaveBeenCalledOnce()
  })
})
