import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const source = readFileSync(
  path.resolve(process.cwd(), 'components/theme-timeline.tsx'),
  'utf8',
)

describe('theme timeline numeric input contract', () => {
  it('reads valueAsNumber before entering a React state updater', () => {
    expect(source).not.toMatch(
      /setGenerationConfig\(\(current\)\s*=>[\s\S]{0,180}event\.currentTarget\.valueAsNumber/,
    )
    expect(source.match(/setGenerationNumber\('[^']+', event\.currentTarget\.valueAsNumber\)/g))
      .toHaveLength(6)
  })
})

describe('theme timeline observation paging contract', () => {
  it('renders only the selected observation with bounded previous and next controls', () => {
    expect(source).toContain('function ObservationPager')
    expect(source).toContain('observations[observationIndex] ?? observations[0]')
    expect(source).toContain('← 上一篇')
    expect(source).toContain('下一篇 →')
    expect(source).not.toContain('selectedRun.observations.map')
  })
})
