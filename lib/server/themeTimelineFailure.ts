import 'server-only'

export type ThemeTimelineFailureCategory = 'invalid_input' | 'invalid_response' | 'legacy'

export type ThemeTimelineFailureCode =
  | 'duplicate_evidence_indexes'
  | 'empty_model_content'
  | 'invalid_classification'
  | 'invalid_evidence_indexes'
  | 'invalid_json'
  | 'invalid_object'
  | 'invalid_relevant_flag'
  | 'invalid_statement'
  | 'invalid_summary_classification'
  | 'invalid_summary_observation_ids'
  | 'invalid_summary_statement'
  | 'irrelevant_payload_not_empty'
  | 'ollama_payload_invalid'
  | 'prompt_too_large'
  | 'unknown_evidence_index'
  | 'unknown'

export type ThemeTimelineDiagnosticExcerpt = {
  text: string
  originalChars: number
  truncated: boolean
}

export type StoredThemeTimelineFailure = {
  category: ThemeTimelineFailureCategory
  code: ThemeTimelineFailureCode | null
  status: number | null
  diary: ThemeTimelineDiagnosticExcerpt | null
  modelOutput: ThemeTimelineDiagnosticExcerpt | null
}

const STORED_MESSAGE_MAX_CHARS = 980
const INITIAL_EXCERPT_MAX_CHARS = 240

function safeStatus(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined
}

function safeCode(value: unknown): ThemeTimelineFailureCode | undefined {
  const allowed: ReadonlySet<string> = new Set<ThemeTimelineFailureCode>([
    'duplicate_evidence_indexes',
    'empty_model_content',
    'invalid_classification',
    'invalid_evidence_indexes',
    'invalid_json',
    'invalid_object',
    'invalid_relevant_flag',
    'invalid_statement',
    'invalid_summary_classification',
    'invalid_summary_observation_ids',
    'invalid_summary_statement',
    'irrelevant_payload_not_empty',
    'ollama_payload_invalid',
    'prompt_too_large',
    'unknown_evidence_index',
    'unknown',
  ])
  return typeof value === 'string' && allowed.has(value)
    ? value as ThemeTimelineFailureCode
    : undefined
}

function redactCredentials(value: string): string {
  return value
    .replace(/bearer\s+[a-z0-9._~+/=-]+/giu, 'Bearer [REDACTED]')
    .replace(/((?:api[_-]?key|authorization|access[_-]?token|secret)["']?\s*[=:]\s*["']?)[^"'\s,;}]+/giu, '$1[REDACTED]')
    .replace(/\bsk-[a-z0-9_-]{12,}\b/giu, '[REDACTED_API_KEY]')
}

function excerpt(value: string, maximumChars: number): ThemeTimelineDiagnosticExcerpt {
  const redacted = redactCredentials(value)
  return {
    text: redacted.slice(0, maximumChars),
    originalChars: redacted.length,
    truncated: redacted.length > maximumChars,
  }
}

function diagnosticObject(input: {
  category: Exclude<ThemeTimelineFailureCategory, 'legacy'>
  code: ThemeTimelineFailureCode
  status?: number
  diaryContent?: string
  modelOutput?: string
}, maximumExcerptChars: number) {
  const status = safeStatus(input.status)
  return {
    category: input.category,
    code: input.code,
    ...(status === undefined ? {} : { status }),
    ...(input.diaryContent === undefined
      ? {}
      : { diary: excerpt(input.diaryContent, maximumExcerptChars) }),
    ...(input.modelOutput === undefined
      ? {}
      : { modelOutput: excerpt(input.modelOutput, maximumExcerptChars) }),
  }
}

export function serializeThemeTimelineFailure(input: {
  category: Exclude<ThemeTimelineFailureCategory, 'legacy'>
  code: ThemeTimelineFailureCode
  status?: number
  diaryContent?: string
  modelOutput?: string
}): string {
  for (const maximum of [INITIAL_EXCERPT_MAX_CHARS, 120, 40, 0]) {
    const stored = JSON.stringify(diagnosticObject(input, maximum))
    if (stored.length <= STORED_MESSAGE_MAX_CHARS) return stored
  }
  return JSON.stringify({ category: input.category, code: input.code })
}

function parsedExcerpt(value: unknown): ThemeTimelineDiagnosticExcerpt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as { text?: unknown; originalChars?: unknown; truncated?: unknown }
  if (
    typeof candidate.text !== 'string'
    || typeof candidate.originalChars !== 'number'
    || !Number.isSafeInteger(candidate.originalChars)
    || candidate.originalChars < candidate.text.length
    || typeof candidate.truncated !== 'boolean'
  ) {
    return null
  }
  return {
    text: candidate.text,
    originalChars: candidate.originalChars,
    truncated: candidate.truncated,
  }
}

export function parseStoredThemeTimelineFailure(value: string | null): StoredThemeTimelineFailure {
  if (!value) {
    return {
      category: 'legacy',
      code: null,
      status: null,
      diary: null,
      modelOutput: null,
    }
  }
  try {
    const parsed = JSON.parse(value) as {
      category?: unknown
      code?: unknown
      status?: unknown
      diary?: unknown
      modelOutput?: unknown
    }
    if (parsed.category !== 'invalid_input' && parsed.category !== 'invalid_response') {
      throw new Error('Legacy theme timeline failure')
    }
    return {
      category: parsed.category,
      code: safeCode(parsed.code) ?? null,
      status: safeStatus(parsed.status) ?? null,
      diary: parsedExcerpt(parsed.diary),
      modelOutput: parsedExcerpt(parsed.modelOutput),
    }
  } catch {
    return {
      category: 'legacy',
      code: null,
      status: null,
      diary: null,
      modelOutput: null,
    }
  }
}
