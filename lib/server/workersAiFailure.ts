import 'server-only'

export type WorkersAiFailureReason = 'access' | 'auth' | 'rate-limit' | 'timeout' | 'network' | 'upstream' | 'invalid-response' | 'unknown'
export type WorkersAiStage = 'binding' | 'inference' | 'response'

export class WorkersAiCallError extends Error {
  constructor(
    public readonly reason: WorkersAiFailureReason,
    public readonly stage: WorkersAiStage,
    public readonly elapsedMs: number,
    public readonly status?: number,
  ) {
    super(`Workers AI ${stage} ${reason}`)
    this.name = 'WorkersAiCallError'
  }
}

/** Classify without returning raw upstream messages, credentials, URLs, or input text. */
export function workersAiFailureDetails(error: unknown): {
  reason: WorkersAiFailureReason; stage?: WorkersAiStage; elapsedMs?: number; status?: number
} {
  if (error instanceof WorkersAiCallError) return {
    reason: error.reason, stage: error.stage, elapsedMs: error.elapsedMs, status: error.status,
  }
  const row = typeof error === 'object' && error !== null ? error as Record<string, unknown> : {}
  const cause = typeof row.cause === 'object' && row.cause !== null ? row.cause as Record<string, unknown> : {}
  const statusValue = row.status ?? row.statusCode
  const status = typeof statusValue === 'number' && Number.isInteger(statusValue) && statusValue >= 100 && statusValue <= 599 ? statusValue : undefined
  const message = typeof row.message === 'string' ? row.message : ''
  const code = typeof cause.code === 'string' ? cause.code : typeof row.code === 'string' ? row.code : ''
  let reason: WorkersAiFailureReason = 'unknown'
  if (/cloudflare access|access service token/i.test(message)) reason = 'access'
  else if (status === 401 || status === 403) reason = 'auth'
  else if (status === 429 || /rate limit|too many requests|quota exceeded/i.test(message)) reason = 'rate-limit'
  else if (row.name === 'TimeoutError' || row.name === 'AbortError' || /timeout|timed out/i.test(message) || /TIMEOUT|TIMEDOUT/.test(code)) reason = 'timeout'
  else if (/fetch failed|network|connection|socket|ECONN|ENOTFOUND|EAI_AGAIN/i.test(`${message} ${code}`)) reason = 'network'
  else if (status && status >= 500) reason = 'upstream'
  else if (/unexpected shape|zero magnitude|no valid results/.test(message)) reason = 'invalid-response'
  return { reason, status }
}

export function workersAiUserMessage(reason: WorkersAiFailureReason): string {
  switch (reason) {
    case 'access': return '本地 Cloudflare AI 开发连接被 Access 拦截，请先完成开发环境的 Cloudflare Access 认证后重试。'
    case 'auth': return 'Cloudflare AI 访问认证失败，请检查开发登录状态或 AI 绑定权限。'
    case 'rate-limit': return 'Cloudflare AI 暂时限流或额度不足，请稍后重试。'
    case 'timeout': return '日记检索的 Cloudflare AI 请求超时，请检查网络或开发代理后重试。'
    case 'network': return '无法连接 Cloudflare AI，请检查网络或本地开发代理后重试。'
    default: return '日记检索服务暂时不可用，请稍后重试。'
  }
}
