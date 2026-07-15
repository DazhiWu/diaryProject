// 匿名留言类型定义
export type AnonymousMessage = {
  id: number
  content: string
  createdAt: Date
}

export type SupabaseAnonymousMessage = {
  id: number
  content: string
  created_at: string
}

// 数据转换函数
function convertFromSupabase(message: SupabaseAnonymousMessage): AnonymousMessage {
  return {
    id: message.id,
    content: message.content,
    createdAt: new Date(message.created_at),
  }
}

async function messageRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error ?? 'Message request failed')
  }
  return response.json() as Promise<T>
}

/**
 * 分页获取匿名留言
 * @param page 页码（从1开始）
 * @param pageSize 每页留言数
 * @returns 分页数据对象
 */
export async function fetchAnonymousMessagesWithPagination(
  page: number = 1,
  pageSize: number = 10
): Promise<{ messages: AnonymousMessage[], totalCount: number }> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  const result = await messageRequest<{ messages: SupabaseAnonymousMessage[]; totalCount: number }>(`/api/anonymous-messages?${query}`)
  return { messages: result.messages.map(convertFromSupabase), totalCount: result.totalCount }
}

/**
 * 提交新的匿名留言
 * @param content 留言内容
 * @returns 创建的留言
 */
export async function insertAnonymousMessage(
  content: string
): Promise<AnonymousMessage> {
  const data = await messageRequest<SupabaseAnonymousMessage>('/api/anonymous-messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  return convertFromSupabase(data)
}

/**
 * 验证留言内容
 * @param content 留言内容
 * @returns 验证结果和错误信息
 */
export function validateMessageContent(content: string): { valid: boolean; error?: string } {
  // 去除首尾空格
  const trimmedContent = content.trim()
  
  // 检查是否为空
  if (!trimmedContent) {
    return { valid: false, error: '留言内容不能为空' }
  }
  
  // 检查最大长度
  if (trimmedContent.length > 2000) {
    return { valid: false, error: '留言内容不能超过2000个字符' }
  }
  
  return { valid: true }
}

/**
 * 简单的XSS防护 - 转义HTML特殊字符
 * @param html 原始内容
 * @returns 转义后的安全内容
 */
export function escapeHtml(html: string): string {
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
