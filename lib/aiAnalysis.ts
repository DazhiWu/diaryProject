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



/**
 * 使用ModelScope大语言模型分析日记内容
 * @param content 日记内容
 * @returns 包含摘要和情绪的分析结果
 */
export async function analyzeDiaryWithAI(content: string): Promise<AIAnalysisResult> {
  try {
    console.log('开始AI分析，使用API密钥:', MODELSCOPE_API_KEY ? '已设置' : '未设置');
    
    // 构造提示词，要求生成30字以内的标题和情绪分析，并添加深度思考引导
    const prompt = `请仔细分析以下日记内容，先进行深度思考，然后提供两个输出：
1. 标题：根据内容生成一个30字以内的简洁标题
2. 情绪：分析作者的情绪状态（如开心、快乐、悲伤、愤怒、平静、惊讶、困惑、失望、爱、热情、浪漫、放松、创意、灵感、成就、学习、旅行、音乐、梦想、美好等）

深度思考要求：
- 仔细阅读日记内容，理解上下文和隐含情感
- 分析作者的真实感受和情绪变化
- 考虑日记中提到的事件对作者情绪的影响
- 识别关键词和情感表达

日记内容：
${content}

请严格按照以下JSON格式返回结果：
{
  "summary": "生成的标题",
  "emotion": "情绪分析结果"  // 请使用中文情绪词，可以返回多个情绪，用逗号分隔
}`;

    console.log('发送请求到ModelScope API...');
    console.log('使用的模型: deepseek-ai/DeepSeek-V3.2');
    
    const response = await (client.chat.completions.create as any)({
      model: 'deepseek-ai/DeepSeek-V3.2',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      stream: false,
      extra_body: {
        enable_thinking: true
      }
    });

    console.log('收到API响应:', JSON.stringify(response, null, 2));
    
    // 获取AI响应
    const aiResponse = response.choices[0]?.message?.content;
    // 使用类型断言访问reasoning_content字段
    const reasoningContent = response.choices[0]?.message?.reasoning_content;
    
    if (reasoningContent) {
      console.log('AI思考过程:', reasoningContent);
    }
    
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
    if ((error.response && error.response.status === 401) || error.status === 401) {
      throw new Error('API认证失败，请检查API密钥是否正确');
    }
    
    // 检查是否是API配额问题
    if ((error.response && error.response.status === 429) || error.status === 429) {
      throw new Error('API调用次数超限，请稍后重试');
    }
    
    // 检查是否是其他HTTP错误
    if (error.response) {
      console.error('HTTP错误状态:', error.response.status);
      console.error('HTTP错误数据:', error.response.data);
      throw new Error(`API调用失败，状态码: ${error.response.status}`);
    } else if (error.status) {
      console.error('HTTP错误状态:', error.status);
      throw new Error(`API调用失败，状态码: ${error.status}`);
    }
    
    throw new Error('AI分析失败，请稍后重试');
  }
}


/**
 * 使用ModelScope大语言模型将中文日记内容翻译为英文
 * @param content 中文日记内容
 * @returns 英文翻译结果
 */
export async function translateDiaryContent(content: string): Promise<string> {
  try {
    console.log('开始翻译日记内容，使用API密钥:', MODELSCOPE_API_KEY ? '已设置' : '未设置');
    
    // 构造翻译提示词，要求将中文日记内容准确翻译成流畅的英文
    const prompt = `请将以下中文日记内容准确、流畅地翻译成英文。保持原文的语气和情感，确保翻译质量。

日记内容：
${content}

请直接返回英文翻译结果，不要添加任何额外的解释或说明。`;

    console.log('发送翻译请求到ModelScope API...');
    console.log('使用的模型: deepseek-ai/DeepSeek-V3.2');
    
    const response = await (client.chat.completions.create as any)({
      model: 'deepseek-ai/DeepSeek-V3.2',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      stream: false,
      extra_body: {
        enable_thinking: true
      }
    });

    console.log('收到翻译API响应:', JSON.stringify(response, null, 2));
    
    // 获取AI响应
    const aiResponse = response.choices[0]?.message?.content;
    
    if (!aiResponse) {
      throw new Error('翻译未返回有效结果');
    }

    console.log('翻译结果:', aiResponse);
    
    // 返回翻译结果，去除可能的首尾空白
    return aiResponse.trim();
  } catch (error: any) {
    console.error('翻译过程中发生错误:', error);
    
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
    if ((error.response && error.response.status === 401) || error.status === 401) {
      throw new Error('API认证失败，请检查API密钥是否正确');
    }
    
    // 检查是否是API配额问题
    if ((error.response && error.response.status === 429) || error.status === 429) {
      throw new Error('API调用次数超限，请稍后重试');
    }
    
    // 检查是否是其他HTTP错误
    if (error.response) {
      console.error('HTTP错误状态:', error.response.status);
      console.error('HTTP错误数据:', error.response.data);
      throw new Error(`API调用失败，状态码: ${error.response.status}`);
    } else if (error.status) {
      console.error('HTTP错误状态:', error.status);
      throw new Error(`API调用失败，状态码: ${error.status}`);
    }
    
    throw new Error('翻译失败，请稍后重试');
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




