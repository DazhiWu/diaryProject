# AI 日记分析应用

这是一个基于 Next.js 和 Supabase 构建的日记应用，具有 AI 分析功能。该应用可以分析日记内容并自动生成摘要和情绪分析。

## 功能特性

- 创建、编辑、删除日记条目
- 上传图片到日记条目
- AI 分析日记内容，生成摘要和情绪标签
- 响应式设计，支持移动端和桌面端
- 搜索和过滤功能
- 日历视图浏览日记

## 技术栈

- Next.js 16
- TypeScript
- Tailwind CSS
- Supabase (数据库和认证)
- ModelScope AI API (AI 分析)
- shadcn/ui 组件库

## 本地开发

### 环境要求

- Node.js 18 或更高版本
- pnpm 包管理器

### 安装依赖

```bash
pnpm install
```

### 环境变量配置

创建 `.env.local` 文件并添加以下环境变量：

```env
# Supabase 配置(ProjectSettings-Data API) 填写到co为止，不需要后面的rest/v1
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url

# Supabase 配置(ProjectSettings-API KEY-Legacy anon,service_role API keys)
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# ModelScope API 密钥
MODELSCOPE_TOKEN_API_KEY=your_modelscope_api_key
```

### 启动开发服务器

```bash
pnpm dev
```

访问 http://localhost:3000 查看应用。

## 部署到 Cloudflare Pages

### 部署步骤

1. 将代码推送到 GitHub 仓库
2. 在 Cloudflare Dashboard 中创建新的 Pages 项目
3. 连接 GitHub 账户并选择相应的仓库
4. 配置构建设置：
   - 构建命令: `npm run build`
   - 构建输出目录: `.next`
5. 点击"部署站点"

### 环境变量配置

本项目需要设置以下环境变量才能正常工作：

#### MODELSCOPE_TOKEN_API_KEY

这是访问 ModelScope AI API 所需的密钥。

##### 获取方式：
1. 访问 [ModelScope 官网](https://modelscope.cn/)
2. 注册并登录账户
3. 在个人设置中生成 API 密钥

##### 在 Cloudflare Pages 中设置：
1. 进入 Cloudflare Dashboard
2. 选择您的项目
3. 点击"设置"选项卡
4. 在左侧菜单中选择"环境变量"
5. 点击"添加变量"
6. 添加以下变量：
   - 变量名: `MODELSCOPE_TOKEN_API_KEY`
   - 值: 您的 ModelScope API 密钥
7. 点击"保存"

### 故障排除

#### 500 错误

如果遇到 500 错误，请按以下步骤进行排查：

1. 使用应用中的"Test Env"按钮检查环境变量配置
2. 确保已正确设置 `MODELSCOPE_TOKEN_API_KEY` 环境变量
3. 验证 API 密钥是否有效
4. 检查 Cloudflare 控制台中的部署日志

#### 本地运行正常但部署后出错

这种情况通常是由于环境变量未正确设置导致的。请确保：

1. 在 Cloudflare Pages 中正确配置了所有必需的环境变量
2. 环境变量名称拼写正确
3. API 密钥值正确无误

### 重新部署

在修改环境变量后，需要重新部署项目以使更改生效：

1. 在 Cloudflare Dashboard 中进入您的项目
2. 点击"部署历史"
3. 选择最新的部署
4. 点击"重试部署"按钮

或者，您也可以通过向仓库推送新的提交来触发新的部署。

## 数据库设置

本项目使用 Supabase 作为数据库。您需要创建以下表：

### diaryContent 表

```sql
CREATE TABLE diaryContent (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  date DATE NOT NULL,
  subtitle TEXT,
  content TEXT NOT NULL,
  images TEXT[],
  modifiedAt TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### diary_AI_analysis 表

```sql
CREATE TABLE diary_AI_analysis (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  diary_id BIGINT REFERENCES diaryContent(id),
  summary TEXT NOT NULL,
  emotion TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 项目结构

```
app/              # Next.js 应用路由
components/       # React 组件
lib/              # 工具函数和业务逻辑
public/           # 静态资源
styles/           # 全局样式
```

## 许可证

MIT