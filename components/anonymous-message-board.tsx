"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { MessageSquareIcon, SendIcon, RefreshCwIcon } from "@/components/icons"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  fetchAnonymousMessagesWithPagination,
  insertAnonymousMessage,
  validateMessageContent,
  escapeHtml,
  type AnonymousMessage,
} from "@/lib/messageBoardApi"

const MESSAGES_PER_PAGE = 10

// 格式化日期时间
function formatDateTime(date: Date): string {
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// 单个留言卡片组件
function MessageCard({ message, index }: { message: AnonymousMessage; index: number }) {
  return (
    <Card
      className={cn(
        "transition-all duration-500 ease-out",
        "hover:shadow-lg hover:-translate-y-1"
      )}
      style={{
        animationDelay: `${index * 100}ms`,
      }}
    >
      <CardContent className="pt-6">
        <div className="space-y-3">
          <div
            className="text-foreground whitespace-pre-wrap break-words"
            dangerouslySetInnerHTML={{ __html: escapeHtml(message.content) }}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
            <span className="flex items-center gap-1">
              <MessageSquareIcon className="h-3 w-3" />
              留言 #{message.id}
            </span>
            <span>{formatDateTime(message.createdAt)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// 留言输入组件
function MessageInput({
  onSubmitSuccess,
}: {
  onSubmitSuccess: () => void
}) {
  const [content, setContent] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = async () => {
    // 验证内容
    const validation = validateMessageContent(content)
    if (!validation.valid) {
      toast.error(validation.error)
      return
    }

    setIsSubmitting(true)
    try {
      await insertAnonymousMessage(content.trim())
      toast.success("留言提交成功！")
      setContent("")
      onSubmitSuccess()
    } catch (error) {
      console.error("提交留言失败:", error)
      toast.error("提交失败，请稍后重试")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquareIcon className="h-5 w-5 text-primary" />
          写下你的留言
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="在这里输入你的留言... (按 Enter 提交，Shift+Enter 换行)"
            className="min-h-[120px] resize-none"
            disabled={isSubmitting}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {content.length}/1000 字符
            </span>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || content.trim().length < 2}
              className="gap-2"
            >
              {isSubmitting ? (
                <>
                  <Spinner className="h-4 w-4" />
                  提交中...
                </>
              ) : (
                <>
                  <SendIcon className="h-4 w-4" />
                  提交留言
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// 分页组件
function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  isLoading,
}: {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  isLoading: boolean
}) {
  if (totalPages <= 1) return null

  const pages = []
  const maxVisiblePages = 5
  let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2))
  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1)

  if (endPage - startPage + 1 < maxVisiblePages) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1)
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i)
  }

  return (
    <div className="flex items-center justify-center gap-2 mt-8">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1 || isLoading}
      >
        上一页
      </Button>

      {startPage > 1 && (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(1)}
            disabled={isLoading}
          >
            1
          </Button>
          {startPage > 2 && (
            <span className="text-muted-foreground px-2">...</span>
          )}
        </>
      )}

      {pages.map((page) => (
        <Button
          key={page}
          variant={page === currentPage ? "default" : "outline"}
          size="sm"
          onClick={() => onPageChange(page)}
          disabled={isLoading}
        >
          {page}
        </Button>
      ))}

      {endPage < totalPages && (
        <>
          {endPage < totalPages - 1 && (
            <span className="text-muted-foreground px-2">...</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(totalPages)}
            disabled={isLoading}
          >
            {totalPages}
          </Button>
        </>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages || isLoading}
      >
        下一页
      </Button>
    </div>
  )
}

// 主组件
export function AnonymousMessageBoard() {
  const [messages, setMessages] = useState<AnonymousMessage[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isVisible, setIsVisible] = useState(false)

  // 加载留言
  const loadMessages = async (page: number = 1) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await fetchAnonymousMessagesWithPagination(page, MESSAGES_PER_PAGE)
      setMessages(result.messages)
      setTotalPages(Math.ceil(result.totalCount / MESSAGES_PER_PAGE))
      setCurrentPage(page)
    } catch (err) {
      console.error("加载留言失败:", err)
      setError("加载留言失败，请稍后重试")
      toast.error("加载留言失败")
    } finally {
      setIsLoading(false)
    }
  }

  // 提交成功后刷新
  const handleSubmitSuccess = () => {
    loadMessages(1)
  }

  // 切换页面
  const handlePageChange = (page: number) => {
    if (page !== currentPage && page >= 1 && page <= totalPages) {
      loadMessages(page)
    }
  }

  // 初始化加载
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true)
      loadMessages()
    }, 50)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div
      className={cn(
        "transition-all duration-500 ease-out",
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      )}
    >
      {/* 留言输入区 */}
      <MessageInput onSubmitSuccess={handleSubmitSuccess} />

      {/* 留言展示区头部 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <MessageSquareIcon className="h-5 w-5 text-primary" />
          留言列表
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadMessages(1)}
          disabled={isLoading}
          className="gap-2"
        >
          <RefreshCwIcon className={cn("h-4 w-4", isLoading && "animate-spin")} />
          刷新
        </Button>
      </div>

      {/* 加载状态 */}
      {isLoading && messages.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Spinner className="mr-2 h-6 w-6" />
          <span className="text-muted-foreground">正在加载留言...</span>
        </div>
      )}

      {/* 错误状态 */}
      {!isLoading && error && (
        <Card className="mb-6 border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6">
            <div className="text-center py-6">
              <p className="text-destructive mb-4">{error}</p>
              <Button onClick={() => loadMessages(1)} variant="outline">
                重新加载
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 空状态 */}
      {!isLoading && !error && messages.length === 0 && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <MessageSquareIcon className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground mb-2">暂无留言</p>
              <p className="text-sm text-muted-foreground">成为第一个留言的人吧！</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 留言列表 */}
      {!isLoading && !error && messages.length > 0 && (
        <>
          <div className="space-y-4">
            {messages.map((message, index) => (
              <MessageCard key={message.id} message={message} index={index} />
            ))}
          </div>

          {/* 分页 */}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            isLoading={isLoading}
          />

          {/* 底部统计 */}
          <div className="text-center mt-6 text-sm text-muted-foreground">
            共 {totalPages > 0 ? (totalPages - 1) * MESSAGES_PER_PAGE + messages.length : 0} 条留言
          </div>
        </>
      )}
    </div>
  )
}
