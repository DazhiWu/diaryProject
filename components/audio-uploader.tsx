"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { MusicIcon, XIcon, UploadIcon } from "@/components/icons"
import { toast } from "sonner"
import { validateAudioFile, formatFileSize, getAudioDuration } from "@/lib/audioHandler"
import { uploadAndSaveAudioMessage } from "@/lib/audioApi"
import { cn } from "@/lib/utils"

interface AudioUploaderProps {
  onUploadSuccess: () => void
  onCancel: () => void
}

export function AudioUploader({ onUploadSuccess, onCancel }: AudioUploaderProps) {
  const [title, setTitle] = useState("")
  const [author, setAuthor] = useState("致致")
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStage, setUploadStage] = useState<'idle' | 'processing' | 'uploading' | 'saving'>('idle')
  const [audioDuration, setAudioDuration] = useState<number | null>(null)
  
  const audioInputRef = useRef<HTMLInputElement>(null)

  const handleAudioSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 验证文件
    const validation = validateAudioFile(file)
    if (!validation.valid) {
      toast.error(validation.error)
      return
    }

    try {
      // 获取音频时长
      const duration = await getAudioDuration(file)
      setAudioDuration(duration)
      setAudioFile(file)
      
      // 如果没有填写标题，使用文件名作为默认标题
      if (!title) {
        const fileName = file.name.replace(/\.[^/.]+$/, "")
        setTitle(fileName)
      }
      
      toast.success(`音频文件已选择: ${formatFileSize(file.size)}`)
    } catch (error) {
      toast.error('无法读取音频文件信息')
    }

    // 重置输入
    if (audioInputRef.current) {
      audioInputRef.current.value = ""
    }
  }

  const removeAudio = () => {
    setAudioFile(null)
    setAudioDuration(null)
  }

  const handleUpload = async () => {
    if (!audioFile) {
      toast.error('请选择音频文件')
      return
    }

    if (!title.trim()) {
      toast.error('请输入标题')
      return
    }

    setUploading(true)
    setUploadProgress(0)

    try {
      await uploadAndSaveAudioMessage(
        audioFile,
        title.trim(),
        author.trim() || '致致',
        date,
        audioDuration ?? await getAudioDuration(audioFile),
        (stage, progress) => {
          setUploadStage(stage)
          setUploadProgress(progress)
        }
      )

      toast.success('音频上传成功')
      onUploadSuccess()
    } catch (error) {
      console.error('上传失败:', error)
      toast.error('音频上传失败，请重试')
    } finally {
      setUploading(false)
      setUploadStage('idle')
    }
  }

  const getStageText = () => {
    switch (uploadStage) {
      case 'processing':
        return '正在处理音频...'
      case 'uploading':
        return '正在上传文件...'
      case 'saving':
        return '正在保存...'
      default:
        return ''
    }
  }

  // 格式化时长显示
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <Card className="p-6">
      <div className="space-y-6">
        {/* 标题 */}
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">上传音频留言</h3>
        </div>

        {/* 基本信息 */}
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              标题 <span className="text-destructive">*</span>
            </label>
            <Input
              type="text"
              placeholder="输入音频标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={uploading}
              className="w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">作者</label>
              <Input
                type="text"
                placeholder="作者名称"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                disabled={uploading}
                className="w-full"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">日期</label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={uploading}
                max={new Date().toISOString().split('T')[0]}
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* 音频文件选择 */}
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            音频文件 <span className="text-destructive">*</span>
          </label>
          
          {!audioFile ? (
            <div
              onClick={() => audioInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer",
                "hover:border-primary/50 hover:bg-primary/5 transition-colors"
              )}
            >
              <MusicIcon className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                点击选择音频文件
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                仅支持 MP3 格式，最大 50MB
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-4 p-4 border rounded-lg bg-muted/50">
              <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                <MusicIcon className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {audioFile.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(audioFile.size)}
                  {audioDuration && ` · ${formatDuration(audioDuration)}`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={removeAudio}
                disabled={uploading}
                className="text-muted-foreground hover:text-destructive"
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </div>
          )}
          
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/mpeg,.mp3"
            onChange={handleAudioSelect}
            className="hidden"
            disabled={uploading}
          />
        </div>

        {/* 上传进度 */}
        {uploading && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{getStageText()}</span>
              <span className="text-foreground font-medium">{Math.round(uploadProgress)}%</span>
            </div>
            <Progress value={uploadProgress} className="h-2" />
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={uploading}
          >
            取消
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!audioFile || !title.trim() || uploading}
            className="gap-2"
          >
            {uploading ? (
              <>
                <UploadIcon className="h-4 w-4 animate-pulse" />
                上传中...
              </>
            ) : (
              <>
                <UploadIcon className="h-4 w-4" />
                上传音频
              </>
            )}
          </Button>
        </div>
      </div>
    </Card>
  )
}
