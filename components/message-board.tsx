"use client"

import { useState, useRef, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Spinner } from "@/components/ui/spinner"
import { PlayIcon, PauseIcon, MusicIcon, PlusIcon, Trash2Icon } from "@/components/icons"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { AudioUploader } from "./audio-uploader"
import { fetchAudioMessages, deleteAudioMessage } from "@/lib/audioApi"
import type { AudioMessage } from "@/lib/audioHandler"
import { useAuth } from "@/hooks/useAuth"

// 格式化时间显示
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

// 单个音频播放器组件
function AudioPlayer({ 
  message, 
  isPlaying, 
  currentTime, 
  onTogglePlay, 
  onSeek,
  onDelete,
  isAdmin 
}: { 
  message: AudioMessage
  isPlaying: boolean
  currentTime: number
  onTogglePlay: () => void
  onSeek: (time: number) => void
  onDelete?: () => void
  isAdmin: boolean
}) {
  const progressPercent = message.duration > 0 ? (currentTime / message.duration) * 100 : 0

  return (
    <Card className="overflow-hidden transition-all duration-300 hover:shadow-lg bg-gradient-to-br from-card to-card/90 border-border/80">
      <div className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
          {/* 音频图标 */}
          <div className="flex-shrink-0 mx-auto sm:mx-0">
            <div
              className={cn(
                "relative w-24 h-24 sm:w-32 sm:h-32 rounded-xl overflow-hidden shadow-md transition-transform duration-300 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center",
                isPlaying && "scale-105 shadow-lg"
              )}
            >
              <MusicIcon className="w-10 h-10 sm:w-12 sm:h-12 text-primary/60" />
              {/* 播放状态指示器 */}
              {isPlaying && (
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                  <div className="flex gap-1">
                    <div className="w-1 h-4 bg-white rounded-full animate-pulse" />
                    <div className="w-1 h-6 bg-white rounded-full animate-pulse delay-75" />
                    <div className="w-1 h-4 bg-white rounded-full animate-pulse delay-150" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 音频信息 */}
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground tracking-tight truncate">
                  {message.title}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {message.author} · {new Date(message.date).toLocaleDateString("zh-CN")}
                </p>
              </div>
              {/* 删除按钮 - 仅管理员可见 */}
              {isAdmin && onDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onDelete}
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/5 flex-shrink-0"
                >
                  <Trash2Icon className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* 播放控制区域 */}
            <div className="mt-4 space-y-3">
              {/* 进度条 */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-10 text-right">
                  {formatTime(currentTime)}
                </span>
                <div className="flex-1">
                  <Slider
                    value={[currentTime]}
                    max={message.duration}
                    step={1}
                    onValueChange={(value) => onSeek(value[0])}
                    className="w-full"
                  />
                </div>
                <span className="text-xs text-muted-foreground w-10">
                  {formatTime(message.duration)}
                </span>
              </div>

              {/* 播放按钮 */}
              <div className="flex items-center justify-center sm:justify-start gap-3">
                <Button
                  onClick={onTogglePlay}
                  size="icon"
                  className={cn(
                    "h-12 w-12 rounded-full transition-all duration-300",
                    isPlaying
                      ? "bg-primary/90 hover:bg-primary"
                      : "bg-primary hover:bg-primary/90"
                  )}
                >
                  {isPlaying ? (
                    <PauseIcon className="h-5 w-5 text-white" />
                  ) : (
                    <PlayIcon className="h-5 w-5 text-white ml-0.5" />
                  )}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {isPlaying ? "正在播放" : "点击播放"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 进度条背景装饰 */}
      <div
        className="h-1 bg-primary/10 transition-all duration-100"
        style={{ width: `${progressPercent}%` }}
      />
    </Card>
  )
}

// 音频主组件 
export function MessageBoard() {
  const [isVisible, setIsVisible] = useState(false)
  const [messages, setMessages] = useState<AudioMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showUploader, setShowUploader] = useState(false)
  
  // 音频播放状态
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)
  
  // 认证状态
  const { isAdmin } = useAuth()

  // 加载音频消息
  const loadMessages = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchAudioMessages()
      setMessages(data)
    } catch (err) {
      console.error('加载音频消息失败:', err)
      setError('加载音频消息失败，请稍后重试')
      toast.error('加载音频消息失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // 触发进入动画
    const timer = setTimeout(() => setIsVisible(true), 50)
    // 加载数据
    loadMessages()
    return () => {
      clearTimeout(timer)
      // 清理音频资源
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ""
      }
    }
  }, [])

  // 处理播放/暂停
  const handleTogglePlay = (message: AudioMessage) => {
    if (playingId === message.id) {
      audioRef.current?.pause()
      setPlayingId(null)
    } else {
      if (audioRef.current) {
        audioRef.current.pause()
      }
      
      currentAudioRef.current = new Audio(message.audioUrl)
      audioRef.current = currentAudioRef.current
      
      const currentAudio = currentAudioRef.current
      
      currentAudio.addEventListener("timeupdate", () => {
        if (currentAudioRef.current === currentAudio) {
          setCurrentTime(currentAudio.currentTime)
        }
      })
      
      currentAudio.addEventListener("ended", () => {
        if (currentAudioRef.current === currentAudio) {
          setPlayingId(null)
          setCurrentTime(0)
        }
      })
      
      currentAudio.addEventListener("error", () => {
        if (currentAudioRef.current === currentAudio) {
          toast.error('音频加载失败')
          setPlayingId(null)
        }
      })
      
      currentAudio.play().catch(() => {
        if (currentAudioRef.current === currentAudio) {
          toast.error('播放失败')
          setPlayingId(null)
        }
      })
      
      setPlayingId(message.id)
      setCurrentTime(0)
    }
  }

  // 处理进度跳转
  const handleSeek = (messageId: string, time: number) => {
    if (audioRef.current && playingId === messageId) {
      audioRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  // 处理删除
  const handleDelete = async (message: AudioMessage) => {
    if (!confirm(`确定要删除 "${message.title}" 吗？`)) {
      return
    }
    
    try {
      // 如果正在播放，先停止
      if (playingId === message.id && audioRef.current) {
        audioRef.current.pause()
        setPlayingId(null)
      }
      
      await deleteAudioMessage(message.id)
      toast.success('音频已删除')
      // 重新加载列表
      loadMessages()
    } catch (err) {
      console.error('删除失败:', err)
      toast.error('删除失败，请重试')
    }
  }

  // 处理上传成功
  const handleUploadSuccess = () => {
    setShowUploader(false)
    toast.success('音频上传成功')
    loadMessages()
  }

  return (
    <div
      className={cn(
        "transition-all duration-500 ease-out",
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      )}
    >
      {/* 头部 */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <MusicIcon className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold text-foreground">音频记录</h2>
        </div>
        
        {/* 上传按钮 - 仅管理员可见 */}
        {isAdmin && (
          <Button
            onClick={() => setShowUploader(!showUploader)}
            className="gap-2"
          >
            <PlusIcon className="h-4 w-4" />
            {showUploader ? '取消上传' : '上传音频'}
          </Button>
        )}
      </div>

      {/* 上传区域 */}
      {showUploader && (
        <div className={cn(
          "mb-6 transition-all duration-300",
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"
        )}>
          <AudioUploader
            onUploadSuccess={handleUploadSuccess}
            onCancel={() => setShowUploader(false)}
          />
        </div>
      )}

      {/* 简介卡片 */}
      {!showUploader && (
        <Card className="mb-6 p-4 sm:p-6 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                <MusicIcon className="h-6 w-6 text-primary" />
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">还没想好叫什么</h3>
              <p className="text-sm text-muted-foreground mt-1">
                我已经见证了时间的力量，那么该怎么证明我也曾对抗过时间呢
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* 加载状态 */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Spinner className="mr-2 h-6 w-6" />
          <span className="text-muted-foreground">正在加载音频...</span>
        </div>
      )}

      {/* 错误状态 */}
      {!loading && error && (
        <div className="text-center py-12">
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={loadMessages} variant="outline">
            重新加载
          </Button>
        </div>
      )}

      {/* 空状态 */}
      {!loading && !error && messages.length === 0 && (
        <div className="text-center py-12">
          <MusicIcon className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground mb-2">暂无音频留言</p>
          {isAdmin && (
            <p className="text-sm text-muted-foreground">
              点击右上角&quot;上传音频&quot;按钮添加第一条留言
            </p>
          )}
        </div>
      )}

      {/* 音频列表 */}
      {!loading && !error && messages.length > 0 && (
        <div className="space-y-4">
          {messages.map((message, index) => (
            <div
              key={message.id}
              className={cn(
                "transition-all duration-500 ease-out",
                isVisible
                  ? "opacity-100 translate-x-0"
                  : "opacity-0 -translate-x-4"
              )}
              style={{
                transitionDelay: `${index * 100 + 200}ms`,
              }}
            >
              <AudioPlayer
                message={message}
                isPlaying={playingId === message.id}
                currentTime={playingId === message.id ? currentTime : 0}
                onTogglePlay={() => handleTogglePlay(message)}
                onSeek={(time) => handleSeek(message.id, time)}
                onDelete={() => handleDelete(message)}
                isAdmin={isAdmin}
              />
            </div>
          ))}
        </div>
      )}

      {/* 底部提示 */}
      {!loading && !error && messages.length > 0 && (
        <div className="mt-8 text-center">
          <p className="text-sm text-muted-foreground">
            共 {messages.length} 条音频留言
          </p>
        </div>
      )}
    </div>
  )
}
