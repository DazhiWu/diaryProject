import {
  createModelScopeClient,
  MODELSCOPE_ALL_MODELS_FAILED_MESSAGE,
  MODELSCOPE_TIMEOUT_MS,
  ModelScopeConfigurationError,
  ModelScopeModelsExhaustedError,
  runModelScopeChatFallback,
  safeModelScopeErrorMetadata,
} from '@/lib/server/modelScopeClient';
import { HttpError } from '@/lib/server/session';

export type AIAnalysisResult = {
  summary: string;
  emotion: string;
};

type DiaryModelScopeOperation = 'analyze' | 'translate';

type ModelScopeChatResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

function readModelScopeResponseContent(
  response: unknown,
  operation: DiaryModelScopeOperation,
  model: string,
): string {
  const choices = response && typeof response === 'object'
    ? (response as ModelScopeChatResponse).choices
    : undefined;

  if (!Array.isArray(choices) || choices.length === 0) {
    console.error('[modelscope]', {
      operation,
      outcome: 'invalid-success-response',
      model,
      reason: 'missing-choices',
    });
  }

  const content = choices?.[0]?.message?.content;
  const trimmed = typeof content === 'string' ? content.trim() : '';
  if (!trimmed) throw new HttpError(502, '模型返回结果为空');
  return trimmed;
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

    const aiResponse = await runModelScopeChatFallback({
      operation: 'analyze',
      attempt: async (model) => {
        const response = await (client.chat.completions.create as any)({
          model,
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

        return readModelScopeResponseContent(response, 'analyze', model);
      },
    });

    return parseAIAnalysisResult(aiResponse);
  } catch (error: unknown) {
    if (error instanceof HttpError) throw error;
    if (error instanceof ModelScopeModelsExhaustedError) {
      throw new HttpError(502, MODELSCOPE_ALL_MODELS_FAILED_MESSAGE);
    }
    if (error instanceof ModelScopeConfigurationError) {
      throw new HttpError(503, error.message);
    }
    console.error('[modelscope]', { operation: 'analyze', outcome: 'failed', ...safeModelScopeErrorMetadata(error) });
    throw new Error(error instanceof Error ? error.message : 'AI分析失败，请稍后重试');
  }
}

export async function translateDiaryContent(content: string): Promise<string> {
  try {
    const client = await createModelScopeClient();

    const prompt = `请将以下中文日记内容准确、流畅地翻译成英文。保持原文的语气和情感，确保翻译质量。

日记内容：
${content}

请直接返回英文翻译结果，不要添加任何额外的解释或说明。`;

    return await runModelScopeChatFallback({
      operation: 'translate',
      attempt: async (model) => {
        const response = await (client.chat.completions.create as any)({
          model,
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

        return readModelScopeResponseContent(response, 'translate', model);
      },
    });
  } catch (error: unknown) {
    if (error instanceof HttpError) throw error;
    if (error instanceof ModelScopeModelsExhaustedError) {
      throw new HttpError(502, MODELSCOPE_ALL_MODELS_FAILED_MESSAGE);
    }
    if (error instanceof ModelScopeConfigurationError) {
      throw new HttpError(503, error.message);
    }
    console.error('[modelscope]', { operation: 'translate', outcome: 'failed', ...safeModelScopeErrorMetadata(error) });
    throw new Error(error instanceof Error ? error.message : '翻译失败，请稍后重试');
  }
}

function parseAIAnalysisResult(text: string): AIAnalysisResult {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');

  let value: unknown;
  try {
    value = JSON.parse(cleaned);
  } catch {
    throw new HttpError(502, '模型返回结果格式错误');
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(502, '模型返回结果格式错误');
  }

  const result = value as Partial<AIAnalysisResult>;
  const summary = typeof result.summary === 'string' ? result.summary.trim() : '';
  const emotion = typeof result.emotion === 'string' ? result.emotion.trim() : '';
  if (!summary || !emotion) throw new HttpError(502, '模型返回结果格式错误');

  return { summary, emotion };
}
