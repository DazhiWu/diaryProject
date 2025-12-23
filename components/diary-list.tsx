"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PlusIcon, Trash2Icon, ChevronRightIcon } from "@/components/icons"
import type { Entry } from "@/app/page"
import { useAuth } from "@/hooks/useAuth"
import { toast } from "sonner"
import { useState } from "react"
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog"

type DiaryListProps = {
  entries: Entry[]
  onViewDetail: (entry: Entry) => void
  onDelete: (id: number) => void
  emptyMessage: string
  onNewEntry: () => void
}

export function DiaryList({ entries, onViewDetail, onDelete, emptyMessage, onNewEntry }: DiaryListProps) {
  const auth = useAuth()
  const { isAdmin, isViewer, isAuthenticated } = auth
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<Entry | null>(null);
  
  // 处理受保护的操作
  const handleProtectedAction = (action: () => void, actionName: string = "执行此操作", requiredLevel: 'viewer' | 'admin' = 'admin') => {
    if (isAdmin || (requiredLevel === 'viewer' && isViewer)) {
      action();
    } else {
      toast.error(`请先进行管理员认证才能${actionName}`);
    }
  }
  
  // 处理删除操作
  const handleDelete = (entry: Entry) => {
    setEntryToDelete(entry);
    setDeleteDialogOpen(true);
  };
  
  // 确认删除
  const confirmDelete = () => {
    if (entryToDelete) {
      onDelete(entryToDelete.id);
      setDeleteDialogOpen(false);
      setEntryToDelete(null);
    }
  };
  
  if (entries.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground mb-6">{emptyMessage}</p>
        <div className="flex gap-2 justify-center">
          <Button 
            onClick={() => handleProtectedAction(onNewEntry)}
            className="gap-2"
          >
            <PlusIcon className="h-4 w-4" />
            新建日记
          </Button>
        </div>
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
        <Card key={entry.id} className="overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 bg-gradient-to-br from-card to-card/90 border-border/80">
          <div 
            onClick={() => onViewDetail(entry)} 
            className="w-full text-left cursor-pointer"
          >
            <div className="p-6">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <p className="text-lg font-semibold text-foreground tracking-tight">{entry.subtitle}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {new Date(entry.date).toLocaleDateString("zh-CN", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2 opacity-70 hover:opacity-100 transition-opacity">
                  {/* 只有管理员才能显示删除按钮 */}
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleProtectedAction(() => handleDelete(entry), "删除日记")
                      }}
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                    >
                      <Trash2Icon className="h-4 w-4" />
                    </Button>
                  )}
                  <ChevronRightIcon className="h-5 w-5 text-muted-foreground" />
                </div>
              </div>

              {entry.images && entry.images.length > 0 ? (
                <div className="flex flex-col sm:flex-row gap-4 mt-3">
                  <div
                    className={`grid flex-shrink-0 gap-1.5 ${getGridClass(entry.images.length)}`}
                    style={{ width: "100%", maxWidth: "140px" }}
                  >
                    {entry.images.slice(0, 9).map((image, index) => (
                      <div key={index} className="aspect-square rounded-md overflow-hidden shadow-sm transition-transform hover:scale-105">
                        <img
                          src={image || "/placeholder.svg"}
                          alt={`预览 ${index + 1}`}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="flex-1 whitespace-pre-wrap text-base leading-relaxed text-muted-foreground line-clamp-3">
                    {getPreviewContent(entry.content)}
                  </p>
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-base leading-relaxed text-muted-foreground line-clamp-4 mt-3">
                  {getPreviewContent(entry.content)}
                </p>
              )}
            </div>
          </div>
        </Card>
      ))}
      
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        entryTitle={entryToDelete?.subtitle || "未命名日记"}
      />
    </div>
  )
}