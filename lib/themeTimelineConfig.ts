export const THEME_TIMELINE_CONFIG_LIMITS = {
  modelLength: 120,
  minNumCtx: 2_048,
  maxNumCtx: 262_144,
  minOutputTokens: 64,
  maxOutputTokens: 16_384,
  maxSystemPromptLength: 8_000,
} as const

export const DEFAULT_THEME_EXTRACTION_SYSTEM_PROMPT = `你是一个谨慎的私人日记主题分析器。只提取与指定主题直接相关、可以由原文证据支持的观察；证据不足时应判断为不相关。避免过度解读，不要把有限推断写成用户已经确认的观点。`

export const DEFAULT_THEME_SUMMARY_SYSTEM_PROMPT = `你是一个谨慎的私人日记主题时间线总结器。只综合已经提取的观察，突出时间变化和反复出现的模式；明确区分记录、概括与有限推断，不要把待审核摘要表述成用户已经确认的事实。`

export type ThemeTimelineGenerationConfig = {
  model: string
  numCtx: number
  temperature: number
  topP: number
  topK: number
  thinking: boolean
  extractionMaxTokens: number
  summaryMaxTokens: number
  extractionSystemPrompt: string
  summarySystemPrompt: string
}

export const DEFAULT_THEME_TIMELINE_GENERATION_CONFIG: ThemeTimelineGenerationConfig = {
  model: 'qwen3.5:4b',
  numCtx: 32_768,
  temperature: 0.1,
  topP: 0.9,
  topK: 20,
  thinking: false,
  extractionMaxTokens: 1_024,
  summaryMaxTokens: 2_048,
  extractionSystemPrompt: DEFAULT_THEME_EXTRACTION_SYSTEM_PROMPT,
  summarySystemPrompt: DEFAULT_THEME_SUMMARY_SYSTEM_PROMPT,
}

export class ThemeTimelineConfigError extends Error {
  constructor() {
    super('Invalid theme timeline generation config')
    this.name = 'ThemeTimelineConfigError'
  }
}

function recordValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ThemeTimelineConfigError()
  return value as Record<string, unknown>
}

function finiteNumber(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new ThemeTimelineConfigError()
  }
  return value
}

function integer(value: unknown, minimum: number, maximum: number): number {
  const parsed = finiteNumber(value, minimum, maximum)
  if (!Number.isSafeInteger(parsed)) throw new ThemeTimelineConfigError()
  return parsed
}

function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string') throw new ThemeTimelineConfigError()
  const parsed = value.trim()
  if (!parsed || parsed.length > maximum) throw new ThemeTimelineConfigError()
  return parsed
}

export function parseThemeTimelineGenerationConfig(value: unknown): ThemeTimelineGenerationConfig {
  const input = recordValue(value)
  const model = text(input.model, THEME_TIMELINE_CONFIG_LIMITS.modelLength)
  if (!/^[a-z0-9][a-z0-9._/:+-]*$/iu.test(model)) throw new ThemeTimelineConfigError()

  if (typeof input.thinking !== 'boolean') throw new ThemeTimelineConfigError()

  return {
    model,
    numCtx: integer(input.numCtx, THEME_TIMELINE_CONFIG_LIMITS.minNumCtx, THEME_TIMELINE_CONFIG_LIMITS.maxNumCtx),
    temperature: finiteNumber(input.temperature, 0, 2),
    topP: finiteNumber(input.topP, 0, 1),
    topK: integer(input.topK, 0, 200),
    thinking: input.thinking,
    extractionMaxTokens: integer(
      input.extractionMaxTokens,
      THEME_TIMELINE_CONFIG_LIMITS.minOutputTokens,
      THEME_TIMELINE_CONFIG_LIMITS.maxOutputTokens,
    ),
    summaryMaxTokens: integer(
      input.summaryMaxTokens,
      THEME_TIMELINE_CONFIG_LIMITS.minOutputTokens,
      THEME_TIMELINE_CONFIG_LIMITS.maxOutputTokens,
    ),
    extractionSystemPrompt: text(
      input.extractionSystemPrompt,
      THEME_TIMELINE_CONFIG_LIMITS.maxSystemPromptLength,
    ),
    summarySystemPrompt: text(
      input.summarySystemPrompt,
      THEME_TIMELINE_CONFIG_LIMITS.maxSystemPromptLength,
    ),
  }
}
