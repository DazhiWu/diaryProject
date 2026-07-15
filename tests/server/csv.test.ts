import { describe, expect, it } from 'vitest'

import { generateCSV } from '@/app/api/diary-download/route'

describe('diary CSV generation', () => {
  it('escapes quotes and line breaks and neutralizes spreadsheet formulas', () => {
    const csv = generateCSV([
      { date: new Date('2026-07-15T00:00:00Z'), content: '=HYPERLINK("https://example.com")\n下一行' },
    ])
    expect(csv).toContain('"\'=HYPERLINK(""https://example.com"")\\n下一行"')
  })

  it('has a UTF-8 byte length greater than its JavaScript string length for Chinese text', () => {
    const csv = generateCSV([{ date: new Date('2026-07-15T00:00:00Z'), content: '中文' }])
    expect(new TextEncoder().encode(csv).byteLength).toBeGreaterThan(csv.length)
  })
})
