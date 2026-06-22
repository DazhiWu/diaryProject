"use client"

import type React from "react"

import { useState, useRef } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { ImageIcon, XIcon } from "@/components/icons"
import type { Entry } from "@/app/page"
import { toast } from "sonner"

type DiaryEntryProps = {
  entry?: Entry
  onSave: (content: string, subtitle: string, date: Date, files: File[]) => Promise<boolean>
  onCancel: () => void
}

export function DiaryEntry({ entry, onSave, onCancel }: DiaryEntryProps) {
  const [content, setContent] = useState(entry?.content || "")
  const [subtitle, setSubtitle] = useState(entry?.subtitle || "")
  const [date, setDate] = useState(
    entry?.date ? entry.date.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
  )
  const [images, setImages] = useState<{ file: File | null; url: string }[]>(
    entry?.images ? entry.images.map(url => ({ file: null, url })) : []
  )
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const maxDate = new Date().toISOString().split('T')[0]

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      const fileArray = Array.from(files)
      // Limit to 18 images total
      const remainingSlots = 18 - images.length
      const filesToProcess = fileArray.slice(0, remainingSlots)

      filesToProcess.forEach((file) => {
        // 显示预览
        const reader = new FileReader()
        reader.onloadend = () => {
          setImages((prev) => [...prev, { file, url: reader.result as string }])
        }
        reader.readAsDataURL(file)
      })
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    if (content.trim()) {
      // 统一使用UTC时区处理日期
      const utcDate = new Date(date);
      // 提取文件对象（排除已有的 Storage URL）
      const files = images.filter(img => img.file).map(img => img.file!).filter(Boolean)
      const success = await onSave(content, subtitle.trim(), utcDate, files)
      if (success) {
        setContent("")
        setSubtitle("")
        setDate(new Date().toISOString().split('T')[0])
        setImages([])
      }
    }
  }

  const getGridClass = (count: number) => {
    if (count === 1) return "grid-cols-1"
    if (count === 2) return "grid-cols-2"
    if (count <= 4) return "grid-cols-2"
    if (count <= 9) return "grid-cols-3"
    return "grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="space-y-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Date</label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={maxDate}
              className="w-full"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Subtitle (optional)</label>
            <Input
              type="text"
              placeholder="Enter a subtitle or leave blank to use date/time"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="w-full"
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">Content</label>
          <Textarea
            placeholder="Write your thoughts..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[300px] resize-none text-base leading-relaxed"
          />
        </div>

        {images.length > 0 && (
          <div className={`grid gap-2 ${getGridClass(images.length)}`}>
            {images.map((image, index) => (
              <div key={index} className="relative aspect-square">
                <Image
                  src={image.url || "/placeholder.svg"}
                  alt={`Upload ${index + 1}`}
                  fill
                  className="rounded-lg object-cover"
                />
                <Button
                  size="icon"
                  variant="destructive"
                  className="absolute right-1 top-1 h-6 w-6"
                  onClick={() => removeImage(index)}
                >
                  <XIcon className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="hidden"
            />
            <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="gap-2"
                disabled={images.length >= 18}
              >
                <ImageIcon className="h-4 w-4" />
                Add Image{images.length > 0 && ` (${images.length}/18)`}
              </Button>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!content.trim()}>
              {entry ? "Update Entry" : "Save Entry"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
