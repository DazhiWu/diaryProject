"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { ImageIcon, XIcon } from "@/components/icons"
import type { Entry } from "@/app/page"

type DiaryEntryProps = {
  entry?: Entry
  onSave: (content: string, subtitle?: string, date?: Date, images?: string[]) => void
  onCancel: () => void
}

export function DiaryEntry({ entry, onSave, onCancel }: DiaryEntryProps) {
  const [content, setContent] = useState(entry?.content || "")
  const [subtitle, setSubtitle] = useState(entry?.subtitle || "")
  const [date, setDate] = useState(
    entry?.date ? entry.date.toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
  )
  const [images, setImages] = useState<string[]>(entry?.images || [])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const maxDate = new Date().toISOString().slice(0, 16)

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      const fileArray = Array.from(files)
      // Limit to 9 images total
      const remainingSlots = 9 - images.length
      const filesToProcess = fileArray.slice(0, remainingSlots)

      filesToProcess.forEach((file) => {
        const reader = new FileReader()
        reader.onloadend = () => {
          setImages((prev) => [...prev, reader.result as string])
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

  const handleSave = () => {
    if (content.trim()) {
      onSave(content, subtitle.trim() || undefined, new Date(date), images.length > 0 ? images : undefined)
      setContent("")
      setSubtitle("")
      setDate(new Date().toISOString().slice(0, 16))
      setImages([])
    }
  }

  const getGridClass = (count: number) => {
    if (count === 1) return "grid-cols-1"
    if (count === 2) return "grid-cols-2"
    if (count <= 4) return "grid-cols-2"
    return "grid-cols-3"
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="space-y-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Date & Time</label>
            <Input
              type="datetime-local"
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
                <img
                  src={image || "/placeholder.svg"}
                  alt={`Upload ${index + 1}`}
                  className="h-full w-full rounded-lg object-cover"
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
              disabled={images.length >= 9}
            >
              <ImageIcon className="h-4 w-4" />
              Add Image{images.length > 0 && ` (${images.length}/9)`}
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
