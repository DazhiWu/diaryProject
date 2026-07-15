import { describe, expect, it } from 'vitest'

import {
  dateRangeFields,
  exactDateField,
  readJsonBody,
  stringArrayField,
  stringField,
} from '@/lib/server/requestLimits'

describe('server request limits', () => {
  it('rejects declared and streamed bodies over the byte limit', async () => {
    await expect(readJsonBody(new Request('http://localhost', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': '100' }, body: '{}',
    }), 10)).rejects.toMatchObject({ status: 413 })
    await expect(readJsonBody(new Request('http://localhost', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: '中文' }),
    }), 8)).rejects.toMatchObject({ status: 413 })
  })

  it('parses bounded JSON and rejects malformed JSON', async () => {
    await expect(readJsonBody(new Request('http://localhost', { method: 'POST', body: '{"ok":true}' }), 32)).resolves.toEqual({ ok: true })
    await expect(readJsonBody(new Request('http://localhost', { method: 'POST', body: '{' }), 32)).rejects.toMatchObject({ status: 400 })
  })

  it('validates dates, ranges, strings, and arrays', () => {
    expect(exactDateField('2026-02-28', 'date')).toBe('2026-02-28')
    expect(() => exactDateField('2026-02-30', 'date')).toThrow()
    expect(dateRangeFields('2026-01-01', '2026-01-02')).toEqual({ start: '2026-01-01', end: '2026-01-02' })
    expect(() => dateRangeFields('2026-01-02', '2026-01-01')).toThrow()
    expect(stringField(' x ', 'value', { min: 1, max: 1, trim: true })).toBe('x')
    expect(() => stringArrayField(['a', 'b'], 'items', 1)).toThrow()
  })
})
