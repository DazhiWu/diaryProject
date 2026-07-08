# AI 日记分析应用

这是一个基于 Next.js 和 Supabase 构建的日记应用，具有 AI 分析功能。该应用可以分析日记内容并自动生成摘要和情绪分析，支持年度总结、匿名留言板等扩展功能。

## 功能特性

### 核心功能
- 创建、编辑、删除日记条目
- 上传图片到日记条目（支持最多18张图片，自动压缩）
- AI 分析日记内容，生成摘要和情绪标签
- 日记内容中英文翻译
- 响应式设计，支持移动端和桌面端
- 搜索和过滤功能
- 日历视图浏览日记

### 扩展功能
- **年度总结**：展示年度重要事件时间轴、AI读后感、年度照片
- **匿名留言板**：支持用户匿名留言和分页浏览
- **健康状况追踪**：记录生病异常状态，在日历中可视化显示
- **日记导出**：支持将日记导出为CSV格式
- **离线支持**：网络离线时使用localStorage缓存数据
- **音频记录**：支持上传和播放音频文件

### 权限系统
- **访客模式**：查看有限的日记内容（5条）
- **浏览者模式**：查看所有日记内容
- **管理员模式**：完整的读写权限，包括编辑、删除、AI分析等

## 项目架构

### 系统模块图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              应用层 (app/)                                  │
│  ┌─────────────┐  ┌─────────────────────────────────────────────────────┐  │
│  │ layout.tsx  │  │              page.tsx (主应用)                        │  │
│  │ 全局布局    │  │  - 状态管理 (entries, view, auth)                     │  │
│  └─────────────┘  │  - 路由控制 (list/calendar/new/detail/edit等)         │  │
│                   │  - 权限检查 (guest/viewer/admin)                       │  │
│                   └─────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                              API 路由层                              │    │
│  │  /api/ai-analysis   - AI分析接口        /api/translate    - 翻译接口 │    │
│  │  /api/diary-download - 日记导出接口      /api/test-env     - 环境测试 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              组件层 (components/)                           │
│  ┌───────────────────────────┐  ┌───────────────────────────────────────┐   │
│  │         ui/               │  │           业务组件                     │   │
│  │  - shadcn/ui 基础组件     │  │  - diary-entry        (日记编辑/创建) │   │
│  │  - button, card, dialog   │  │  - diary-detail       (日记详情)      │   │
│  │  - progress, slider       │  │  - diary-list         (日记列表)      │   │
│  │  - use-toast              │  │  - calendar-view      (日历视图)      │   │
│  └───────────────────────────┘  │  - yearly-summary     (年度总结)      │   │
│                                 │  - message-board      (留言板)        │   │
│                                 │  - auth-dialog        (认证对话框)    │   │
│                                 │  - health-condition-dialog (健康设置) │   │
│                                 │  - masonry-photo-gallery (图片画廊)   │   │
│                                 │  - diary-downloader   (日记导出)      │   │
│                                 │  - audio-uploader     (音频上传)      │   │
│                                 └───────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              业务逻辑层 (lib/)                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ supabaseClient│  │   diaryApi   │  │  aiAnalysis  │  │ imageHandler │    │
│  │ 数据库连接    │  │ 日记CRUD     │  │ AI分析/翻译  │  │ 图片上传/压缩│    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │messageBoardApi│  │yearlySummaryApi│ │ audioHandler │  │    utils     │    │
│  │ 留言板API    │  │ 年度总结API  │  │ 音频处理     │  │ 工具函数     │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Hooks 层 (hooks/)                             │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────┐                  │
│  │   useAuth    │  │useHealthConditions│ │   use-toast  │                  │
│  │ 认证状态管理  │  │ 健康状况数据管理  │  │ Toast通知    │                  │
│  └──────────────┘  └──────────────────┘  └──────────────┘                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              数据层 (Supabase)                              │
│  ┌──────────────────────┐  ┌──────────────────────┐                        │
│  │   diaryContent       │  │   diary_AI_analysis  │                        │
│  │ 日记内容表           │  │ AI分析结果表         │                        │
│  └──────────────────────┘  └──────────────────────┘                        │
│  ┌──────────────────────┐  ┌──────────────────────┐                        │
│  │ health_conditions    │  │ anonymous_messages   │                        │
│  │ 健康状况表           │  │ 匿名留言表           │                        │
│  └──────────────────────┘  └──────────────────────┘                        │
│  ┌──────────────────────┐  ┌──────────────────────┐                        │
│  │ yearly_summary_events│  │ yearly_summary_analysis│                       │
│  │ 年度事件表           │  │ 年度分析表           │                        │
│  └──────────────────────┘  └──────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 核心流程说明

#### 日记创建流程
```
用户填写内容 → 上传图片（可选）→ 图片压缩 → 上传Supabase Storage → 
获取图片URL → 保存日记到数据库 → 更新本地状态 → 显示成功提示
```

#### AI分析流程
```
用户点击AI分析 → 调用/api/ai-analysis → ModelScope API → 
返回分析结果 → 保存到数据库 → 更新日记标题 → 显示分析结果
```

#### 认证流程
```
用户输入密码 → 验证密码（admin/viewer）→ 更新localStorage → 
更新全局状态 → 重新加载数据 → 更新UI权限
```

## 技术选型说明

### 前端框架
- **Next.js 16**：React全栈框架，支持App Router和Edge Runtime
- **React 18**：用户界面库，使用React Hooks管理状态
- **TypeScript**：类型安全的JavaScript超集

### UI组件库
- **shadcn/ui**：基于Radix UI的高质量组件库
- **Radix UI**：无样式的可访问性组件原语
- **Lucide React**：精美的图标库

### 样式方案
- **Tailwind CSS 4**：原子化CSS框架
- **clsx + tailwind-merge**：条件类名处理

### 数据库和存储
- **Supabase**：PostgreSQL数据库和对象存储
- **Supabase Auth**：认证服务（当前项目使用简化的密码认证）

### AI服务
- **ModelScope API**：通过OpenAI兼容接口访问AI模型
- **DeepSeek-V3.2**：用于日记分析和翻译

### 状态管理
- **React Hooks**：useState, useEffect, useCallback
- **Context**：隐式传递状态（通过自定义hooks）
- **localStorage**：持久化认证状态和离线数据缓存

### 其他依赖
- **date-fns**：日期处理库
- **lz-string**：数据压缩（localStorage缓存）
- **sonner**：Toast通知组件
- **@radix-ui/react-progress**：进度条组件
- **@radix-ui/react-slider**：滑块组件

## 代码规范

### 文件命名
- **组件文件**：使用 PascalCase，如 `diary-entry.tsx`
- **工具函数**：使用 camelCase，如 `imageHandler.ts`
- **API路由**：统一使用 `route.ts`

### 目录结构
- `app/`：Next.js应用路由和页面
- `components/`：React组件（`ui/`子目录存放shadcn/ui组件）
- `lib/`：业务逻辑和工具函数
- `hooks/`：自定义React Hooks
- `public/`：静态资源

### 编码约定
- 使用 TypeScript 严格模式（`strict: true`）
- 组件使用函数式组件和 Hooks
- 避免在组件外部定义状态
- 使用 `useCallback` 优化回调函数
- 错误处理使用 try-catch 并提供用户友好的提示
- 使用 `toast` 组件显示操作反馈

### 状态管理规范
- 全局状态（如认证状态）使用自定义hooks + localStorage
- 组件内部状态使用 useState
- 异步数据加载使用 useEffect
- 避免不必要的状态更新和重复渲染

## 关键功能实现说明

### 1. 日记管理
- **分页查询**：使用 Supabase Range 查询实现服务器端分页
- **离线支持**：网络断开时自动切换到 localStorage 缓存
- **图片处理**：上传前自动压缩为 WebP 格式，限制最大宽度1920px

### 2. AI分析
- **双模式支持**：通过API路由调用，避免在浏览器中暴露API密钥
- **响应解析**：支持JSON和文本两种响应格式的解析
- **错误处理**：针对网络错误、认证错误、配额超限等情况提供详细提示

### 3. 权限系统
- **三级权限**：guest（访客）、viewer（浏览者）、admin（管理员）
- **本地认证**：使用localStorage存储认证状态，支持跨标签页同步
- **视图限制**：不同权限用户看到不同的功能按钮和数据范围

### 4. 年度总结
- **多视图模式**：事件支持列表/时间轴视图，分析支持卡片/大屏视图
- **图片瀑布流**：使用 masonry 布局展示年度照片
- **延迟加载**：核心数据和图片分开加载，优化性能

### 5. 匿名留言板
- **内容验证**：限制内容长度（2-1000字符），防止恶意内容
- **HTML转义**：使用 escapeHtml 防止XSS攻击
- **分页浏览**：支持分页导航，每页10条留言

### 6. 音频记录
- **音频上传**：支持上传音频文件到Supabase Storage
- **音频播放**：支持在线播放音频，使用 currentAudioRef 避免播放状态竞态
- **进度控制**：支持播放进度条拖动和时间显示
- **管理员权限**：管理员可删除音频记录

### 7. 日期选择器
- **原生日期输入**：使用 HTML5 `input type="date"` 实现日期选择
- **日期限制**：最早可选日期为2024年11月1日
- **跨页面统一**：健康状况设置和日记导出使用相同的日期选择UI

## 数据库设置

### 核心数据表

#### diaryContent 表（日记内容）
```sql
CREATE TABLE diaryContent (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  date DATE NOT NULL,
  subtitle TEXT,
  content TEXT NOT NULL,
  image_paths TEXT[],
  modifiedAt TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### diary_AI_analysis 表（AI分析结果）
```sql
CREATE TABLE diary_AI_analysis (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  diary_id BIGINT REFERENCES diaryContent(id),
  summary TEXT NOT NULL,
  emotion TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### health_conditions 表（健康状况）
```sql
CREATE TABLE health_conditions (
  id TEXT PRIMARY KEY,
  condition TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### anonymous_messages 表（匿名留言）
```sql
CREATE TABLE anonymous_messages (
  id BIGSERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  user_agent TEXT,
  ip_address TEXT
);
```

### 索引建议
```sql
-- 日记内容索引
CREATE INDEX idx_diary_content_date ON diaryContent(date DESC);
CREATE INDEX idx_diary_content_subtitle ON diaryContent(subtitle);

-- AI分析索引
CREATE INDEX idx_ai_analysis_diary_id ON diary_AI_analysis(diary_id);

-- 匿名留言索引
CREATE INDEX idx_anonymous_messages_created_at ON anonymous_messages(created_at DESC);
```

## 本地开发

### 环境要求
- Node.js 18 或更高版本
- npm 包管理器

### 安装依赖
```bash
npm install
```

### 环境变量配置
创建 `.env.local` 文件并添加以下环境变量：

```env
# Supabase 配置
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# ModelScope API 密钥
MODELSCOPE_TOKEN_API_KEY=your_modelscope_api_key

# 认证密码（可选，用于权限系统）
NEXT_PUBLIC_AUTH_PASSWORD_ADMIN=your_admin_password
NEXT_PUBLIC_AUTH_PASSWORD_VIEWER=your_viewer_password
```

### 启动开发服务器
```bash
npm run dev
```

访问 http://localhost:3000 查看应用。

### 构建项目
```bash
npm run build
```

### 自动化脚本使用

项目包含一个自动化测试脚本 `test_extra/add_diary.py`，用于自动添加日记并触发 AI 分析。

#### 使用步骤

1. **安装依赖**
   ```bash
   # 安装 playwright 库
   pip install playwright
   
   # 安装浏览器（首次运行需要）
   python -m playwright install chromium
   ```

2. **准备日记内容**
   在 `test_extra/diary.txt` 文件中编写日记内容：
   - 前三行会被跳过（用于标题等元数据）
   - 从第四行开始的内容会被处理并添加到日记中

3. **运行脚本**

   ```bash
   cd test_extra
   python add_diary.py
   ```

   脚本支持接收参数，以扩展功能：

   ```bash
   # 默认模式 - 正常执行原脚本内容
   python add_diary.py
   
   # asmr 模式 - 在 AI 分析完成后编辑 subtitle 添加 "-asmr"
   python add_diary.py asmr
   ```

#### 脚本功能

- **默认模式**：
  - 自动获取前一天的日期作为日记日期
  - 读取 `diary.txt` 文件内容并格式化
  - 自动完成用户认证
  - 创建新日记条目并保存
  - 自动点击最新日记卡片并触发 AI 分析

- **asmr 模式**（额外执行）：
  - 等待 AI 分析完成
  - 点击"编辑"按钮
  - 在 subtitle 输入框内容后添加 "-asmr" 文本
  - 点击"Update Entry"按钮保存更新

#### 注意事项

- 脚本使用 Playwright 控制 Chromium 浏览器，需要保持网络连接
- 认证密码已硬编码在脚本中，确保使用正确的密码
- 脚本运行时会打开浏览器窗口，完成后自动关闭
- asmr 模式需要等待 AI 分析完成，可能需要较长时间（最多等待 60 秒）

## 部署到 Cloudflare Workers（OpenNext）

### 部署步骤
1. 将代码推送到 GitHub 仓库
2. 在 Cloudflare Workers 中创建应用，并连接 GitHub 仓库
3. 配置部署命令：
   - 部署命令: `pnpm run deploy`
   - Node.js 版本: `22` 或更高版本
4. 首次本地验证可运行：
   ```bash
   pnpm run cf:build
   ```
5. 如需从本地直接部署，可运行：
   ```bash
   pnpm run deploy
   ```

### 环境变量配置
在 Cloudflare Workers 的 Variables and Secrets 中添加以下环境变量；同时确保构建阶段也能读取 `NEXT_PUBLIC_*` 变量：
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `MODELSCOPE_TOKEN_API_KEY`
- `NEXT_PUBLIC_AUTH_PASSWORD_ADMIN`（可选）
- `NEXT_PUBLIC_AUTH_PASSWORD_VIEWER`（可选）

## 常见问题解决方案

### 1. 500 错误
**原因**：环境变量未正确配置或 API 密钥无效
**解决方案**：
- 使用应用中的"测试环境"按钮检查环境变量配置
- 确保已正确设置 `MODELSCOPE_TOKEN_API_KEY` 环境变量
- 验证 API 密钥是否有效
- 检查 Cloudflare 控制台中的部署日志

### 2. AI分析失败
**原因**：网络连接问题或 API 配额超限
**解决方案**：
- 检查网络连接状态
- 验证 API 密钥是否正确配置
- 检查 API 调用次数是否超限
- 查看浏览器控制台获取详细错误信息

### 3. 图片上传失败
**原因**：图片大小超过限制或格式不支持
**解决方案**：
- 确保图片格式为常见格式（JPG、PNG、WebP等）
- 图片会自动压缩，无需手动处理
- 最多支持上传18张图片

### 4. 本地运行正常但部署后出错
**原因**：环境变量未正确设置或构建配置问题
**解决方案**：
- 在 Cloudflare Pages 中正确配置所有必需的环境变量
- 确保环境变量名称拼写正确
- API 密钥值正确无误
- 检查构建日志中的错误信息

### 5. 日记日期显示异常
**原因**：时区处理不一致
**解决方案**：
- 项目使用 UTC 时区处理日期
- 修改时间会显示带+16小时偏移的时间（适应特定时区需求）

### 7. 音频播放"加载失败"提示但能正常播放
**原因**：音频对象事件监听器竞态问题
**解决方案**：
- 使用 `currentAudioRef` 跟踪当前活动的音频对象
- 在事件处理器中检查当前音频是否仍然是活动引用

### 8. 日期选择器UI显示异常
**原因**：`react-day-picker` 版本不兼容或样式缺失
**解决方案**：
- 当前项目已切换为原生 `input type="date"` 日期选择器
- 确保日期输入框有 `min` 属性限制最早日期

## 维护更新指南

### 添加新功能
1. 创建新组件或页面
2. 在 `lib/` 中添加对应的 API 函数
3. 更新主应用状态管理（如有需要）
4. 添加必要的数据库表（如有需要）

### 更新依赖
1. 运行 `npm update` 更新所有依赖
2. 检查 shadcn/ui 组件是否需要更新：`npx shadcn@latest update`
3. 运行 `npm run build` 确保项目能正常构建
4. 测试核心功能是否正常工作

### 代码优化建议
1. **性能优化**：
   - 使用 React.memo 优化组件渲染
   - 对频繁调用的函数使用 useMemo/useCallback
   - 图片使用懒加载
   - 考虑使用 Suspense 进行数据预取

2. **安全优化**：
   - 增强密码认证机制（当前使用简单的密码比对）
   - 添加请求频率限制
   - 加强输入验证和XSS防护

3. **代码组织**：
   - 将大型组件拆分为更小的组件
   - 提取重复的逻辑到自定义hooks
   - 添加类型定义文件

4. **错误处理**：
   - 统一错误处理机制
   - 添加全局错误边界
   - 完善错误日志记录

### 扩展建议
- 实现日记分享功能
- 添加标签系统
- 支持多语言国际化
- 实现数据备份和恢复功能

## 版本变更记录

### 2026-06-23
**代码审计与清理**
- 对项目代码进行全面审计，识别未使用的依赖包和组件
- 将7个未使用的UI组件移至 `components/ui/backup/` 目录：`checkbox.tsx`, `collapsible.tsx`, `dropdown-menu.tsx`, `separator.tsx`, `sheet.tsx`, `skeleton.tsx`, `switch.tsx`
- 将5个未使用的依赖包移至 `package.json` 的 `unusedDependencies` 字段：`@radix-ui/react-checkbox`, `@radix-ui/react-collapsible`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-separator`, `@radix-ui/react-switch`
- 删除重复的 `package-lock.json` 文件（外层目录和内层项目各一个），保留 `pnpm-lock.yaml`

**警告修复**
- 修复 DialogContent 无障碍警告：为所有使用 DialogContent 的组件添加 `DialogDescription` 属性
  - `health-condition-dialog.tsx`: "设置生病期间的异常记录，便于统计健康数据。"
  - `auth-dialog.tsx`: "请输入认证密码以获取管理员权限。"
  - `yearly-summary.tsx`: 为重要事件对话框和AI读后感对话框添加描述

**构建验证**
- 验证项目构建成功，所有页面和组件均能正常构建
- 修复开发服务器启动问题：通过显式 `cd` 到正确目录确保 Turbopack 正确识别项目根目录

### 2026-06-22
**代码清理**
- 移除未使用的依赖包：`@hookform/resolvers`, `next-intl`, `zod`, `autoprefixer`, `tw-animate-css`, `baseline-browser-mapping`, `@vercel/analytics`, `react-day-picker`, `@radix-ui/react-popover`, `@radix-ui/react-accordion`, `@radix-ui/react-aspect-ratio`, `@radix-ui/react-avatar`, `@radix-ui/react-context-menu`, `@radix-ui/react-menubar`, `@radix-ui/react-navigation-menu`, `@radix-ui/react-radio-group`, `@radix-ui/react-scroll-area`, `@radix-ui/react-tabs`, `@radix-ui/react-toggle`, `@radix-ui/react-toggle-group`, `@radix-ui/react-tooltip`, `@radix-ui/react-hover-card`, `cmdk`, `embla-carousel-react`, `input-otp`, `react-hook-form`, `react-resizable-panels`, `recharts`, `vaul`, `tailwindcss-animate`
- 删除未使用的UI组件：`accordion.tsx`, `aspect-ratio.tsx`, `avatar.tsx`, `carousel.tsx`, `chart.tsx`, `command.tsx`, `context-menu.tsx`, `drawer.tsx`, `empty.tsx`, `field.tsx`, `form.tsx`, `hover-card.tsx`, `input-otp.tsx`, `item.tsx`, `kbd.tsx`, `menubar.tsx`, `navigation-menu.tsx`, `pagination.tsx`, `radio-group.tsx`, `resizable.tsx`, `scroll-area.tsx`, `sidebar.tsx`, `slider.tsx`, `tabs.tsx`, `toggle.tsx`, `toggle-group.tsx`, `tooltip.tsx`, `toaster.tsx`, `use-mobile.tsx`, `calendar.tsx`, `popover.tsx`, `alert.tsx`, `badge.tsx`, `breadcrumb.tsx`, `button-group.tsx`, `input-group.tsx`, `table.tsx`

**功能修复**
- 修复音频播放状态竞态问题：在 `message-board.tsx` 中添加 `currentAudioRef` 引用，避免切换音频时显示错误提示
- 修复日期选择器UI：将 `react-day-picker` 替换为原生 `input type="date"`，统一健康状况设置和日记导出页面的日期选择UI
- 添加日期限制：健康状况设置和日记导出页面的日期选择器最早可选日期限制为2024年11月1日

**配置更新**
- 移除 `@vercel/analytics` 依赖（项目部署在 Cloudflare，无需 Vercel 分析）
- 将文本"待开发音频记录"修改为"音频记录"

## 许可证

MIT
