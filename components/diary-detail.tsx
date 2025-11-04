"use client"

import type React from "react"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeftIcon, Trash2Icon, XIcon, ChevronLeftIcon, ChevronRightIcon, EditIcon } from "@/components/icons"
import type { Entry } from "@/app/page"
import { useState } from "react"

type DiaryDetailProps = {
  entry: Entry
  onBack: () => void
  onDelete: (id: number) => void
  onEdit: (entry: Entry) => void
}

export function DiaryDetail({ entry, onBack, onDelete, onEdit }: DiaryDetailProps) {
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null)

  const getGridClass = (count: number) => {
    if (count === 1) return "grid-cols-1"
    if (count === 2) return "grid-cols-2"
    if (count <= 4) return "grid-cols-2"
    return "grid-cols-3"
  }

  const handlePrevImage = () => {
    if (selectedImageIndex !== null && entry.images) {
      setSelectedImageIndex((selectedImageIndex - 1 + entry.images.length) % entry.images.length)
    }
  }

  const handleNextImage = () => {
    if (selectedImageIndex !== null && entry.images) {
      setSelectedImageIndex((selectedImageIndex + 1) % entry.images.length)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setSelectedImageIndex(null)
    } else if (e.key === "ArrowLeft") {
      handlePrevImage()
    } else if (e.key === "ArrowRight") {
      handleNextImage()
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeftIcon className="h-4 w-4" />
          Back to List
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onEdit(entry)} className="gap-2">
            <EditIcon className="h-4 w-4" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(entry.id)}
            className="gap-2 text-destructive hover:bg-destructive hover:text-destructive-foreground"
          >
            <Trash2Icon className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="p-6">
          <div className="mb-6">
            <p className="text-xl font-semibold text-foreground">{entry.subtitle}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {entry.date.toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
            {entry.modifiedAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                Modified:{" "}
                {entry.modifiedAt.toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
          </div>

          <p className="mb-6 whitespace-pre-wrap text-base leading-relaxed text-foreground/80">{entry.content}</p>

          {entry.images && entry.images.length > 0 && (
            <div className={`grid gap-2 ${getGridClass(entry.images.length)}`}>
              {entry.images.map((image, index) => (
                <div
                  key={index}
                  className="aspect-square cursor-pointer transition-opacity hover:opacity-80"
                  onClick={() => setSelectedImageIndex(index)}
                >
                  <img
                    src={image || "/placeholder.svg"}
                    alt={`Entry image ${index + 1}`}
                    className="h-full w-full rounded-lg object-cover"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {selectedImageIndex !== null && entry.images && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setSelectedImageIndex(null)}
          onKeyDown={handleKeyDown}
          tabIndex={0}
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-4 text-white hover:bg-white/20"
            onClick={() => setSelectedImageIndex(null)}
          >
            <XIcon className="h-6 w-6" />
          </Button>

          {entry.images.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-4 text-white hover:bg-white/20"
                onClick={(e) => {
                  e.stopPropagation()
                  handlePrevImage()
                }}
              >
                <ChevronLeftIcon className="h-8 w-8" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="absolute right-4 text-white hover:bg-white/20"
                onClick={(e) => {
                  e.stopPropagation()
                  handleNextImage()
                }}
              >
                <ChevronRightIcon className="h-8 w-8" />
              </Button>
            </>
          )}

          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <img
              src={entry.images[selectedImageIndex] || "/placeholder.svg"}
              alt={`Entry image ${selectedImageIndex + 1}`}
              className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            />
            {entry.images.length > 1 && (
              <p className="mt-4 text-center text-sm text-white">
                {selectedImageIndex + 1} / {entry.images.length}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
