import OpenAI from 'openai';

// 从环境变量获取ModelScope API密钥
const MODELSCOPE_API_KEY = process.env.MODELSCOPE_TOKEN_API_KEY || '';

console.log('ModelScope API Key 设置状态:', MODELSCOPE_API_KEY ? '已设置' : '未设置');

// 初始化OpenAI客户端
const client = new OpenAI({
  baseURL: 'https://api-inference.modelscope.cn/v1',
  apiKey: MODELSCOPE_API_KEY,
});

// AI分析结果类型
export type AIAnalysisResult = {
  summary: string;
  emotion: string;
};

export type QuarterAnalysisResult = {
  overallImpression: string;
  themes: { name: string; weight: number }[];
  emotionTimeline: { date: string; label: string; intensity?: number }[];
  conflictCycles: { pattern: string; evidence: string[] }[];
  growthTrajectory: { period: string; description: string }[];
  needsMotivation: { need: string; rationale: string }[];
  keyTurningPoints: { period: string; description: string }[];
  suggestions: string[];
  subReports: []; // 直接分析模式不包含子报告
};

/**
 * 使用ModelScope大语言模型分析日记内容
 * @param content 日记内容
 * @returns 包含摘要和情绪的分析结果
 */
export async function analyzeDiaryWithAI(content: string): Promise<AIAnalysisResult> {
  try {
    console.log('开始AI分析，使用API密钥:', MODELSCOPE_API_KEY ? '已设置' : '未设置');
    
    // 构造提示词，要求生成30字以内的标题和情绪分析
    const prompt = `请分析以下日记内容，提供两个输出：
1. 标题：根据内容生成一个30字以内的简洁标题
2. 情绪：分析作者的情绪状态（如开心、快乐、悲伤、愤怒、平静、惊讶、困惑、失望、爱、热情、浪漫、放松、创意、灵感、成就、学习、旅行、音乐、梦想、美好等）

日记内容：
${content}

请严格按照以下JSON格式返回结果：
{
  "summary": "生成的标题",
  "emotion": "情绪分析结果"  // 请使用中文情绪词，可以返回多个情绪，用逗号分隔
}`;

    console.log('发送请求到ModelScope API...');
    console.log('使用的模型: deepseek-ai/DeepSeek-V3.2-Exp');
    
    const response = await client.chat.completions.create({
      model: 'deepseek-ai/DeepSeek-V3.2-Exp',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
    });

    console.log('收到API响应:', JSON.stringify(response, null, 2));
    
    // 获取AI响应
    const aiResponse = response.choices[0]?.message?.content;
    
    if (!aiResponse) {
      throw new Error('AI分析未返回有效结果');
    }

    console.log('AI响应内容:', aiResponse);
    
    // 尝试解析JSON响应
    try {
      const result = JSON.parse(aiResponse) as AIAnalysisResult;
      return result;
    } catch (parseError) {
      // 如果JSON解析失败，尝试从文本中提取信息
      console.warn('AI响应不是有效的JSON格式，尝试从文本中提取信息:', aiResponse);
      return extractInfoFromText(aiResponse);
    }
  } catch (error: any) {
    console.error('AI分析过程中发生错误:', error);
    
    // 提供更具体的错误信息
    if (error.message) {
      console.error('错误详情:', error.message);
    }
    
    if (error.cause) {
      console.error('错误原因:', error.cause);
    }
    
    // 检查是否是网络连接问题
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
      throw new Error('网络连接错误，请检查网络连接或稍后重试');
    }
    
    // 检查是否是认证问题
    if (error.response && error.response.status === 401) {
      throw new Error('API认证失败，请检查API密钥是否正确');
    }
    
    // 检查是否是API配额问题
    if (error.response && error.response.status === 429) {
      throw new Error('API调用次数超限，请稍后重试');
    }
    
    // 检查是否是其他HTTP错误
    if (error.response) {
      console.error('HTTP错误状态:', error.response.status);
      console.error('HTTP错误数据:', error.response.data);
      throw new Error(`API调用失败，状态码: ${error.response.status}`);
    }
    
    throw new Error('AI分析失败，请稍后重试');
  }
}

/**
 * 安全的JSON解析函数，处理AI响应格式问题
 */
function safeJsonParse<T>(response: string): { success: boolean; data: T | null; raw: string } {
  console.log('解析AI响应:', response.substring(0, 200) + '...');
  
  // 保存原始响应
  const raw = response;
  
  // 尝试直接解析JSON
  try {
    return { success: true, data: JSON.parse(response) as T, raw };
  } catch {
    console.log('直接JSON解析失败，尝试清理响应文本...');
  }
  
  // 清理AI响应，提取JSON部分
  try {
    // 查找JSON开始和结束位置
    let jsonStart = response.indexOf('{');
    let jsonEnd = response.lastIndexOf('}');
    
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      console.error('无法在AI响应中找到有效的JSON结构');
      return { success: false, data: null, raw };
    }
    
    const jsonStr = response.substring(jsonStart, jsonEnd + 1);
    console.log('提取的JSON片段:', jsonStr);
    
    return { success: true, data: JSON.parse(jsonStr) as T, raw };
  } catch (parseError) {
    console.error('清理后的JSON解析仍然失败:', parseError);
    
    // 最后的尝试：移除可能的markdown代码块标记
    try {
      const cleaned = response
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
      
      console.log('清理后的文本:', cleaned);
      return { success: true, data: JSON.parse(cleaned) as T, raw };
    } catch {
      console.error('所有JSON解析尝试都失败了');
      return { success: false, data: null, raw };
    }
  }
}

/**
 * 从非结构化文本中提取信息
 * @param text AI返回的非结构化文本
 * @returns AI分析结果
 */
function extractInfoFromText(text: string): AIAnalysisResult {
  // 简单的文本提取逻辑
  let summary = '无法生成摘要';
  let emotion = '未知情绪';
  
  // 尝试提取标题和情绪
  const summaryMatch = text.match(/标题[:：]?\s*(.+?)(?:\n|$)/i);
  const emotionMatch = text.match(/情绪[:：]?\s*(.+?)(?:\n|$)/i);
  
  if (summaryMatch && summaryMatch[1]) {
    summary = summaryMatch[1].trim();
    // 确保标题不超过30个字符
    if (summary.length > 30) {
      summary = summary.substring(0, 30) + '...';
    }
  }
  
  if (emotionMatch && emotionMatch[1]) {
    emotion = emotionMatch[1].trim();
  }
  
  return { summary, emotion };
}

/**
 * 生成季度分析的备用方案（直接分析版本）
 */
function generateQuarterFallbackDirect(entries: { id: number; date: Date; content: string; subtitle?: string | null }[]): QuarterAnalysisResult {
  const allText = entries.map(e => e.content).join('\n');
  const wordCount = allText.length;
  const avgLength = entries.length > 0 ? Math.round(wordCount / entries.length) : 0;
  
  // 分析情绪时间线
  const emotionTimeline = entries
    .slice()
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map(e => {
      const content = e.content.toLowerCase();
      let label = '中性';
      let intensity = 0.5;
      
      // 基于关键词识别情绪
      if (/开心|快乐|兴奋|满意|棒|好|喜欢|爱|幸福/.test(content)) {
        label = '积极';
        intensity = 0.8;
      } else if (/难过|伤心|失望|沮丧|痛苦|糟糕|哭|悲伤/.test(content)) {
        label = '消极';
        intensity = 0.7;
      } else if (/焦虑|担心|紧张|压力|烦躁|不安|恐惧/.test(content)) {
        label = '焦虑';
        intensity = 0.6;
      } else if (/平静|冷静|放松|安静|淡定/.test(content)) {
        label = '平静';
        intensity = 0.6;
      }
      
      return { 
        date: e.date.toISOString().split('T')[0], 
        label, 
        intensity 
      };
    });

  // 主题分析（基于关键词频率）
  const keywordCategories = {
    '工作学习': ['工作', '学习', '任务', '项目', '同事', '公司', '上学', '课程', '考试', '研究'],
    '感情生活': ['朋友', '家人', '感情', '爱情', '恋爱', '婚姻', '父母', '孩子', '友谊'],
    '个人成长': ['思考', '反思', '成长', '进步', '改变', '学习', '领悟', '理解', '目标', '梦想'],
    '生活日常': ['吃饭', '睡觉', '运动', '散步', '购物', '旅行', '电影', '音乐', '读书', '休息'],
    '情绪状态': ['开心', '难过', '焦虑', '平静', '愤怒', '兴奋', '失望', '满足', '孤独', '幸福']
  };

  const themeScores: { [key: string]: number } = {};
  Object.entries(keywordCategories).forEach(([category, keywords]) => {
    let score = 0;
    keywords.forEach(keyword => {
      const matches = allText.match(new RegExp(keyword, 'g'));
      if (matches) {
        score += matches.length;
      }
    });
    themeScores[category] = score;
  });

  const themes = Object.entries(themeScores)
    .filter(([_, score]) => score > 0)
    .sort(([_, a], [__, b]) => b - a)
    .slice(0, 5)
    .map(([name, weight]) => ({ name, weight }));

  // 生成整体印象
  const overallImpression = `本季度共记录${entries.length}篇日记，总计约${wordCount}字，平均每篇${avgLength}字。通过分析发现，主要关注${themes.length > 0 ? themes.slice(0, 3).map(t => t.name).join('、') : '生活各个方面'}。情绪变化方面，${emotionTimeline.length > 0 ? `共识别${emotionTimeline.length}个情绪记录点，整体情绪趋向${getOverallEmotionTrend(emotionTimeline)}` : '暂无明显情绪模式'}。`;

  // 识别循环模式
  const conflictCycles = identifyEmotionPatterns(emotionTimeline);

  // 成长轨迹分析
  const growthTrajectory = analyzeGrowthFromEmotions(emotionTimeline);

  // 需求动机分析
  const needsMotivation = inferNeedsFromContent(allText);

  // 关键转折点
  const keyTurningPoints = identifyTurningPoints(emotionTimeline);

  // 建议列表
  const suggestions = generateSuggestions(themes, emotionTimeline, overallImpression);

  return {
    overallImpression,
    themes: themes.length > 0 ? themes : [{ name: '生活记录', weight: 1 }],
    emotionTimeline,
    conflictCycles,
    growthTrajectory,
    needsMotivation,
    keyTurningPoints,
    suggestions,
    subReports: [] // 直接分析模式不包含子报告
  };
}

// 辅助函数
function getOverallEmotionTrend(emotionTimeline: { label: string; intensity: number }[]): string {
  if (emotionTimeline.length === 0) return '平稳';
  
  const positiveCount = emotionTimeline.filter(e => e.label === '积极').length;
  const negativeCount = emotionTimeline.filter(e => e.label === '消极' || e.label === '焦虑').length;
  const neutralCount = emotionTimeline.length - positiveCount - negativeCount;
  
  if (positiveCount > negativeCount) return '积极';
  if (negativeCount > positiveCount) return '消极';
  return '平稳';
}

function identifyEmotionPatterns(emotionTimeline: { date: string; label: string; intensity: number }[]): Array<{pattern: string; evidence: string[]}> {
  if (!emotionTimeline || emotionTimeline.length === 0) {
    return [{
      pattern: '无数据',
      evidence: ['没有数据可供分析']
    }];
  }
  
  if (emotionTimeline.length < 3) {
    return [{
      pattern: '数据不足',
      evidence: ['需要更多数据来识别循环模式']
    }];
  }

  // 简单的模式识别
  const patterns: Array<{pattern: string; evidence: string[]}> = [];
  let currentPattern: number[] = [];
  let lastEmotion = emotionTimeline[0].label;

  emotionTimeline.forEach((emotion, index) => {
    if (emotion.label === lastEmotion) {
      currentPattern.push(index);
    } else {
      if (currentPattern.length >= 2) {
        patterns.push({
          pattern: `${lastEmotion}情绪持续${currentPattern.length}次`,
          evidence: [`从${emotionTimeline[currentPattern[0]].date}到${emotionTimeline[currentPattern[currentPattern.length-1]].date}`]
        });
      }
      currentPattern = [index];
      lastEmotion = emotion.label;
    }
  });

  // 处理最后一个模式
  if (currentPattern.length >= 2) {
    patterns.push({
      pattern: `${lastEmotion}情绪持续${currentPattern.length}次`,
      evidence: [`从${emotionTimeline[currentPattern[0]].date}到${emotionTimeline[currentPattern[currentPattern.length-1]].date}`]
    });
  }

  return patterns.length > 0 ? patterns : [{
    pattern: '情绪相对平稳',
    evidence: ['没有明显的循环模式']
  }];
}

function analyzeGrowthFromEmotions(emotionTimeline: { date: string; label: string; intensity: number }[]) {
  if (emotionTimeline.length === 0) {
    return [{
      period: '分析期间',
      description: '数据不足，无法分析成长轨迹'
    }];
  }

  const firstHalf = emotionTimeline.slice(0, Math.floor(emotionTimeline.length / 2));
  const secondHalf = emotionTimeline.slice(Math.floor(emotionTimeline.length / 2));

  const firstAvgIntensity = firstHalf.reduce((sum, e) => sum + e.intensity, 0) / firstHalf.length;
  const secondAvgIntensity = secondHalf.reduce((sum, e) => sum + e.intensity, 0) / secondHalf.length;

  const intensityChange = secondAvgIntensity - firstAvgIntensity;

  return [{
    period: '本季度',
    description: intensityChange > 0.1 ? '情绪强度逐步提升，显示积极发展趋势' : 
                 intensityChange < -0.1 ? '情绪强度有所下降，需要关注心理状态' : 
                 '情绪状态保持相对稳定'
  }];
}

function inferNeedsFromContent(content: string) {
  const needCategories = {
    '社交需求': ['朋友', '家人', '交流', '分享', '陪伴'],
    '成就需求': ['目标', '成功', '进步', '完成', '达成'],
    '安全需求': ['稳定', '安全', '保护', '安心'],
    '自我实现': ['梦想', '兴趣', '创造', '表达', '实现']
  };

  const identifiedNeeds: { need: string; rationale: string; }[] = [];

  Object.entries(needCategories).forEach(([need, keywords]) => {
    const matches = keywords.filter(keyword => content.includes(keyword));
    if (matches.length > 0) {
      identifiedNeeds.push({
        need,
        rationale: `在日记中多次提及${matches.join('、')}等相关内容，反映了对${need}的追求`
      });
    }
  });

  return identifiedNeeds.length > 0 ? identifiedNeeds : [{
    need: '自我认知',
    rationale: '通过日记记录来了解自己的内心世界和成长轨迹'
  }];
}

function identifyTurningPoints(emotionTimeline: { date: string; label: string; intensity: number }[]) {
  if (emotionTimeline.length < 4) {
    return [{
      period: '数据不足',
      description: '需要更多数据来识别关键转折点'
    }];
  }

  const turningPoints = [];
  const emotions = emotionTimeline.map(e => ({ ...e }));
  
  // 寻找情绪显著变化的时点
  for (let i = 1; i < emotions.length - 1; i++) {
    const prev = emotions[i - 1];
    const curr = emotions[i];
    const next = emotions[i + 1];
    
    const intensityChange = Math.abs(curr.intensity - prev.intensity);
    const nextChange = Math.abs(next.intensity - curr.intensity);
    
    if (intensityChange > 0.3 || nextChange > 0.3) {
      turningPoints.push({
        period: curr.date,
        description: `${curr.label}情绪波动点，可能与${curr.date}的事件相关`
      });
    }
  }

  return turningPoints.length > 0 ? turningPoints : [{
    period: '季度内',
    description: '没有发现显著的情绪转折点，情绪变化相对平稳'
  }];
}

function generateSuggestions(themes: { name: string; weight: number }[], emotionTimeline: { label: string; intensity: number }[], overallImpression: string): string[] {
  const suggestions = [];
  
  // 基于主题的建议
  if (themes.some(t => t.name === '工作学习')) {
    suggestions.push('保持学习热情，合理安排工作与休息时间');
  }
  if (themes.some(t => t.name === '感情生活')) {
    suggestions.push('珍惜与家人朋友的相处时光，维护良好的人际关系');
  }
  if (themes.some(t => t.name === '个人成长')) {
    suggestions.push('继续保持反思习惯，定期回顾成长足迹');
  }

  // 基于情绪的建议
  const positiveRatio = emotionTimeline.filter(e => e.label === '积极').length / emotionTimeline.length;
  if (positiveRatio < 0.3) {
    suggestions.push('多关注生活中的美好事物，培养积极的心态');
  }

  // 基于整体印象的建议
  if (overallImpression.includes('焦虑') || overallImpression.includes('压力')) {
    suggestions.push('学会管理压力，尝试放松技巧如深呼吸、冥想等');
  }

  // 通用建议
  suggestions.push('继续保持日记记录习惯，为未来的分析积累数据');
  suggestions.push('定期回顾过往记录，观察自己的成长轨迹');

  return suggestions.slice(0, 5); // 最多5个建议
}

/**
 * 直接对整个季度进行分析（删除分月分析）
 * @param entries 日记条目
 * @returns 季度分析结果
 */
export async function analyzeQuarterWithMindTrace(entries: { id: number; date: Date; content: string; subtitle?: string | null }[]): Promise<{ result: QuarterAnalysisResult; rawResponse?: string; hasParsingError?: boolean }> {
  console.log(`开始季度分析，共${entries.length}篇日记`);
  
  if (entries.length === 0) {
    return {
      result: {
        overallImpression: '该季度没有日记记录，无法进行季度分析',
        themes: [{ name: '无记录', weight: 0 }],
        emotionTimeline: [],
        conflictCycles: [],
        growthTrajectory: [],
        needsMotivation: [],
        keyTurningPoints: [],
        suggestions: ['开始记录日记以获得季度分析'],
        subReports: []
      }
    };
  }

  // 合并所有日记内容进行季度整体分析
  const allContent = entries.map(entry => 
    `日期：${entry.date.toLocaleDateString()}\n内容：${entry.content}${entry.subtitle ? `\n副标题：${entry.subtitle}` : ''}`
  ).join('\n\n-------------------\n\n');

  console.log('开始直接季度分析，不再分月处理');
  
  try {
    // 直接对整个季度进行分析，修改提示词以获得更好的JSON格式响应
    const prompt = `请分析以下一个季度的所有日记内容，提供全面的心理分析：

${allContent}

非常重要：请严格按照要求的JSON格式返回结果，不要在JSON前后添加任何额外的文本或说明。确保所有字段都被填充，包括整体印象、主题、情绪时间线、循环模式、成长轨迹、需求动机、关键转折点和建议列表。

{"overallImpression": "整体印象（100-200字的综合总结）","themes": [{"name": "主题1", "weight": 85},{"name": "主题2", "weight": 70},{"name": "主题3", "weight": 60},{"name": "主题4", "weight": 45},{"name": "主题5", "weight": 30}],"emotionTimeline": [{"date": "2024-01-01", "label": "积极", "intensity": 0.8},{"date": "2024-01-15", "label": "平静", "intensity": 0.6}],"conflictCycles": [{"pattern": "发现的循环模式","evidence": ["证据1", "证据2"]}],"growthTrajectory": [{"period": "分析期间","description": "成长轨迹描述"}],"needsMotivation": [{"need": "需求描述","rationale": "需求理由"}],"keyTurningPoints": [{"period": "时间段","description": "转折点描述"}],"suggestions": ["建议1","建议2","建议3","建议4","建议5"]}`;

    console.log('发送季度分析请求到AI...');
    
    const response = await client.chat.completions.create({
      model: 'deepseek-ai/DeepSeek-V3.2-Exp',
      messages: [
        {
          role: 'system',
          content: '你是一个专业的心理分析助手，擅长通过日记内容分析用户的心理状态。请严格按照要求的JSON格式输出，不要包含任何其他文本。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.5, // 降低温度以获得更稳定的格式输出
      response_format: {
        type: "text" // 指定为文本输出
      }
    });

    const aiResponse = response.choices[0]?.message?.content;
    
    if (!aiResponse) {
      throw new Error('AI分析未返回有效结果');
    }

    console.log('季度分析响应:', aiResponse);
    
    // 使用安全的JSON解析
    const parseResult = safeJsonParse<Omit<QuarterAnalysisResult, 'subReports'>>(aiResponse);
    
    if (parseResult.success && parseResult.data) {
      console.log('季度分析完成，数据结构正确');
      return {
        result: {
          ...parseResult.data,
          subReports: [] // 不再包含子报告
        },
        rawResponse: parseResult.raw
      };
    } else {
      console.warn('AI响应解析失败，将解析失败的原始响应与备用分析一起返回');
      // 当JSON解析失败时，使用备用分析，但同时保存原始响应
      const fallbackResult = generateQuarterFallbackDirect(entries);
      
      // 修改overallImpression，添加解析失败的提示
      return {
        result: {
          ...fallbackResult,
          overallImpression: `${fallbackResult.overallImpression}\n\n注意：AI分析返回格式有误，已使用备用分析方案。`,
          suggestions: [...fallbackResult.suggestions, 'AI响应格式解析失败，已使用备用分析方案']
        },
        rawResponse: parseResult.raw,
        hasParsingError: true
      };
    }
  } catch (error: any) {
    console.error('季度分析失败，使用备用方案:', error);
    const fallbackResult = generateQuarterFallbackDirect(entries);
    return {
      result: {
        ...fallbackResult,
        overallImpression: `${fallbackResult.overallImpression}\n\n注意：AI分析过程中出现错误，已使用备用分析方案。`,
        suggestions: [...fallbackResult.suggestions, 'AI分析出错，已使用备用分析方案']
      },
      hasParsingError: true
    };
  }
}
