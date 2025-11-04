"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Trash2Icon, ChevronRightIcon } from "@/components/icons"
import type { Entry } from "@/app/page"

type DiaryListProps = {
  entries: Entry[]
  onViewDetail: (entry: Entry) => void
  onDelete: (id: number) => void
  emptyMessage: string
}

export function DiaryList({ entries, onViewDetail, onDelete, emptyMessage }: DiaryListProps) {
  if (entries.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">{emptyMessage}</p>
      </div>
    )
  }

  const getPreviewContent = (content: string, maxLength = 150) => {
    if (content.length <= maxLength) return content
    return content.slice(0, maxLength) + "..."
  }

  const getGridClass = (count: number) => {
    if (count === 1) return "grid-cols-1"
    if (count === 2) return "grid-cols-2"
    if (count <= 4) return "grid-cols-2"
    return "grid-cols-3"
  }

  return (
    <div className="space-y-4">
      {entries.map((entry) => (
        <Card key={entry.id} className="overflow-hidden transition-shadow hover:shadow-md">
          <div 
            onClick={() => onViewDetail(entry)} 
            className="w-full text-left cursor-pointer"
          >
            <div className="p-6">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <p className="text-lg font-semibold text-foreground">{entry.subtitle}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(entry.date).toLocaleDateString("en-US", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(entry.id)
                    }}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2Icon className="h-4 w-4" />
                  </Button>
                  <ChevronRightIcon className="h-5 w-5 text-muted-foreground" />
                </div>
              </div>

              {entry.images && entry.images.length > 0 ? (
                <div className="flex gap-4">
                  <div
                    className={`grid flex-shrink-0 gap-1 ${getGridClass(entry.images.length)}`}
                    style={{ width: "160px" }}
                  >
                    {entry.images.slice(0, 9).map((image, index) => (
                      <div key={index} className="aspect-square">
                        <img
                          src={image || "/placeholder.svg"}
                          alt={`Preview ${index + 1}`}
                          className="h-full w-full rounded object-cover"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="flex-1 whitespace-pre-wrap text-base leading-relaxed text-muted-foreground">
                    {getPreviewContent(entry.content)}
                  </p>
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-base leading-relaxed text-muted-foreground">
                  {getPreviewContent(entry.content)}
                </p>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
