import { supabase } from './supabaseClient'

// 匿名留言类型定义
export type AnonymousMessage = {
  id: number
  content: string
  createdAt: Date
  userAgent?: string | null
  ipAddress?: string | null
}

export type SupabaseAnonymousMessage = {
  id: number
  content: string
  created_at: string
  user_agent?: string | null
  ip_address?: string | null
}

// 数据转换函数
function convertFromSupabase(message: SupabaseAnonymousMessage): AnonymousMessage {
  return {
    id: message.id,
    content: message.content,
    createdAt: new Date(message.created_at),
    userAgent: message.user_agent,
    ipAddress: message.ip_address,
  }
}

function convertToSupabase(message: Partial<AnonymousMessage>): Partial<SupabaseAnonymousMessage> {
  const result: Partial<SupabaseAnonymousMessage> = {}
  
  if (message.content) {
    result.content = message.content
  }
  
  if (message.userAgent) {
    result.user_agent = message.userAgent
  }
  
  if (message.ipAddress) {
    result.ip_address = message.ipAddress
  }
  
  return result
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
  try {
    const offset = (page - 1) * pageSize
    
    const { data, error, count } = await supabase
      .from('anonymous_messages')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)
    
    if (error) {
      console.error('获取匿名留言失败:', error)
      throw error
    }
    
    return {
      messages: data ? data.map(convertFromSupabase) : [],
      totalCount: count || 0,
    }
  } catch (error) {
    console.error('获取匿名留言失败:', error)
    throw error
  }
}

/**
 * 提交新的匿名留言
 * @param content 留言内容
 * @returns 创建的留言
 */
export async function insertAnonymousMessage(
  content: string
): Promise<AnonymousMessage> {
  try {
    // 收集用户信息（可选，用于反垃圾）
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null
    
    const newMessage = {
      content: content,
      user_agent: userAgent,
    }
    
    const { data, error } = await supabase
      .from('anonymous_messages')
      .insert([newMessage])
      .select('*')
      .single()
    
    if (error) {
      console.error('提交匿名留言失败:', error)
      throw error
    }
    
    return convertFromSupabase(data)
  } catch (error) {
    console.error('提交匿名留言失败:', error)
    throw error
  }
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
  
  // 检查最小长度
  if (trimmedContent.length < 2) {
    return { valid: false, error: '留言内容至少需要2个字符' }
  }
  
  // 检查最大长度
  if (trimmedContent.length > 1000) {
    return { valid: false, error: '留言内容不能超过1000个字符' }
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
