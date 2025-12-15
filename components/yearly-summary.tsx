"use client"

import { useState, useEffect } from 'react'

// Local type definition for form opinion
interface Opinion {
  id: string | number
  content: string
  analysis: string
}
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Card } from './ui/card'
import { PlusIcon, Trash2Icon, EditIcon, ChevronLeftIcon, ChevronRightIcon } from './icons'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { Label } from './ui/label'
import { toast } from 'sonner'
import {
  fetchYearlySummary,
  fetchInvestmentImages,
  addImportantEvent,
  updateImportantEvent,
  deleteImportantEvent,
  addAIAnalysisSection,
  updateAIAnalysisSection,
  deleteAIAnalysisSection,
  addAIAnalysisOpinion,
  deleteAIAnalysisOpinion,
  addInvestmentImage,
  type YearlySummary as YearlySummaryType,
  type ImportantEvent,
  type AIAnalysisSection
} from '@/lib/yearlySummaryApi'



const YearlySummary: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  // 年份选择状态
  const [selectedYear, setSelectedYear] = useState('2024')
  const availableYears = ['2024', '2025']

  // 状态管理
  const [yearlySummary, setYearlySummary] = useState<YearlySummaryType>({
    year: selectedYear,
    importantEvents: [],
    aiAnalyses: [],
    investmentImages: []
  })
  
  // 加载状态
  const [isLoading, setIsLoading] = useState(false)
  // 图片加载状态
  const [isImagesLoading, setIsImagesLoading] = useState(false)
  
  // 当前图片索引
  const [currentImageIndex, setCurrentImageIndex] = useState(0)

  // 模态框状态
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false)
  const [isAnalysisDialogOpen, setIsAnalysisDialogOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<ImportantEvent | null>(null)
  const [editingAnalysis, setEditingAnalysis] = useState<AIAnalysisSection | null>(null)
  
  // 数据加载 - 核心数据（重要事件和AI分析）
  useEffect(() => {
    const loadCoreData = async () => {
      setIsLoading(true)
      try {
        const data = await fetchYearlySummary(selectedYear)
        if (data) {
          setYearlySummary(data)
        } else {
          // 如果没有数据，初始化一个空的年度总结
          setYearlySummary({
            year: selectedYear,
            importantEvents: [],
            aiAnalyses: [],
            investmentImages: []
          })
        }
        setCurrentImageIndex(0)
      } catch (error) {
        console.error('Error loading yearly summary:', error)
        toast.error('加载年度总结失败')
      } finally {
        setIsLoading(false)
      }
    }
    
    loadCoreData()
  }, [selectedYear])

  // 数据加载 - 图片数据（延迟加载，核心数据加载完成后再加载）
  useEffect(() => {
    // 只有当核心数据加载完成后，才加载图片
    if (!isLoading) {
      const loadImages = async () => {
        setIsImagesLoading(true)
        try {
          const images = await fetchInvestmentImages(selectedYear)
          setYearlySummary(prev => ({
            ...prev,
            investmentImages: images
          }))
          setCurrentImageIndex(0)
        } catch (error) {
          console.error('Error loading investment images:', error)
          // 图片加载失败不显示错误提示，因为不影响核心功能
        } finally {
          setIsImagesLoading(false)
        }
      }
      
      loadImages()
    }
  }, [selectedYear, isLoading])

  // 表单状态
  const [eventForm, setEventForm] = useState({
    startDate: '',
    endDate: '',
    description: ''
  })

  const [analysisForm, setAnalysisForm] = useState({
    title: '',
    content: '',
    opinions: [
      {
        id: '',
        content: '',
        analysis: ''
      }
    ]
  })

  // 处理添加观点
  const handleAddOpinion = () => {
    setAnalysisForm(prev => ({
      ...prev,
      opinions: [
        ...prev.opinions,
        {
          id: '',
          content: '',
          analysis: ''
        }
      ]
    }))
  }

  // 处理删除观点
  const handleRemoveOpinion = (index: number) => {
    if (analysisForm.opinions.length > 1) {
      setAnalysisForm(prev => ({
        ...prev,
        opinions: prev.opinions.filter((_, i) => i !== index)
      }))
    }
  }

  // 处理更新观点
  const handleUpdateOpinion = (index: number, field: keyof Opinion, value: string) => {
    setAnalysisForm(prev => ({
      ...prev,
      opinions: prev.opinions.map((opinion, i) => 
        i === index ? { ...opinion, [field]: value } : opinion
      )
    }))
  }

  // 处理重要事件
  const handleAddEvent = () => {
    setEditingEvent(null)
    // 初始化日期为当前选择年份的1月1日
    const initialDate = `${selectedYear}-01-01`
    setEventForm({ startDate: initialDate, endDate: initialDate, description: '' })
    setIsEventDialogOpen(true)
  }

  const handleEditEvent = (event: ImportantEvent) => {
    setEditingEvent(event)
    
    // 确保年份是当前选择的年份
    const formatDateWithCurrentYear = (dateStr: string) => {
      const [, month, day] = dateStr.split('-')
      return `${selectedYear}-${month}-${day}`
    }
    
    setEventForm({
      startDate: formatDateWithCurrentYear(event.startDate),
      endDate: formatDateWithCurrentYear(event.endDate),
      description: event.description
    })
    setIsEventDialogOpen(true)
  }

  const handleDeleteEvent = async (id: number) => {
    try {
      await deleteImportantEvent(id)
      // 更新本地状态
      setYearlySummary(prev => ({
        ...prev,
        importantEvents: prev.importantEvents.filter(event => event.id !== id)
      }))
      toast.success('删除重要事件成功')
    } catch (error) {
      console.error('Error deleting important event:', error)
      toast.error('删除重要事件失败')
    }
  }

  const handleSaveEvent = async () => {
    try {
      let updatedEvent: ImportantEvent
      if (editingEvent) {
        // 更新现有事件
        updatedEvent = await updateImportantEvent(Number(editingEvent.id), eventForm)
        setYearlySummary(prev => ({
          ...prev,
          importantEvents: prev.importantEvents.map(event => 
            event.id === editingEvent.id ? updatedEvent : event
          )
        }))
      } else {
        // 添加新事件
        updatedEvent = await addImportantEvent(selectedYear, eventForm)
        setYearlySummary(prev => ({
          ...prev,
          importantEvents: [...prev.importantEvents, updatedEvent]
        }))
      }
      setIsEventDialogOpen(false)
      toast.success('保存重要事件成功')
    } catch (error) {
      console.error('Error saving important event:', error)
      toast.error('保存重要事件失败')
    }
  }

  // 处理AI分析
  const handleAddAnalysis = () => {
    setEditingAnalysis(null)
    setAnalysisForm({
      title: '',
      content: '',
      opinions: [
        {
          id: '',
          content: '',
          analysis: ''
        }
      ]
    })
    setIsAnalysisDialogOpen(true)
  }

  const handleEditAnalysis = (analysis: AIAnalysisSection) => {
    setEditingAnalysis(analysis)
    setAnalysisForm({
      title: analysis.title,
      content: analysis.content,
      opinions: analysis.opinions.map(opinion => ({
        id: opinion.id.toString(),
        content: opinion.content,
        analysis: opinion.analysis
      }))
    })
    setIsAnalysisDialogOpen(true)
  }

  const handleDeleteAnalysis = async (id: number) => {
    try {
      await deleteAIAnalysisSection(id)
      // 更新本地状态
      setYearlySummary(prev => ({
        ...prev,
        aiAnalyses: prev.aiAnalyses.filter(analysis => analysis.id !== id)
      }))
      toast.success('删除AI读后感成功')
    } catch (error) {
      console.error('Error deleting AI读后感:', error)
      toast.error('删除AI读后感失败')
    }
  }

  const handleSaveAnalysis = async () => {
    try {
      let updatedAnalysis: AIAnalysisSection
      if (editingAnalysis) {
        // 更新现有分析
        updatedAnalysis = await updateAIAnalysisSection(Number(editingAnalysis.id), {
          title: analysisForm.title,
          content: analysisForm.content
        })
        
        // 处理观点的更新
        // 先删除所有现有观点
        for (const opinion of editingAnalysis.opinions) {
          await deleteAIAnalysisOpinion(Number(opinion.id))
        }
        
        // 再添加新观点（过滤掉空观点）
        const validOpinions = analysisForm.opinions.filter(opinion => 
          opinion.content.trim() !== '' || opinion.analysis.trim() !== ''
        );
        const newOpinions = await Promise.all(
          validOpinions.map(async (opinion) => {
            return await addAIAnalysisOpinion(Number(updatedAnalysis.id), {
              content: opinion.content,
              analysis: opinion.analysis
            })
          })
        )
        
        updatedAnalysis.opinions = newOpinions
        
        setYearlySummary(prev => ({
          ...prev,
          aiAnalyses: prev.aiAnalyses.map(analysis => 
            analysis.id === editingAnalysis.id ? updatedAnalysis : analysis
          )
        }))
      } else {
        // 添加新分析
        updatedAnalysis = await addAIAnalysisSection(selectedYear, {
          title: analysisForm.title,
          content: analysisForm.content
        })
        
        // 添加观点（过滤掉空观点）
        const validOpinions = analysisForm.opinions.filter(opinion => 
          opinion.content.trim() !== '' || opinion.analysis.trim() !== ''
        );
        const newOpinions = await Promise.all(
          validOpinions.map(async (opinion) => {
            return await addAIAnalysisOpinion(Number(updatedAnalysis.id), {
              content: opinion.content,
              analysis: opinion.analysis
            })
          })
        )
        
        updatedAnalysis.opinions = newOpinions
        
        setYearlySummary(prev => ({
          ...prev,
          aiAnalyses: [...prev.aiAnalyses, updatedAnalysis]
        }))
      }
      setIsAnalysisDialogOpen(false)
      toast.success('保存AI读后感成功')
    } catch (error) {
      console.error('Error saving AI读后感:', error)
      toast.error('保存AI读后感失败')
    }
  }

  // 处理投资图片
  const handlePrevImage = () => {
    setCurrentImageIndex(prev => 
      prev === 0 ? 
        (yearlySummary.investmentImages.length || 0) - 1 : 
        prev - 1
    )
  }

  const handleNextImage = () => {
    setCurrentImageIndex(prev => 
      prev === (yearlySummary.investmentImages.length || 0) - 1 ? 
        0 : 
        prev + 1
    )
  }

  // 图片上传处理
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      try {
        const reader = new FileReader()
        reader.onload = async (e) => {
          const newImage = {
            url: e.target?.result as string,
            alt: file.name
          }
          
          // 保存到数据库
          const savedImage = await addInvestmentImage(selectedYear, newImage)
          
          // 更新本地状态
          setYearlySummary(prev => ({
            ...prev,
            investmentImages: [...prev.investmentImages, savedImage]
          }))
          setCurrentImageIndex(yearlySummary.investmentImages.length)
          toast.success('图片上传成功')
        }
        reader.readAsDataURL(file)
      } catch (error) {
        console.error('Error uploading image:', error)
        toast.error('图片上传失败')
      }
    }
  }

  return (
    <div className="space-y-8">
      {/* 返回按钮和年份选择 */}
      <div className="flex justify-between items-center">
        <Button
          variant="outline"
          onClick={onBack}
          className="gap-2"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          返回日记首页
        </Button>
        
        {/* 年份选择器 */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">选择年份：</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="px-3 py-1 border rounded-md bg-background text-foreground"
            disabled={isLoading}
          >
            {availableYears.map(year => (
              <option key={year} value={year}>
                {year}年
              </option>
            ))}
          </select>
        </div>
      </div>

      <h1 className="text-3xl font-bold text-center">{selectedYear}年度总结</h1>
      
      {/* 加载状态 */}
      {isLoading ? (
        <div className="flex justify-center items-center py-8">
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            <p className="text-muted-foreground">加载数据中...</p>
          </div>
        </div>
      ) : (
        <>
          {/* 重要事件栏目 */}
          <Card className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">重要事件</h2>
              <Button
                variant="default"
                onClick={handleAddEvent}
                className="gap-2"
              >
                <PlusIcon className="h-4 w-4" />
                添加事件
              </Button>
            </div>
            
            <div className="space-y-3">
              {yearlySummary.importantEvents.map((event) => {
                // 格式化日期为mm/dd格式
                const formatDate = (dateStr: string) => {
                  const [, month, day] = dateStr.split('-')
                  return `${month}/${day}`
                }
                
                return (
                  <div
                    key={event.id}
                    className="flex items-center gap-3 p-3 border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex gap-2 text-sm text-muted-foreground">
                        <span>{formatDate(event.startDate)}</span>
                        <span>至</span>
                        <span>{formatDate(event.endDate)}</span>
                      </div>
                      <div className="text-base font-medium">{event.description}</div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditEvent(event)}
                      >
                        <EditIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteEvent(Number(event.id))}
                      >
                        <Trash2Icon className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* AI读后感栏目 */}
          <Card className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">AI读后感</h2>
              <Button
                variant="default"
                onClick={handleAddAnalysis}
                className="gap-2"
              >
                <PlusIcon className="h-4 w-4" />
                添加内容
              </Button>
            </div>
            
            <div className="space-y-4">
              {yearlySummary.aiAnalyses.map((analysis) => (
                <div
                  key={analysis.id}
                  className="p-4 border rounded-lg"
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-xl font-bold">{analysis.title}</h3>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditAnalysis(analysis)}
                      >
                        <EditIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteAnalysis(Number(analysis.id))}
                      >
                        <Trash2Icon className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="mb-4">
                    {analysis.content}
                  </div>
                  
                  {analysis.opinions.length > 0 && (
                    <div className="space-y-3">
                      {analysis.opinions.map((opinion) => (
                        <div key={opinion.id} className="p-3 bg-muted rounded-lg">
                          <div>
                            {opinion.content ? (
                              <>
                                <strong>{opinion.content}</strong>：{opinion.analysis}
                              </>
                            ) : (
                              opinion.analysis
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* 投资栏目 - 2024年度不显示 */}
          {selectedYear !== '2024' && (
            <Card className="p-6">
              <h2 className="text-2xl font-bold mb-4">投资</h2>
              
              <div className="space-y-4">
                {/* 显示图片轮播或加载状态 */}
                <div className="relative">
                  <div className="flex justify-center items-center mb-4">
                    {/* 只有当图片数量大于1时才显示导航按钮 */}
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handlePrevImage}
                      className="absolute left-0"
                      disabled={yearlySummary.investmentImages.length <= 1 || isImagesLoading}
                    >
                      <ChevronLeftIcon className="h-6 w-6" />
                    </Button>
                    
                    <div className="w-full max-w-md aspect-video border rounded-lg overflow-hidden bg-muted relative">
                      {/* 图片加载中状态 */}
                      {isImagesLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-muted">
                          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                          <span className="ml-2 text-sm text-muted-foreground">图片加载中...</span>
                        </div>
                      )}
                      
                      {/* 图片内容 */}
                      {!isImagesLoading && yearlySummary.investmentImages.length > 0 ? (
                        <img
                          src={yearlySummary.investmentImages[currentImageIndex].url}
                          alt={yearlySummary.investmentImages[currentImageIndex].alt}
                          className="w-full h-full object-cover"
                        />
                      ) : !isImagesLoading && yearlySummary.investmentImages.length === 0 ? (
                        <div className="h-full flex items-center justify-center">
                          <span className="text-muted-foreground">暂无图片</span>
                        </div>
                      ) : null}
                    </div>
                    
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleNextImage}
                      className="absolute right-0"
                      disabled={yearlySummary.investmentImages.length <= 1 || isImagesLoading}
                    >
                      <ChevronRightIcon className="h-6 w-6" />
                    </Button>
                  </div>
                  
                  {/* 图片计数 - 只有当图片加载完成且有图片时才显示 */}
                  {!isImagesLoading && yearlySummary.investmentImages.length > 0 && (
                    <div className="text-center text-sm text-muted-foreground">
                      {currentImageIndex + 1} / {yearlySummary.investmentImages.length}
                    </div>
                  )}
                </div>
                
                {/* 上传图片按钮始终显示 */}
                <div className="flex justify-center">
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <Button variant="outline">
                      上传图片
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </>
      )}

      {/* 重要事件对话框 */}
      <Dialog open={isEventDialogOpen} onOpenChange={setIsEventDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEvent ? '编辑重要事件' : '添加重要事件'}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">起始日期</Label>
              <Input
                id="startDate"
                type="date"
                value={eventForm.startDate}
                onChange={(e) => setEventForm({ ...eventForm, startDate: e.target.value })}
                min={`${selectedYear}-01-01`}
                max={`${selectedYear}-12-31`}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="endDate">结束日期</Label>
              <Input
                id="endDate"
                type="date"
                value={eventForm.endDate}
                onChange={(e) => setEventForm({ ...eventForm, endDate: e.target.value })}
                min={`${selectedYear}-01-01`}
                max={`${selectedYear}-12-31`}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">事件简介</Label>
              <Textarea
                id="description"
                value={eventForm.description}
                onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEventDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveEvent}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI读后感对话框 */}
      <Dialog open={isAnalysisDialogOpen} onOpenChange={setIsAnalysisDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAnalysis ? '编辑AI读后感' : '添加AI读后感内容'}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="analysisTitle">小标题</Label>
              <Input
                id="analysisTitle"
                value={analysisForm.title}
                onChange={(e) => setAnalysisForm({ ...analysisForm, title: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="analysisContent">内容</Label>
              <Textarea
                id="analysisContent"
                value={analysisForm.content}
                onChange={(e) => setAnalysisForm({ ...analysisForm, content: e.target.value })}
                rows={4}
              />
            </div>
            
            {/* 观点列表 */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Label>观点</Label>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleAddOpinion}
                  className="gap-2"
                >
                  <PlusIcon className="h-3 w-3" />
                  添加观点
                </Button>
              </div>
              
              {analysisForm.opinions.map((opinion, index) => (
                <div key={index} className="space-y-3 p-3 border rounded-lg">
                  <div className="flex justify-between items-center">
                    <Label className="font-medium">观点 {index + 1}</Label>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveOpinion(index)}
                      className="text-destructive"
                    >
                      <Trash2Icon className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor={`opinion-content-${index}`}>观点内容</Label>
                    <Input
                      id={`opinion-content-${index}`}
                      value={opinion.content}
                      onChange={(e) => handleUpdateOpinion(index, 'content', e.target.value)}
                      placeholder="输入观点内容"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor={`opinion-analysis-${index}`}>观点分析</Label>
                    <Textarea
                      id={`opinion-analysis-${index}`}
                      value={opinion.analysis}
                      onChange={(e) => handleUpdateOpinion(index, 'analysis', e.target.value)}
                      placeholder="输入观点分析"
                      rows={3}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAnalysisDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveAnalysis}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default YearlySummary