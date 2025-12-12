import { supabase } from './supabaseClient'

// 类型定义
export interface ImportantEvent {
  id: string | number
  startDate: string
  endDate: string
  description: string
}

export interface AIAnalysisOpinion {
  id: string | number
  content: string
  analysis: string
}

export interface AIAnalysisSection {
  id: string | number
  title: string
  content: string
  opinions: AIAnalysisOpinion[]
}

export interface InvestmentImage {
  id: string | number
  url: string
  alt: string
}

export interface YearlySummary {
  year: string
  importantEvents: ImportantEvent[]
  aiAnalyses: AIAnalysisSection[]
  investmentImages: InvestmentImage[]
}

// 从Supabase格式转换为前端格式
function convertFromSupabaseImportantEvent(event: any): ImportantEvent {
  return {
    id: event.id,
    startDate: event.start_date,
    endDate: event.end_date,
    description: event.description
  }
}

function convertToSupabaseImportantEvent(event: Omit<ImportantEvent, 'id'>): any {
  return {
    start_date: event.startDate,
    end_date: event.endDate,
    description: event.description
  }
}

function convertFromSupabaseAIAnalysisOpinion(opinion: any): AIAnalysisOpinion {
  return {
    id: opinion.id,
    content: opinion.content,
    analysis: opinion.analysis
  }
}

function convertToSupabaseAIAnalysisOpinion(opinion: Omit<AIAnalysisOpinion, 'id'>): any {
  return {
    content: opinion.content,
    analysis: opinion.analysis
  }
}

function convertFromSupabaseAIAnalysisSection(section: any, opinions: any[]): AIAnalysisSection {
  return {
    id: section.id,
    title: section.title,
    content: section.content,
    opinions: opinions.map(convertFromSupabaseAIAnalysisOpinion)
  }
}

function convertToSupabaseAIAnalysisSection(section: Omit<AIAnalysisSection, 'id' | 'opinions'>): any {
  return {
    title: section.title,
    content: section.content
  }
}

function convertFromSupabaseInvestmentImage(image: any): InvestmentImage {
  return {
    id: image.id,
    url: image.url,
    alt: image.alt
  }
}

function convertToSupabaseInvestmentImage(image: Omit<InvestmentImage, 'id'>): any {
  return {
    url: image.url,
    alt: image.alt
  }
}

// 添加客户端缓存，减少重复请求
const yearlySummaryCache: Record<string, { data: YearlySummary | null; timestamp: number }> = {}
const CACHE_DURATION = 5 * 60 * 1000 // 5分钟缓存

// 获取指定年份的年度总结
export async function fetchYearlySummary(year: string): Promise<YearlySummary | null> {
  // 检查缓存
  const cached = yearlySummaryCache[year]
  const now = Date.now()
  
  // 如果缓存有效，直接返回
  if (cached && (now - cached.timestamp) < CACHE_DURATION) {
    console.log(`Using cached data for year ${year}`)
    return cached.data
  }

  try {
    console.log(`Fetching data for year ${year}...`)
    const startTime = performance.now()

    // 1. 获取年度总结记录
    const summaryStartTime = performance.now()
    const { data: summaryData, error: summaryError } = await supabase
      .from('yearly_summaries')
      .select('id')
      .eq('year', year)
      .single()
    console.log(`Summary fetch time: ${performance.now() - summaryStartTime}ms`)

    if (summaryError) {
      // 如果没有找到记录，返回null
      if (summaryError.code === 'PGRST116') {
        // 缓存空数据，避免重复请求
        yearlySummaryCache[year] = { data: null, timestamp: now }
        console.log(`No summary found for year ${year}, caching null`)
        return null
      }
      throw summaryError
    }

    const summaryId = summaryData.id

    // 2. 并行获取所有数据，减少网络请求次数
    const parallelStartTime = performance.now()
    const eventsPromise = supabase
      .from('important_events')
      .select('*')
      .eq('yearly_summary_id', summaryId)
      .order('start_date', { ascending: true })
      .then(result => {
        console.log(`Events fetch time: ${performance.now() - parallelStartTime}ms`)
        return result
      })
    
    const aiPromise = supabase
      .from('ai_analysis_sections')
      .select('* , ai_analysis_opinions(*)')
      .eq('yearly_summary_id', summaryId)
      .then(result => {
        console.log(`AI analysis fetch time: ${performance.now() - parallelStartTime}ms`)
        return result
      })
    
    const imagesPromise = supabase
      .from('investment_images')
      .select('*')
      .eq('yearly_summary_id', summaryId)
      .order('created_at', { ascending: true })
      .then(result => {
        console.log(`Images fetch time: ${performance.now() - parallelStartTime}ms`)
        return result
      })
    
    const [eventsResult, aiResult, imagesResult] = await Promise.all([eventsPromise, aiPromise, imagesPromise])
    console.log(`Parallel fetch time total: ${performance.now() - parallelStartTime}ms`)

    // 处理结果
    if (eventsResult.error) throw eventsResult.error
    if (aiResult.error) throw aiResult.error
    if (imagesResult.error) throw imagesResult.error

    // 构建AI分析数据
    const processStartTime = performance.now()
    const aiAnalyses: AIAnalysisSection[] = aiResult.data.map((section: any) => ({
      id: section.id,
      title: section.title,
      content: section.content,
      opinions: section.ai_analysis_opinions.map((opinion: any) => ({
        id: opinion.id,
        content: opinion.content,
        analysis: opinion.analysis
      }))
    }))
    console.log(`Data processing time: ${performance.now() - processStartTime}ms`)

    // 构建返回数据
    const result: YearlySummary = {
      year,
      importantEvents: eventsResult.data.map(convertFromSupabaseImportantEvent),
      aiAnalyses,
      investmentImages: imagesResult.data.map(convertFromSupabaseInvestmentImage)
    }

    // 缓存结果
    yearlySummaryCache[year] = { data: result, timestamp: now }
    console.log(`Total fetch time for year ${year}: ${performance.now() - startTime}ms`)

    return result
  } catch (error) {
    console.error('Error fetching yearly summary:', error)
    return null
  }
}

// 保存年度总结
export async function saveYearlySummary(year: string, data: YearlySummary): Promise<YearlySummary> {
  try {
    // 1. 清除该年份的缓存，确保数据一致性
    delete yearlySummaryCache[year]
    
    // 2. 获取或创建年度总结记录
    let summaryId: number
    const { data: existingSummary, error: existingError } = await supabase
      .from('yearly_summaries')
      .select('id')
      .eq('year', year)
      .single()

    if (existingError) {
      if (existingError.code === 'PGRST116') {
        // 不存在，创建新记录
        const { data: newSummary, error: newSummaryError } = await supabase
          .from('yearly_summaries')
          .insert([{ year }])
          .select('id')
          .single()

        if (newSummaryError) throw newSummaryError
        summaryId = newSummary.id
      } else {
        throw existingError
      }
    } else {
      // 已存在，使用现有ID
      summaryId = existingSummary.id
    }

    // 5. 返回最新数据
    const updatedSummary = await fetchYearlySummary(year)
    if (!updatedSummary) {
      throw new Error('Failed to fetch updated yearly summary')
    }

    return updatedSummary
  } catch (error) {
    console.error('Error saving yearly summary:', error)
    throw error
  }
}

// 添加重要事件
export async function addImportantEvent(year: string, event: Omit<ImportantEvent, 'id'>): Promise<ImportantEvent> {
  try {
    // 获取年度总结ID，如果不存在则创建
    let summaryId: number
    const { data: existingSummary, error: existingError } = await supabase
      .from('yearly_summaries')
      .select('id')
      .eq('year', year)
      .single()

    if (existingError) {
      if (existingError.code === 'PGRST116') {
        // 不存在，创建新记录
        const { data: newSummary, error: newSummaryError } = await supabase
          .from('yearly_summaries')
          .insert([{ year }])
          .select('id')
          .single()

        if (newSummaryError) throw newSummaryError
        summaryId = newSummary.id
      } else {
        throw existingError
      }
    } else {
      // 已存在，使用现有ID
      summaryId = existingSummary.id
    }

    // 插入新事件
    const { data: newEvent, error: newEventError } = await supabase
      .from('important_events')
      .insert([{
        ...convertToSupabaseImportantEvent(event),
        yearly_summary_id: summaryId
      }])
      .select('*')
      .single()

    if (newEventError) throw newEventError

    return convertFromSupabaseImportantEvent(newEvent)
  } catch (error) {
    console.error('Error adding important event:', error)
    throw error
  }
}

// 更新重要事件
export async function updateImportantEvent(eventId: number, event: Omit<ImportantEvent, 'id'>): Promise<ImportantEvent> {
  try {
    const { data: updatedEvent, error: updateError } = await supabase
      .from('important_events')
      .update(convertToSupabaseImportantEvent(event))
      .eq('id', eventId)
      .select('*')
      .single()

    if (updateError) throw updateError

    return convertFromSupabaseImportantEvent(updatedEvent)
  } catch (error) {
    console.error('Error updating important event:', error)
    throw error
  }
}

// 删除重要事件
export async function deleteImportantEvent(eventId: number): Promise<void> {
  try {
    const { error: deleteError } = await supabase
      .from('important_events')
      .delete()
      .eq('id', eventId)

    if (deleteError) throw deleteError
  } catch (error) {
    console.error('Error deleting important event:', error)
    throw error
  }
}

// 添加AI分析部分
export async function addAIAnalysisSection(year: string, section: Omit<AIAnalysisSection, 'id' | 'opinions'>): Promise<AIAnalysisSection> {
  try {
    // 获取年度总结ID，如果不存在则创建
    let summaryId: number
    const { data: existingSummary, error: existingError } = await supabase
      .from('yearly_summaries')
      .select('id')
      .eq('year', year)
      .single()

    if (existingError) {
      if (existingError.code === 'PGRST116') {
        // 不存在，创建新记录
        const { data: newSummary, error: newSummaryError } = await supabase
          .from('yearly_summaries')
          .insert([{ year }])
          .select('id')
          .single()

        if (newSummaryError) throw newSummaryError
        summaryId = newSummary.id
      } else {
        throw existingError
      }
    } else {
      // 已存在，使用现有ID
      summaryId = existingSummary.id
    }

    // 插入新分析部分
    const { data: newSection, error: newSectionError } = await supabase
      .from('ai_analysis_sections')
      .insert([{
        ...convertToSupabaseAIAnalysisSection(section),
        yearly_summary_id: summaryId
      }])
      .select('*')
      .single()

    if (newSectionError) throw newSectionError

    return convertFromSupabaseAIAnalysisSection(newSection, [])
  } catch (error) {
    console.error('Error adding AI analysis section:', error)
    throw error
  }
}

// 更新AI分析部分
export async function updateAIAnalysisSection(sectionId: number, section: Omit<AIAnalysisSection, 'id' | 'opinions'>): Promise<AIAnalysisSection> {
  try {
    // 更新分析部分
    const { data: updatedSection, error: updateError } = await supabase
      .from('ai_analysis_sections')
      .update(convertToSupabaseAIAnalysisSection(section))
      .eq('id', sectionId)
      .select('*')
      .single()

    if (updateError) throw updateError

    // 获取关联的观点
    const { data: opinions, error: opinionsError } = await supabase
      .from('ai_analysis_opinions')
      .select('*')
      .eq('ai_analysis_section_id', sectionId)

    if (opinionsError) throw opinionsError

    return convertFromSupabaseAIAnalysisSection(updatedSection, opinions)
  } catch (error) {
    console.error('Error updating AI analysis section:', error)
    throw error
  }
}

// 删除AI分析部分
export async function deleteAIAnalysisSection(sectionId: number): Promise<void> {
  try {
    // 删除分析部分会自动删除关联的观点（级联删除）
    const { error: deleteError } = await supabase
      .from('ai_analysis_sections')
      .delete()
      .eq('id', sectionId)

    if (deleteError) throw deleteError
  } catch (error) {
    console.error('Error deleting AI analysis section:', error)
    throw error
  }
}

// 添加AI分析观点
export async function addAIAnalysisOpinion(sectionId: number, opinion: Omit<AIAnalysisOpinion, 'id'>): Promise<AIAnalysisOpinion> {
  try {
    const { data: newOpinion, error: newOpinionError } = await supabase
      .from('ai_analysis_opinions')
      .insert([{
        ...convertToSupabaseAIAnalysisOpinion(opinion),
        ai_analysis_section_id: sectionId
      }])
      .select('*')
      .single()

    if (newOpinionError) throw newOpinionError

    return convertFromSupabaseAIAnalysisOpinion(newOpinion)
  } catch (error) {
    console.error('Error adding AI analysis opinion:', error)
    throw error
  }
}

// 更新AI分析观点
export async function updateAIAnalysisOpinion(opinionId: number, opinion: Omit<AIAnalysisOpinion, 'id'>): Promise<AIAnalysisOpinion> {
  try {
    const { data: updatedOpinion, error: updateError } = await supabase
      .from('ai_analysis_opinions')
      .update(convertToSupabaseAIAnalysisOpinion(opinion))
      .eq('id', opinionId)
      .select('*')
      .single()

    if (updateError) throw updateError

    return convertFromSupabaseAIAnalysisOpinion(updatedOpinion)
  } catch (error) {
    console.error('Error updating AI analysis opinion:', error)
    throw error
  }
}

// 删除AI分析观点
export async function deleteAIAnalysisOpinion(opinionId: number): Promise<void> {
  try {
    const { error: deleteError } = await supabase
      .from('ai_analysis_opinions')
      .delete()
      .eq('id', opinionId)

    if (deleteError) throw deleteError
  } catch (error) {
    console.error('Error deleting AI analysis opinion:', error)
    throw error
  }
}

// 添加投资图片
export async function addInvestmentImage(year: string, image: Omit<InvestmentImage, 'id'>): Promise<InvestmentImage> {
  try {
    // 获取年度总结ID，如果不存在则创建
    let summaryId: number
    const { data: existingSummary, error: existingError } = await supabase
      .from('yearly_summaries')
      .select('id')
      .eq('year', year)
      .single()

    if (existingError) {
      if (existingError.code === 'PGRST116') {
        // 不存在，创建新记录
        const { data: newSummary, error: newSummaryError } = await supabase
          .from('yearly_summaries')
          .insert([{ year }])
          .select('id')
          .single()

        if (newSummaryError) throw newSummaryError
        summaryId = newSummary.id
      } else {
        throw existingError
      }
    } else {
      // 已存在，使用现有ID
      summaryId = existingSummary.id
    }

    // 插入新图片
    const { data: newImage, error: newImageError } = await supabase
      .from('investment_images')
      .insert([{
        ...convertToSupabaseInvestmentImage(image),
        yearly_summary_id: summaryId
      }])
      .select('*')
      .single()

    if (newImageError) throw newImageError

    return convertFromSupabaseInvestmentImage(newImage)
  } catch (error) {
    console.error('Error adding investment image:', error)
    throw error
  }
}

// 更新投资图片
export async function updateInvestmentImage(imageId: number, image: Omit<InvestmentImage, 'id'>): Promise<InvestmentImage> {
  try {
    const { data: updatedImage, error: updateError } = await supabase
      .from('investment_images')
      .update(convertToSupabaseInvestmentImage(image))
      .eq('id', imageId)
      .select('*')
      .single()

    if (updateError) throw updateError

    return convertFromSupabaseInvestmentImage(updatedImage)
  } catch (error) {
    console.error('Error updating investment image:', error)
    throw error
  }
}

// 删除投资图片
export async function deleteInvestmentImage(imageId: number): Promise<void> {
  try {
    const { error: deleteError } = await supabase
      .from('investment_images')
      .delete()
      .eq('id', imageId)

    if (deleteError) throw deleteError
  } catch (error) {
    console.error('Error deleting investment image:', error)
    throw error
  }
}
