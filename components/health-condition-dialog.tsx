"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { XIcon, PlusIcon, EditIcon } from "@/components/icons"
import { useHealthConditions } from "@/hooks/useHealthConditions"
import { toast } from "sonner"

interface HealthConditionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function HealthConditionDialog({ open, onOpenChange }: HealthConditionDialogProps) {
  const { conditions, loading, addCondition, updateCondition, deleteCondition } = useHealthConditions()
  
  const [conditionName, setConditionName] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [color, setColor] = useState("#FFD700")
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleAddCondition = async () => {
    if (!conditionName || !startDate || !endDate) return
    
    setIsAdding(true)
    try {
      const nextCondition = {
        condition: conditionName,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        color: color
      }
      if (editingId) await updateCondition(editingId, nextCondition)
      else await addCondition(nextCondition)
      
      setConditionName("")
      setStartDate("")
      setEndDate("")
      setColor("#FFD700")
      setEditingId(null)
      toast.success(editingId ? "病症更新成功" : "病症添加成功")
    } catch (error) {
      console.error("Failed to add condition:", error)
      toast.error("添加病症失败，请重试")
    } finally {
      setIsAdding(false)
    }
  }

  const handleEditCondition = (condition: typeof conditions[number]) => {
    setEditingId(condition.id)
    setConditionName(condition.condition)
    setStartDate(condition.startDate.toISOString().slice(0, 10))
    setEndDate(condition.endDate.toISOString().slice(0, 10))
    setColor(condition.color)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setConditionName("")
    setStartDate("")
    setEndDate("")
    setColor("#FFD700")
  }

  const handleDeleteCondition = async (id: string) => {
    setDeletingId(id)
    try {
      await deleteCondition(id)
      toast.success("病症删除成功")
    } catch (error) {
      console.error("Failed to delete condition:", error)
      toast.error("删除病症失败，请重试")
    } finally {
      setDeletingId(null)
    }
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("zh-CN")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>生病异常设置</DialogTitle>
          <DialogDescription>设置生病期间的异常记录，便于统计健康数据。</DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="font-medium">{editingId ? "编辑病症" : "添加新病症"}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="condition-name">病症名称</Label>
                <Input
                  id="condition-name"
                  value={conditionName}
                  onChange={(e) => setConditionName(e.target.value)}
                  placeholder="如：口腔溃疡"
                  disabled={isAdding}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="condition-color">颜色</Label>
                <Input
                  id="condition-color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 p-1"
                  disabled={isAdding}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-date">开始日期</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={isAdding}
                  min="2024-11-01"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-date">结束日期</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={isAdding}
                  min="2024-11-01"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAddCondition} className="flex-1 gap-2" disabled={isAdding}>
                {isAdding ? <Spinner className="h-4 w-4" /> : editingId ? <EditIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
                {isAdding ? "保存中..." : editingId ? "保存修改" : "添加"}
              </Button>
              {editingId && <Button variant="outline" onClick={cancelEdit} disabled={isAdding}>取消</Button>}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium">已设置的病症</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner className="h-6 w-6" />
                </div>
              ) : conditions.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂未设置病症</p>
              ) : (
                conditions.map((cond) => (
                  <div
                    key={cond.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: cond.color }}
                      />
                      <div>
                        <p className="font-medium">{cond.condition}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(cond.startDate)} - {formatDate(cond.endDate)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <Button variant="ghost" size="icon" onClick={() => handleEditCondition(cond)} disabled={isAdding || deletingId === cond.id} aria-label="编辑病症">
                        <EditIcon className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteCondition(cond.id)} disabled={deletingId === cond.id} aria-label="删除病症">
                        {deletingId === cond.id ? <Spinner className="h-4 w-4" /> : <XIcon className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
