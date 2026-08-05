export const THEME_TIMELINE_THEME_SPEC_LIMITS = {
  nameLength: 120,
  definitionLength: 1_000,
  ruleLength: 400,
  maxRulesPerGroup: 12,
} as const

export type ThemeTimelineThemeSpec = {
  name: string
  definition: string
  include: string[]
  exclude: string[]
  ambiguous: string[]
}

export class ThemeTimelineThemeSpecError extends Error {
  constructor() {
    super('Invalid theme timeline theme spec')
    this.name = 'ThemeTimelineThemeSpecError'
  }
}

function recordValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ThemeTimelineThemeSpecError()
  }
  return value as Record<string, unknown>
}

function boundedText(value: unknown, maximum: number): string {
  if (typeof value !== 'string') throw new ThemeTimelineThemeSpecError()
  const parsed = value.trim()
  if (!parsed || parsed.length > maximum) throw new ThemeTimelineThemeSpecError()
  return parsed
}

function ruleList(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > THEME_TIMELINE_THEME_SPEC_LIMITS.maxRulesPerGroup) {
    throw new ThemeTimelineThemeSpecError()
  }
  const parsed = value.map((item) => boundedText(item, THEME_TIMELINE_THEME_SPEC_LIMITS.ruleLength))
  if (new Set(parsed).size !== parsed.length) throw new ThemeTimelineThemeSpecError()
  return parsed
}

export function parseThemeTimelineThemeSpec(value: unknown): ThemeTimelineThemeSpec {
  const input = recordValue(value)
  const allowedKeys = new Set(['name', 'definition', 'include', 'exclude', 'ambiguous'])
  if (Object.keys(input).length !== allowedKeys.size
    || Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw new ThemeTimelineThemeSpecError()
  }
  const include = ruleList(input.include)
  if (include.length === 0) throw new ThemeTimelineThemeSpecError()
  return {
    name: boundedText(input.name, THEME_TIMELINE_THEME_SPEC_LIMITS.nameLength),
    definition: boundedText(input.definition, THEME_TIMELINE_THEME_SPEC_LIMITS.definitionLength),
    include,
    exclude: ruleList(input.exclude),
    ambiguous: ruleList(input.ambiguous),
  }
}

function splitThemeLabel(theme: string): { name: string; definition: string } {
  const trimmed = theme.trim()
  const separator = trimmed.search(/[:：]/u)
  if (separator < 1) return { name: trimmed, definition: trimmed }
  return {
    name: trimmed.slice(0, separator).trim(),
    definition: trimmed.slice(separator + 1).trim() || trimmed,
  }
}

export function buildDefaultThemeTimelineThemeSpec(theme: string): ThemeTimelineThemeSpec {
  const { name, definition } = splitThemeLabel(theme)
  const friendship = /友情|友谊|朋友/u.test(`${name} ${definition}`)
  return parseThemeTimelineThemeSpec({
    name,
    definition,
    include: [
      definition,
      ...(friendship
        ? ['原文明示朋友身份，并描述彼此联系、帮助、共同安排、共同经历、疏远或关系恢复']
        : []),
    ],
    exclude: [
      '仅与主题内容同时出现在同一篇日记、但本身不描述主题的事件',
      '依赖原文没有明确说明的人物关系、动机、因果或结果的解释',
      '属于相邻主题、但不直接满足本主题定义的内容',
      ...(friendship
        ? [
            '纯家庭、亲密关系、普通同事、老师、教练或室友互动；除非原文明示该人物同时是朋友',
            '不得把机票价格、交通故障、物品损坏、工作消费或个人对事件成败的情绪当作友情证据；但朋友之间明确联系、帮助、共同安排或共同经历本身仍属于友情',
          ]
        : []),
    ],
    ambiguous: [
      '人物关系、事件归属或主题边界无法从原文直接确定时，必须标记为 uncertain',
    ],
  })
}

export function parseThemeTimelineThemeSpecForTheme(
  theme: string,
  value: unknown,
): ThemeTimelineThemeSpec {
  const parsed = parseThemeTimelineThemeSpec(value)
  const expected = splitThemeLabel(theme)
  if (parsed.name !== expected.name || parsed.definition !== expected.definition) {
    throw new ThemeTimelineThemeSpecError()
  }
  return parsed
}

export function parseThemeSpecRules(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter(Boolean)
}
