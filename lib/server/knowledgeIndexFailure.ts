import 'server-only'

export type KnowledgeIndexFailureCategory =
  | 'chunk_replace_failed'
  | 'consecutive_failure_stop'
  | 'embedding_auth'
  | 'embedding_network'
  | 'embedding_rate_limit'
  | 'embedding_request'
  | 'embedding_response_count'
  | 'embedding_response_shape'
  | 'embedding_timeout'
  | 'embedding_upstream'
  | 'job_completion_failed'
  | 'source_not_found'
  | 'source_query_failed'
  | 'unexpected'

type FailureDetails = {
  category: KnowledgeIndexFailureCategory
  status?: number
  code?: string
}

const UPSTREAM_DETAIL_MAX_CHARS = 1_500
const DIARY_CONTENT_MAX_CHARS = 3_000

type DiagnosticExcerpt = {
  text: string
  originalChars: number
  truncated: boolean
}

export class KnowledgeIndexStepError extends Error {
  readonly details: FailureDetails

  constructor(details: FailureDetails) {
    super(details.category)
    this.name = 'KnowledgeIndexStepError'
    this.details = details
  }
}

function safeStatus(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599 ? value : undefined
}

function safeCode(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z0-9_.-]{1,64}$/iu.test(value) ? value : undefined
}

function diagnosticText(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (value === undefined || value === null) return undefined
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}

function redactCredentials(value: string): string {
  return value
    .replace(/bearer\s+[a-z0-9._~+/=-]+/giu, 'Bearer [REDACTED]')
    .replace(/((?:api[_-]?key|authorization|access[_-]?token|secret)["']?\s*[=:]\s*["']?)[^"'\s,;}]+/giu, '$1[REDACTED]')
    .replace(/\bsk-[a-z0-9_-]{12,}\b/giu, '[REDACTED_API_KEY]')
}

function excerpt(value: string, maximumChars: number): DiagnosticExcerpt {
  const redacted = redactCredentials(value)
  return {
    text: redacted.slice(0, maximumChars),
    originalChars: redacted.length,
    truncated: redacted.length > maximumChars,
  }
}

export function sanitizeKnowledgeIndexFailure(error: unknown, diaryContent?: string): FailureDetails & { storedMessage: string } {
  let category: KnowledgeIndexFailureCategory = 'unexpected'
  let status: number | undefined
  let code: string | undefined
  let upstreamDetail: string | undefined

  if (error instanceof KnowledgeIndexStepError) {
    ({ category, status, code } = error.details)
  } else if (error && typeof error === 'object') {
    const value = error as {
      name?: unknown
      message?: unknown
      status?: unknown
      code?: unknown
      error?: unknown
      body?: unknown
      response?: { status?: unknown; data?: unknown }
    }
    const name = typeof value.name === 'string' ? value.name : ''
    const message = typeof value.message === 'string' ? value.message : ''
    status = safeStatus(value.status) ?? safeStatus(value.response?.status)
    code = safeCode(value.code)
    upstreamDetail = [message, diagnosticText(value.error), diagnosticText(value.body), diagnosticText(value.response?.data)].filter(Boolean).join('\n') || undefined

    if (message === 'Embedding response count does not match the request') category = 'embedding_response_count'
    else if (message === 'Embedding response has an unexpected shape') category = 'embedding_response_shape'
    else if (status === 429) category = 'embedding_rate_limit'
    else if (status === 401 || status === 403) category = 'embedding_auth'
    else if (status !== undefined && status >= 500) category = 'embedding_upstream'
    else if (status !== undefined && status >= 400) category = 'embedding_request'
    else if (/timeout|abort/iu.test(name) || /timed?\s*out/iu.test(message)) category = 'embedding_timeout'
    else if (/connection|network|fetch/iu.test(`${name} ${message}`) || ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND'].includes(code ?? '')) category = 'embedding_network'
  }

  status = safeStatus(status)
  code = safeCode(code)
  const storedMessage = JSON.stringify({
    category,
    ...(status === undefined ? {} : { status }),
    ...(code === undefined ? {} : { code }),
    ...(upstreamDetail === undefined ? {} : { upstream: excerpt(upstreamDetail, UPSTREAM_DETAIL_MAX_CHARS) }),
    ...(diaryContent === undefined ? {} : { diary: excerpt(diaryContent, DIARY_CONTENT_MAX_CHARS) }),
  })
  return { category, status, code, storedMessage }
}
