import OpenAI from 'openai';
import { getRuntimeEnvValue } from '@/lib/runtimeEnv';

export type AIAnalysisResult = {
  summary: string;
  emotion: string;
};

const MODELSCOPE_TIMEOUT_MS = 30_000;

function safeErrorMetadata(error: unknown) {
  if (!error || typeof error !== 'object') return { name: 'UnknownError' };
  const value = error as { name?: unknown; status?: unknown; code?: unknown; response?: { status?: unknown } };
  return {
    name: typeof value.name === 'string' ? value.name : 'Error',
    status: typeof value.status === 'number' ? value.status : typeof value.response?.status === 'number' ? value.response.status : undefined,
    code: typeof value.code === 'string' ? value.code : undefined,
  };
}

async function createModelScopeClient() {
  const apiKey = await getRuntimeEnvValue('MODELSCOPE_TOKEN_API_KEY');

  if (!apiKey) {
    throw new Error('MODELSCOPE_TOKEN_API_KEY is not configured');
  }

  return new OpenAI({
    baseURL: 'https://api-inference.modelscope.cn/v1',
    apiKey,
  });
}

export async function analyzeDiaryWithAI(content: string): Promise<AIAnalysisResult> {
  try {
    const client = await createModelScopeClient();

    const prompt = `请仔细分析以下日记内容，先进行深度思考，然后提供两个输出：
1. 标题：根据内容生成一个30字以内的简洁标题
2. 情绪：分析作者的情绪状态，可以返回多个中文情绪词，用逗号分隔

深度思考要求：
- 仔细阅读日记内容，理解上下文和隐含情感
- 分析作者的真实感受和情绪变化
- 考虑日记中提到的事件对作者情绪的影响
- 识别关键词和情感表达

日记内容：
${content}

请严格按照以下 JSON 格式返回结果：
{
  "summary": "生成的标题",
  "emotion": "情绪分析结果"
}`;

    const response = await (client.chat.completions.create as any)({
      model: 'deepseek-ai/DeepSeek-V3.2',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      stream: false,
      extra_body: {
        enable_thinking: true,
      },
    }, { signal: AbortSignal.timeout(MODELSCOPE_TIMEOUT_MS) });

    const aiResponse = response.choices[0]?.message?.content;
    if (!aiResponse) {
      throw new Error('AI分析未返回有效结果');
    }

    return parseAIAnalysisResult(aiResponse);
  } catch (error: any) {
    console.error('[modelscope]', { operation: 'analyze', outcome: 'failed', ...safeErrorMetadata(error) });

    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
      throw new Error('网络连接错误，请检查网络连接或稍后重试');
    }

    if ((error.response && error.response.status === 401) || error.status === 401) {
      throw new Error('API认证失败，请检查API密钥是否正确');
    }

    if ((error.response && error.response.status === 429) || error.status === 429) {
      throw new Error('API调用次数超限，请稍后重试');
    }

    if (error.response) {
      throw new Error(`API调用失败，状态码: ${error.response.status}`);
    }

    if (error.status) {
      throw new Error(`API调用失败，状态码: ${error.status}`);
    }

    throw new Error(error.message || 'AI分析失败，请稍后重试');
  }
}

export async function translateDiaryContent(content: string): Promise<string> {
  try {
    const client = await createModelScopeClient();

    const prompt = `请将以下中文日记内容准确、流畅地翻译成英文。保持原文的语气和情感，确保翻译质量。

日记内容：
${content}

请直接返回英文翻译结果，不要添加任何额外的解释或说明。`;

    const response = await (client.chat.completions.create as any)({
      model: 'deepseek-ai/DeepSeek-V3.2',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      stream: false,
      extra_body: {
        enable_thinking: true,
      },
    }, { signal: AbortSignal.timeout(MODELSCOPE_TIMEOUT_MS) });

    const aiResponse = response.choices[0]?.message?.content;

    if (!aiResponse) {
      throw new Error('翻译未返回有效结果');
    }

    return aiResponse.trim();
  } catch (error: any) {
    console.error('[modelscope]', { operation: 'translate', outcome: 'failed', ...safeErrorMetadata(error) });

    if ((error.response && error.response.status === 401) || error.status === 401) {
      throw new Error('API认证失败，请检查API密钥是否正确');
    }

    if ((error.response && error.response.status === 429) || error.status === 429) {
      throw new Error('API调用次数超限，请稍后重试');
    }

    throw new Error(error.message || '翻译失败，请稍后重试');
  }
}

function parseAIAnalysisResult(text: string): AIAnalysisResult {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');

  try {
    const result = JSON.parse(cleaned) as Partial<AIAnalysisResult>;

    if (result.summary && result.emotion) {
      return {
        summary: result.summary,
        emotion: result.emotion,
      };
    }
  } catch {
    console.warn('[modelscope]', { operation: 'parse-analysis', outcome: 'fallback' });
  }

  return extractInfoFromText(text);
}

function extractInfoFromText(text: string): AIAnalysisResult {
  let summary = '无法生成摘要';
  let emotion = '未知情绪';

  const summaryMatch = text.match(/(?:标题|summary)[:：]?\s*(.+?)(?:\n|$)/i);
  const emotionMatch = text.match(/(?:情绪|emotion)[:：]?\s*(.+?)(?:\n|$)/i);

  if (summaryMatch?.[1]) {
    summary = summaryMatch[1].trim();

    if (summary.length > 30) {
      summary = `${summary.substring(0, 30)}...`;
    }
  }

  if (emotionMatch?.[1]) {
    emotion = emotionMatch[1].trim();
  }

  return { summary, emotion };
}
