import { describe, expect, it } from 'vitest'

import {
  buildDefaultThemeTimelineThemeSpec,
  parseThemeSpecRules,
  parseThemeTimelineThemeSpec,
  parseThemeTimelineThemeSpecForTheme,
  ThemeTimelineThemeSpecError,
} from '@/lib/themeTimelineThemeSpec'

describe('theme timeline theme spec', () => {
  it('derives a structured contract from the catalog label and adds friendship boundaries', () => {
    const spec = buildDefaultThemeTimelineThemeSpec('友情:记录朋友之间的联系、帮助、共同经历、疏远和关系恢复')
    expect(spec.name).toBe('友情')
    expect(spec.definition).toContain('朋友之间')
    expect(spec.include).toEqual(expect.arrayContaining([
      expect.stringContaining('明示朋友身份'),
    ]))
    expect(spec.exclude).toEqual(expect.arrayContaining([
      expect.stringContaining('家庭、亲密关系、普通同事'),
      expect.stringContaining('机票价格、交通故障、物品损坏'),
    ]))
    expect(spec.ambiguous).toEqual([expect.stringContaining('uncertain')])
  })

  it('parses one rule per line and rejects unknown keys or duplicate rules', () => {
    expect(parseThemeSpecRules(' 第一条\n\n第二条 ')).toEqual(['第一条', '第二条'])
    expect(() => parseThemeTimelineThemeSpec({
      name: '主题',
      definition: '定义',
      include: ['直接相关', '直接相关'],
      exclude: [],
      ambiguous: [],
    })).toThrow(ThemeTimelineThemeSpecError)
    expect(() => parseThemeTimelineThemeSpec({
      name: '主题',
      definition: '定义',
      include: ['直接相关'],
      exclude: [],
      ambiguous: [],
      extra: true,
    })).toThrow(ThemeTimelineThemeSpecError)
  })

  it('rejects a contract whose frozen name or definition does not match the displayed theme', () => {
    expect(() => parseThemeTimelineThemeSpecForTheme('友情:朋友之间的联系', {
      name: '旅行',
      definition: '行程与价格',
      include: ['机票价格'],
      exclude: [],
      ambiguous: [],
    })).toThrow(ThemeTimelineThemeSpecError)
  })
})
