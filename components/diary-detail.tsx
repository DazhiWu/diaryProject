"use client"

import type React from "react"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeftIcon, Trash2Icon, XIcon, ChevronLeftIcon, ChevronRightIcon, EditIcon } from "@/components/icons"
import { SparklesIcon, SmileIcon } from 'lucide-react'
import type { Entry } from "@/app/page"
import { useState, useEffect } from "react"
import { analyzeDiaryWithAI } from "@/lib/aiAnalysis"
import { saveAIAnalysis, getAIAnalysisForDiary } from "@/lib/diaryApi"
import { toast } from "sonner"
import { useAuth } from "@/hooks/useAuth"
import { AuthDialog } from "@/components/auth-dialog"
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog"

type DiaryDetailProps = {
  entry: Entry
  onBack: () => void
  onDelete: (id: number) => void
  onEdit: (entry: Entry) => void
  onUpdateEntry?: (id: number, updates: Partial<Entry>) => void
}

export function DiaryDetail({ entry, onBack, onDelete, onEdit, onUpdateEntry }: DiaryDetailProps) {
  const auth = useAuth()
  const [localAuthState, setLocalAuthState] = useState(auth.isAuthenticated)
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [aiEmotion, setAiEmotion] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  
  // 监听localStorage中认证状态的变化
  useEffect(() => {
    // 初始同步认证状态
    setLocalAuthState(auth.isAuthenticated);
    
    // 监听localStorage变化
    const handleStorageChange = () => {
      const storedAuthStatus = localStorage.getItem('diaryAppAuthStatus');
      setLocalAuthState(storedAuthStatus === 'authenticated');
    };
    
    // 添加事件监听器
    window.addEventListener('storage', handleStorageChange);
    
    // 清理函数
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [auth.isAuthenticated]);
  
  // 辅助函数获取当前认证状态
  const isAuthenticated = localAuthState || auth.isAuthenticated;

  // 页面加载时获取AI分析结果
  useEffect(() => {
    const fetchAIAnalysis = async () => {
      try {
        const analysis = await getAIAnalysisForDiary(entry.id);
        if (analysis) {
          setAiSummary(analysis.summary);
          setAiEmotion(analysis.emotion);
        }
      } catch (error) {
        console.error("获取AI分析结果失败:", error);
      }
    };

    fetchAIAnalysis();
  }, [entry.id]);

  const handleAIAnalysis = async () => {
    setIsAnalyzing(true)
    setError(null)
    try {
      // 通过API路由调用AI分析
      const response = await fetch('/api/ai-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: entry.content }),
      });

      // 先检查响应状态
      if (!response.ok) {
        // 尝试解析错误响应中的JSON消息
        let errorMessage = `API错误: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = `API错误: ${response.status} - ${errorData.error}`;
          }
        } catch (parseError) {
          // 如果无法解析JSON，则使用文本响应
          const errorText = await response.text();
          if (errorText) {
            errorMessage = `API错误: ${response.status} - ${errorText.substring(0, 100)}...`;
          }
        }
        console.error("API错误响应:", errorMessage);
        throw new Error(errorMessage);
      }

      // 检查内容类型
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const errorText = await response.text();
        console.error("非JSON响应:", errorText);
        throw new Error(`服务器返回非JSON响应: ${errorText.substring(0, 100)}...`);
      }

      const data = await response.json();

      // 更新状态
      setAiSummary(data.summary)
      setAiEmotion(data.emotion)
      
      // 保存到数据库
      await saveAIAnalysis({
        diary_id: entry.id,
        summary: data.summary,
        emotion: data.emotion
      })
      
      // 更新日记标题
      if (onUpdateEntry) {
        onUpdateEntry(entry.id, { subtitle: data.summary });
      }
      
      toast.success("AI分析完成！");
    } catch (error: any) {
      console.error("AI分析失败:", error)
      const errorMessage = error.message || "AI分析失败，请稍后再试"
      setError(errorMessage)
      toast.error(errorMessage);
    } finally {
      setIsAnalyzing(false)
    }
  }
  
  // 新增：测试环境配置的函数
  const testEnvironment = async () => {
    try {
      const response = await fetch('/api/test-env');
      const data = await response.json();
      
      if (data.success) {
        console.log('环境测试结果:', data.data);
        toast.success(`环境配置检查完成: API密钥${data.data.isConfigured ? '已' : '未'}设置`);
      } else {
        console.error('环境测试失败:', data.error);
        toast.error(`环境测试失败: ${data.error}`);
      }
    } catch (error) {
      console.error('环境测试请求失败:', error);
      toast.error('环境测试请求失败');
    }
  }
  
  // 处理删除操作
  const handleDelete = () => {
    setDeleteDialogOpen(true);
  };
  
  // 确认删除
  const confirmDelete = () => {
    onDelete(entry.id);
    setDeleteDialogOpen(false);
  };

  const getGridClass = (count: number) => {
    if (count === 1) return "grid-cols-1"
    if (count === 2) return "grid-cols-2"
    if (count <= 4) return "grid-cols-2"
    return "grid-cols-3"
  }

  const handleProtectedAction = (action: () => void, actionName: string) => {
    // 再次检查localStorage确保状态最新
    const storedAuthStatus = localStorage.getItem('diaryAppAuthStatus') === 'authenticated';
    if (storedAuthStatus || isAuthenticated) {
      action();
    } else {
      toast.error(`请先进行管理员认证才能${actionName}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeftIcon className="h-4 w-4" />
          Back to List
        </Button>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => handleProtectedAction(handleAIAnalysis, "使用AI分析")}
            className="gap-2" 
          >
            <SparklesIcon className="h-4 w-4" />
            {isAnalyzing ? "Analyzing..." : "AI Analysis"}
          </Button>
          
          {/* 添加测试环境配置的按钮 */}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => handleProtectedAction(testEnvironment, "测试环境")}
            className="gap-2"
          >
            <span className="h-4 w-4">🧪</span>
            Test Env
          </Button>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => handleProtectedAction(() => onEdit(entry), "编辑日记")}
            className="gap-2"
          >
            <EditIcon className="h-4 w-4" />
            Edit
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleProtectedAction(handleDelete, "删除日记")}
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
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xl font-semibold text-foreground">{entry.subtitle}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {/* 统一使用UTC时区显示日期 */}
                  {entry.date.getUTCFullYear()}年{String(entry.date.getUTCMonth() + 1).padStart(2, '0')}月{String(entry.date.getUTCDate()).padStart(2, '0')}日
                </p>
                {entry.modifiedAt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Modified:{" "}
                    {entry.modifiedAt.getUTCFullYear()}-{String(entry.modifiedAt.getUTCMonth() + 1).padStart(2, '0')}-{String(entry.modifiedAt.getUTCDate()).padStart(2, '0')} {String(entry.modifiedAt.getUTCHours()+16).padStart(2, '0')}:{String(entry.modifiedAt.getUTCMinutes()).padStart(2, '0')}
                  </p>
                )}
              </div>
              {(aiEmotion || aiSummary) && (
                <div className="relative group">
                  <div className="cursor-pointer">
                    <SmileIcon className="h-6 w-6 text-muted-foreground hover:text-foreground transition-colors" />
                  </div>
                  <div className="absolute right-0 mt-2 w-64 p-3 bg-popover text-popover-foreground text-sm rounded-md shadow-md opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                    <div className="font-medium mb-1">AI Analysis Result</div>
                    {aiEmotion && <p className="mb-1"><span className="font-medium">情绪:</span> {aiEmotion}</p>}
                    {aiSummary && <p><span className="font-medium">摘要:</span> {aiSummary}</p>}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="relative mb-6">
            <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground/80">{entry.content}</p>
          </div>

          {entry.images && entry.images.length > 0 && (
            <div className={`grid gap-2 ${getGridClass(entry.images.length)}`}>
              {entry.images.map((image, index) => (
                <div
                  key={index}
                  className="relative aspect-square cursor-pointer overflow-hidden rounded-md"
                  onClick={() => setSelectedImageIndex(index)}
                >
                  <img
                    src={image}
                    alt={`Diary image ${index + 1}`}
                    className="h-full w-full object-cover transition-transform hover:scale-105"
                  />
                </div>
              ))}
            </div>
          )}

          {selectedImageIndex !== null && entry.images && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
              <div className="relative max-h-[90vh] max-w-[90vw]">
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute -left-12 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
                  onClick={() =>
                    setSelectedImageIndex(
                      (selectedImageIndex - 1 + entry.images!.length) % entry.images!.length
                    )
                  }
                >
                  <ChevronLeftIcon className="h-8 w-8" />
                </Button>
                <img
                  src={entry.images[selectedImageIndex]}
                  alt="Enlarged view"
                  className="max-h-[90vh] max-w-[90vw] object-contain"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute -right-12 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
                  onClick={() =>
                    setSelectedImageIndex((selectedImageIndex + 1) % entry.images!.length)
                  }
                >
                  <ChevronRightIcon className="h-8 w-8" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute -top-12 right-0 text-white hover:bg-white/20"
                  onClick={() => setSelectedImageIndex(null)}
                >
                  <XIcon className="h-6 w-6" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
      
      {error && (
        <div className="bg-destructive/10 border border-destructive/50 rounded-md p-4 text-destructive">
          <p className="font-medium">AI分析出错：</p>
          <p>{error}</p>
        </div>
      )}
      
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        entryTitle={entry?.subtitle || "未命名日记"}
      />
      
    </div>
  )
}
