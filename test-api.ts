import OpenAI from 'openai';

// 从环境变量获取ModelScope API密钥
const MODELSCOPE_API_KEY = process.env.MODELSCOPE_TOKEN_API_KEY || '';

console.log('ModelScope API Key 设置状态:', MODELSCOPE_API_KEY ? '已设置' : '未设置');

// 初始化OpenAI客户端
const client = new OpenAI({
  baseURL: 'https://api-inference.modelscope.cn/v1',
  apiKey: MODELSCOPE_API_KEY,
  dangerouslyAllowBrowser: true,
});

async function testAPI() {
  try {
    console.log('开始测试ModelScope API连接...');
    
    const response = await client.chat.completions.create({
      model: 'deepseek-ai/DeepSeek-V3.2-Exp',
      messages: [
        {
          role: 'user',
          content: '你好，请回复"测试成功"四个字'
        }
      ],
      temperature: 0.7,
    });

    console.log('API响应:', response);
    
    // 获取AI响应
    const aiResponse = response.choices[0]?.message?.content;
    console.log('AI响应内容:', aiResponse);
    
  } catch (error) {
    console.error('API测试失败:', error);
  }
}

testAPI();