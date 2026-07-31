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

  it('provides observation review controls, progress, and append-only history', () => {
    expect(source).toContain('reviewThemeTimelineObservation')
    expect(source).toContain('可供 Phase 3C 聚合')
    expect(source).toContain('保存编辑')
    expect(source).toContain("review('confirm')")
    expect(source).toContain("review('reject')")
    expect(source).toContain('查看审核历史')
  })

  it('requires terminal observation reviews before local summary regeneration', () => {
    expect(source).toContain('regenerateThemeTimelineSummary')
    expect(source).toContain('重新生成待审核摘要')
    expect(source).toContain('请先审核剩余')
    expect(source).toContain('有保留观察时，此操作只调用一次本地 Ollama')
    expect(source).toContain('全部拒绝时生成固定说明')
    expect(source).toContain('unreviewedCount > 0')
    expect(source).toContain('!localProcessingEnabled')
  })
})
