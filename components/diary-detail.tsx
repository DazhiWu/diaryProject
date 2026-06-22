"use client"

import type React from "react"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeftIcon, Trash2Icon, XIcon, ChevronLeftIcon, ChevronRightIcon, EditIcon, BookOpenIcon } from "@/components/icons"
import { SparklesIcon, SmileIcon, FrownIcon, HeartIcon, AlertCircleIcon, HelpCircleIcon, StarIcon, CloudRainIcon, ZapIcon, MoonIcon, SunIcon, FlowerIcon, MusicIcon, CoffeeIcon, CameraIcon, PaletteIcon, AwardIcon, LightbulbIcon, RocketIcon, ActivityIcon } from 'lucide-react'
import { MehIcon } from './icons'
import type { Entry } from "@/app/page"
import { useState, useEffect } from "react"
import Image from "next/image"

import { saveAIAnalysis, getAIAnalysisForDiary, updateDiaryEntry } from "@/lib/diaryApi"
import { supabase } from "@/lib/supabaseClient"
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
  previousEntry?: Entry | null
  nextEntry?: Entry | null
  onNavigateToEntry: (entry: Entry) => void
}

export function DiaryDetail({ entry, onBack, onDelete, onEdit, onUpdateEntry, previousEntry, nextEntry, onNavigateToEntry }: DiaryDetailProps) {
  const auth = useAuth()
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [aiEmotion, setAiEmotion] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  // 翻译相关状态
  const [isTranslating, setIsTranslating] = useState(false)
  const [translatedContent, setTranslatedContent] = useState<string | null>(null)
  const [showTranslation, setShowTranslation] = useState(false)
  
  // 直接使用useAuth钩子返回的认证状态
  const isAuthenticated = auth.isAuthenticated;
  const isAdmin = auth.isAdmin;
  const isViewer = auth.isViewer;
  const isGuest = !isAuthenticated;

  // 页面加载时获取AI分析结果
  useEffect(() => {
    const fetchAIAnalysis = async () => {
      try {
        console.log(`正在获取日记ID ${entry.id} 的AI分析结果...`);
        const analysis = await getAIAnalysisForDiary(entry.id);
        if (analysis) {
          console.log(`获取到AI分析结果:`, analysis);
          setAiSummary(analysis.summary);
          setAiEmotion(analysis.emotion);
        } else {
          console.log(`没有找到日记ID ${entry.id} 的AI分析结果`);
          // 当没有分析结果时，清空本地状态
          setAiSummary(null);
          setAiEmotion(null);
        }
      } catch (error) {
        console.error("获取AI分析结果失败:", error);
        // 错误时清空本地状态
        setAiSummary(null);
        setAiEmotion(null);
      }
    };

    fetchAIAnalysis();
  }, [entry.id]);

  const handleAIAnalysis = async () => {
    setIsAnalyzing(true)
    setError(null)
    // 保存当前状态，以便在出错时恢复
    const originalSummary = aiSummary;
    const originalEmotion = aiEmotion;
    
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
      console.log(`API返回的AI分析结果:`, data);
      
      // 先保存到数据库
      console.log(`正在保存AI分析结果到数据库...`);
      const savedAnalysis = await saveAIAnalysis({
        diary_id: entry.id,
        summary: data.summary,
        emotion: data.emotion
      });
      console.log(`AI分析结果保存成功:`, savedAnalysis);
      
      // 更新日记标题
      if (onUpdateEntry) {
        onUpdateEntry(entry.id, { subtitle: data.summary });
      }
      
      // 将AI生成的标题更新到数据库的diaryContent表
      console.log(`正在更新日记ID ${entry.id} 的标题到数据库...`);
      // 直接从数据库获取最新的条目信息，确保使用原始的相对路径
      const { data: currentEntry, error } = await supabase
        .from('diaryContent')
        .select('image_paths')
        .eq('id', entry.id)
        .single();
      
      await updateDiaryEntry(entry.id, { 
        subtitle: data.summary, 
        images: currentEntry?.image_paths || [] // 确保使用原始的相对路径
      });
      console.log(`日记标题更新到数据库成功`);
      
      // 重新从数据库获取最新的分析结果，确保数据一致性
      console.log(`正在从数据库重新获取AI分析结果...`);
      const analysisFromDb = await getAIAnalysisForDiary(entry.id);
      if (analysisFromDb) {
        console.log(`从数据库获取到最新的AI分析结果:`, analysisFromDb);
        setAiSummary(analysisFromDb.summary);
        setAiEmotion(analysisFromDb.emotion);
      }
      
      toast.success("AI分析完成！");
    } catch (error: any) {
      console.error("AI分析失败:", error);
      const errorMessage = error.message || "AI分析失败，请稍后再试";
      setError(errorMessage);
      // 恢复之前的状态
      setAiSummary(originalSummary);
      setAiEmotion(originalEmotion);
      toast.error(errorMessage);
    } finally {
      setIsAnalyzing(false);
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

  // 处理翻译操作
  const handleTranslate = async () => {
    setIsTranslating(true);
    setError(null);
    
    try {
      // 通过API路由调用翻译功能，避免在浏览器中暴露API密钥
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: entry.content }),
      });

      // 检查响应状态
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `翻译失败，状态码: ${response.status}`);
      }

      // 获取翻译结果
      const data = await response.json();
      setTranslatedContent(data.translation);
      setShowTranslation(true);
      toast.success("翻译完成！");
    } catch (error: any) {
      console.error("翻译失败:", error);
      const errorMessage = error.message || "翻译失败，请稍后再试";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsTranslating(false);
    }
  };

  // 格式化带有时区偏移的日期时间（保留加16小时的时区调整）
  const formatDateTimeWithOffset = (date: Date): string => {
    // 创建日期副本以避免修改原始日期
    const adjustedDate = new Date(date);
    // 应用+16小时的时区偏移，会自动处理日期进位
    adjustedDate.setUTCHours(date.getUTCHours() + 16);
    
    // 提取年、月、日
    const year = adjustedDate.getUTCFullYear();
    const month = String(adjustedDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(adjustedDate.getUTCDate()).padStart(2, '0');
    
    // 提取小时、分钟（已经自动处理24小时制）
    const hours = String(adjustedDate.getUTCHours()).padStart(2, '0');
    const minutes = String(adjustedDate.getUTCMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }
  
  // 根据图片数量确定网格布局类
  const getGridClass = (count: number) => {
    if (count === 1) return "grid-cols-1"
    if (count === 2) return "grid-cols-2"
    if (count <= 4) return "grid-cols-2"
    if (count <= 9) return "grid-cols-3"
    return "grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
  }

  const handleProtectedAction = (action: () => void, actionName: string, requiredLevel: 'viewer' | 'admin' = 'admin') => {
    // 再次检查localStorage确保状态最新
    const storedAuthLevel = localStorage.getItem('diaryAppAuthLevel') as 'guest' | 'viewer' | 'admin' || 'guest';
    if (storedAuthLevel === 'admin' || (requiredLevel === 'viewer' && storedAuthLevel === 'viewer')) {
      action();
    } else {
      toast.error(`请先进行管理员认证才能${actionName}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Button variant="ghost" onClick={onBack} className="gap-2 hover:text-primary transition-colors">
          <ArrowLeftIcon className="h-4 w-4" />
          返回列表
        </Button>
        <div className="flex flex-wrap gap-2 justify-start sm:justify-end">
          {/* AI分析和测试环境按钮对viewer和admin都可见，但操作受保护 */}
          {isAuthenticated && (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleProtectedAction(handleAIAnalysis, "使用AI分析")}
                className="gap-2 hover:text-primary hover:bg-primary/5"
              >
                <SparklesIcon className="h-4 w-4" />
                {isAnalyzing ? "分析中..." : "AI分析"}
              </Button>
              
              {/* 翻译按钮 */}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleTranslate}
                className="gap-2 hover:text-primary hover:bg-primary/5"
                disabled={isTranslating}
              >
                <BookOpenIcon className="h-4 w-4" />
                {isTranslating ? "翻译中..." : "翻译英语"}
              </Button>
              
              {/* 添加测试环境配置的按钮 */}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleProtectedAction(testEnvironment, "测试环境")}
                className="gap-2 hover:text-primary hover:bg-primary/5"
              >
                <span className="h-4 w-4">🧪</span>
                测试环境
              </Button>
            </>
          )}
          
          {/* 只有管理员才能显示编辑和删除按钮 */}
          {isAdmin && (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleProtectedAction(() => onEdit(entry), "编辑日记")}
                className="gap-2 hover:text-primary hover:bg-primary/5"
              >
                <EditIcon className="h-4 w-4" />
                编辑
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleProtectedAction(handleDelete, "删除日记")}
                className="gap-2 text-destructive hover:bg-destructive/5 hover:text-destructive"
              >
                <Trash2Icon className="h-4 w-4" />
                删除
              </Button>
            </>
          )}
        </div>
      </div>

      <Card className="overflow-hidden transition-all duration-300 hover:shadow-lg bg-gradient-to-br from-card to-card/90 border-border/80">
        <div className="p-8">
          <div className="mb-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-start gap-4">
              <div>
                <h1 className="text-2xl font-semibold text-foreground tracking-tight leading-tight">{entry.subtitle}</h1>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <p>
                    {/* 统一使用UTC时区显示日期 */}
                    {entry.date.getUTCFullYear()}年{String(entry.date.getUTCMonth() + 1).padStart(2, '0')}月{String(entry.date.getUTCDate()).padStart(2, '0')}日
                  </p>
                  {entry.modifiedAt && (
                      <p className="text-xs text-muted-foreground">
                        修改于: {formatDateTimeWithOffset(entry.modifiedAt)}
                      </p>
                    )}
                </div>
              </div>
              {(aiEmotion || aiSummary) && (
                <div className="relative group mt-2 md:mt-0">
                  <div className="flex space-x-1.5 cursor-pointer">
                    {getEmotionIcons(aiEmotion || undefined).slice(0, 3).map(({component: IconComponent, name: iconName}, index) => {
                      return (
                        <span key={index} className="h-6 w-6 inline-block transition-transform hover:scale-110" 
                          style={{ color: getEmotionColor(iconName) }}
                        >
                          <IconComponent />
                        </span>
                      );
                    })}
                  </div>
                  <div className="absolute right-0 mt-2 w-64 p-4 bg-popover text-popover-foreground text-sm rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 pointer-events-none">
                    <div className="font-medium mb-1.5">AI 分析结果</div>
                    {aiEmotion && <p className="mb-1"><span className="font-medium">情绪:</span> {aiEmotion}</p>}
                    {aiSummary && <p className="line-clamp-3"><span className="font-medium">摘要:</span> {aiSummary}</p>}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="relative mb-8">
            {/* 翻译切换按钮 */}
            {translatedContent && (
              <div className="flex justify-end mb-4">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setShowTranslation(!showTranslation)}
                  className="gap-2 hover:text-primary transition-colors"
                >
                  {showTranslation ? '查看原文' : '查看翻译'}
                </Button>
              </div>
            )}
            
            {/* 日记内容显示 */}
            <div className="whitespace-pre-wrap text-base leading-relaxed text-foreground/90 text-justify">
              {showTranslation && translatedContent ? (
                // 显示翻译内容
                <div className="mb-4">
                  <p className="text-sm text-muted-foreground mb-2">英文翻译：</p>
                  {translatedContent.split('\n').map((line, index) => (
                    <p key={index} className="mb-2 last:mb-0">{line}</p>
                  ))}
                </div>
              ) : (
                // 显示原文
                entry.content.split('\n').map((line, index) => (
                  <p key={index} className="mb-2 last:mb-0">{line}</p>
                ))
              )}
            </div>
          </div>

          {entry.images && entry.images.length > 0 && (
            <div className={`grid gap-3 ${getGridClass(entry.images.length)}`}>
              {entry.images.map((image, index) => (
                <div
                  key={index}
                  className="relative aspect-square cursor-pointer overflow-hidden rounded-lg shadow-sm transition-all duration-300 hover:shadow-md hover:scale-105"
                  onClick={() => setSelectedImageIndex(index)}
                >
                  <Image
                    src={image}
                    alt={`日记图片 ${index + 1}`}
                    fill
                    className="object-cover transition-transform duration-700 hover:scale-110"
                  />
                </div>
              ))}
            </div>
          )}

          {selectedImageIndex !== null && entry.images && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
              <div className="relative max-h-[90vh] max-w-[90vw]">
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute -left-12 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 transition-all"
                  onClick={() =>
                    setSelectedImageIndex(
                      (selectedImageIndex - 1 + entry.images!.length) % entry.images!.length
                    )
                  }
                >
                  <ChevronLeftIcon className="h-8 w-8" />
                </Button>
                <Image
                  src={entry.images[selectedImageIndex]}
                  alt="放大查看"
                  width={1920}
                  height={1080}
                  className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute -right-12 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 transition-all"
                  onClick={() =>
                    setSelectedImageIndex((selectedImageIndex + 1) % entry.images!.length)
                  }
                >
                  <ChevronRightIcon className="h-8 w-8" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute -top-12 right-0 text-white hover:bg-white/20 transition-all"
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
        <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-4 text-destructive transition-all">
          <p className="font-medium">AI分析出错：</p>
          <p>{error}</p>
        </div>
      )}
      
      <div className="flex justify-between mt-6">
        <Button 
          variant="outline" 
          onClick={() => previousEntry && onNavigateToEntry(previousEntry)}
          disabled={!previousEntry}
          className="gap-2 transition-all hover:text-primary hover:bg-primary/5"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          上一篇
        </Button>
        <Button 
          variant="outline" 
          onClick={() => nextEntry && onNavigateToEntry(nextEntry)}
          disabled={!nextEntry}
          className="gap-2 transition-all hover:text-primary hover:bg-primary/5"
        >
          下一篇
          <ChevronRightIcon className="h-4 w-4" />
        </Button>
      </div>
      
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        entryTitle={entry?.subtitle || "未命名日记"}
      />
      
    </div>
  )
}

// 从情绪文本中提取情绪关键词并返回对应的图标组件
function getEmotionIcons(emotionText?: string): Array<{component: React.ComponentType; name: string}> {
  if (!emotionText) return [{component: SmileIcon, name: 'SmileIcon'}];
  
  const emotionIcons: Array<{component: React.ComponentType; name: string}> = [];
  
  // 首先尝试按逗号分隔情绪字符串，这适用于数据库中可能存储的逗号分隔情绪列表
  const emotions = emotionText.split(',').map(e => e.trim().toLowerCase());
  
  // 定义情绪关键词和对应的图标映射，同时存储图标名称
  const emotionMap = [
    { keywords: ['开心', '快乐', '高兴', '愉快', '愉悦', '兴奋', '欣喜'], icon: SmileIcon, iconName: 'SmileIcon' },
    { keywords: ['悲伤', '难过', '伤心', '忧郁', '惆怅'], icon: CloudRainIcon, iconName: 'CloudRainIcon' },
    { keywords: ['生气', '愤怒', '恼火', '暴躁'], icon: AlertCircleIcon, iconName: 'AlertCircleIcon' },
    { keywords: ['爱', '喜欢', '爱心', '倾心'], icon: HeartIcon, iconName: 'HeartIcon' },
    { keywords: ['惊讶', '震惊', '吃惊', '诧异'], icon: ZapIcon, iconName: 'ZapIcon' },
    { keywords: ['困惑', '疑惑', '迷茫', '不解'], icon: HelpCircleIcon, iconName: 'HelpCircleIcon' },
    { keywords: ['失望', '沮丧', '失落', '挫败'], icon: FrownIcon, iconName: 'FrownIcon' },
    { keywords: ['平静', '平和', '安宁', '宁静'], icon: MoonIcon, iconName: 'MoonIcon' },
    { keywords: ['热情', '热烈'], icon: SunIcon, iconName: 'SunIcon' },
    { keywords: ['浪漫', '温馨'], icon: FlowerIcon, iconName: 'FlowerIcon' },
    { keywords: ['放松', '悠闲'], icon: CoffeeIcon, iconName: 'CoffeeIcon' },
    { keywords: ['创意', '创新'], icon: PaletteIcon, iconName: 'PaletteIcon' },
    { keywords: ['焦虑', '不安'], icon: MehIcon, iconName: 'MehIcon' },
    { keywords: ['灵感', '启发'], icon: LightbulbIcon, iconName: 'LightbulbIcon' },
    { keywords: ['成就', '成功'], icon: AwardIcon, iconName: 'AwardIcon' },
    { keywords: ['学习', '阅读'], icon: BookOpenIcon, iconName: 'BookOpenIcon' },
    { keywords: ['旅行', '探索'], icon: CameraIcon, iconName: 'CameraIcon' },
    { keywords: ['音乐', '听歌'], icon: MusicIcon, iconName: 'MusicIcon' },
    { keywords: ['梦想', '目标'], icon: RocketIcon, iconName: 'RocketIcon' },
    { keywords: ['美好', '优秀'], icon: StarIcon, iconName: 'StarIcon' },
  ];
  
  // 检查每个拆分后的情绪是否匹配任何预定义情绪
  for (const emotion of emotions) {
    // 精确匹配情绪
    const exactMatch = emotionMap.find(item => 
      item.keywords.includes(emotion)
    );
    
    if (exactMatch) {
      emotionIcons.push({component: exactMatch.icon, name: exactMatch.iconName});
    } else {
      // 如果没有精确匹配，则进行包含匹配
      for (const { keywords, icon, iconName } of emotionMap) {
        if (keywords.some(keyword => emotion.includes(keyword))) {
          emotionIcons.push({component: icon, name: iconName});
          break;
        }
      }
    }
  }
  
  // 保持兼容性：如果通过逗号拆分没有找到任何情绪，尝试对整个文本进行关键词匹配
  if (emotionIcons.length === 0) {
    const lowerText = emotionText.toLowerCase();
    for (const { keywords, icon, iconName } of emotionMap) {
      if (keywords.some(keyword => lowerText.includes(keyword))) {
        emotionIcons.push({component: icon, name: iconName});
      }
    }
  }
  
  // 如果没有匹配的情绪，返回默认图标
  return emotionIcons.length > 0 ? emotionIcons : [{component: SmileIcon, name: 'SmileIcon'}];
}

// 获取情绪图标的颜色
function getEmotionColor(iconName?: string): string {
  const colorMap: Record<string, string> = {
    SmileIcon: '#EAB308', // 黄色 - 开心
    HeartIcon: '#EF4444', // 红色 - 爱心
    AlertCircleIcon: '#8B5CF6', // 紫色 - 生气
    CloudRainIcon: '#3B82F6', // 深蓝色 - 悲伤
    FrownIcon: '#3B82F6', // 蓝色 - 失望
    HelpCircleIcon: '#6B7280', // 灰色 - 困惑
    ZapIcon: '#F59E0B', // 橙色 - 惊讶
    MoonIcon: '#6366F1', // 靛蓝色 - 平静
    SunIcon: '#F59E0B', // 橙色 - 热情
    FlowerIcon: '#EC4899', // 粉红色 - 浪漫
    CoffeeIcon: '#8B5CF6', // 紫色 - 放松
    PaletteIcon: '#10B981', // 绿色 - 创意
    LightbulbIcon: '#F59E0B', // 橙色 - 灵感
    AwardIcon: '#8B5CF6', // 紫色 - 成就
    BookOpenIcon: '#3B82F6', // 蓝色 - 学习
    CameraIcon: '#10B981', // 绿色 - 旅行
    MusicIcon: '#EC4899', // 粉红色 - 音乐
    RocketIcon: '#10B981', // 绿色 - 梦想
    StarIcon: '#F59E0B', // 橙色 - 美好
    ActivityIcon: '#EF4444', // 红色 - 焦虑/不安
  };
  
  return colorMap[iconName || ''] || '#6B7280'; // 默认灰色
}
