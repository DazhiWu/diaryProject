import { describe, expect, it } from 'vitest'

import { timingSafeEqualStrings } from '@/lib/server/secretComparison'

describe('timing-safe secret comparison', () => {
  it('matches identical strings and rejects different values and lengths', async () => {
    await expect(timingSafeEqualStrings('same secret', 'same secret')).resolves.toBe(true)
    await expect(timingSafeEqualStrings('same secret', 'other secret')).resolves.toBe(false)
    await expect(timingSafeEqualStrings('short', 'a much longer secret')).resolves.toBe(false)
  })
})
