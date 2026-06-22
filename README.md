# 致致日记 - AI 日记分析应用

这是一个基于 Next.js 和 Supabase 构建的日记应用，具有 AI 分析、情绪识别、翻译等功能。

## 功能特性

### 核心功能
- ✅ 创建、编辑、删除日记条目
- ✅ 上传图片到日记条目
- ✅ AI 分析日记内容，生成标题和情绪标签
- ✅ 日记内容翻译功能
- ✅ 日历视图浏览日记
- ✅ 搜索和过滤功能

### 扩展功能
- ✅ 用户认证系统（访客/查看者/管理员三级权限）
- ✅ 匿名留言板
- ✅ 音频留言板
- ✅ 健康状况追踪（日历标记）
- ✅ 年度总结报告
- ✅ 日记数据导出下载
- ✅ 离线模式（localStorage备份）
- ✅ 响应式设计，支持移动端和桌面端

## 技术栈

| 分类 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js | 16.x |
| 语言 | TypeScript | 5.x |
| 样式 | Tailwind CSS | 4.x |
| 组件库 | shadcn/ui | latest |
| 数据库 | Supabase | latest |
| AI 服务 | ModelScope API（OpenAI兼容层） | latest |
| 图标 | Lucide React | latest |
| 表单 | React Hook Form | latest |

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
# Supabase 配置
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# ModelScope API 密钥
MODELSCOPE_TOKEN_API_KEY=your_modelscope_api_key
```

### 启动开发服务器

```bash
pnpm dev
```

访问 http://localhost:3000 查看应用。

### 构建项目

```bash
pnpm build
```

### 代码检查

```bash
pnpm lint
```

## 部署到 Cloudflare Pages

### 部署步骤

1. 将代码推送到 GitHub 仓库
2. 在 Cloudflare Dashboard 中创建新的 Pages 项目
3. 连接 GitHub 账户并选择相应的仓库
4. 配置构建设置：
   - 构建命令: `pnpm build`
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
  image_paths TEXT[],
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

### anonymous_messages 表

```sql
CREATE TABLE anonymous_messages (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### health_conditions 表

```sql
CREATE TABLE health_conditions (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  date DATE NOT NULL,
  sleep_hours DECIMAL,
  exercise_minutes INT,
  water_intake DECIMAL,
  mood TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 项目结构

```
app/                      # Next.js 应用路由
  api/                    # API 端点
    ai-analysis/          # AI 分析接口
    diary-download/       # 日记下载接口
    test-env/             # 环境测试接口
    translate/            # 翻译接口
  globals.css             # 全局样式
  layout.tsx              # 根布局
  loading.tsx             # 加载状态
  page.tsx                # 首页

components/               # React 组件
  ui/                     # shadcn/ui 组件
  anonymous-message-board.tsx   # 匿名留言板组件
  audio-uploader.tsx      # 音频上传组件
  auth-dialog.tsx         # 认证弹窗组件
  calendar-view.tsx       # 日历视图组件
  delete-confirm-dialog.tsx     # 删除确认弹窗
  diary-detail.tsx        # 日记详情组件
  diary-downloader.tsx    # 日记下载组件
  diary-entry.tsx         # 日记条目组件
  diary-list.tsx          # 日记列表组件
  health-condition-dialog.tsx   # 健康状况弹窗
  icons.tsx               # 自定义图标
  masonry-photo-gallery.tsx     # 图片画廊组件
  message-board.tsx       # 留言板组件
  pagination.tsx          # 分页组件
  search-bar.tsx          # 搜索栏组件
  theme-provider.tsx      # 主题提供者
  yearly-summary.tsx      # 年度总结组件

hooks/                    # 自定义 Hooks
  useAuth.ts              # 认证 Hook
  useHealthConditions.ts  # 健康状况 Hook

lib/                      # 工具函数和业务逻辑
  aiAnalysis.ts           # AI 分析逻辑
  audioApi.ts             # 音频 API 封装
  audioHandler.ts         # 音频处理工具
  diaryApi.ts             # 日记 API 封装
  imageHandler.ts         # 图片处理工具
  messageBoardApi.ts      # 留言板 API 封装
  supabaseClient.ts       # Supabase 客户端配置
  utils.ts                # 通用工具函数
  yearlySummaryApi.ts     # 年度总结 API 封装

public/                   # 静态资源
  placeholder-logo.png
  placeholder-logo.svg
  placeholder-user.jpg
  placeholder.jpg
  placeholder.svg

styles/                   # 样式文件
  globals.css             # 全局样式

根目录配置文件：
  .gitignore             # Git 忽略配置
  components.json        # shadcn/ui 配置
  next.config.mjs        # Next.js 配置
  package.json           # 项目依赖配置
  pnpm-lock.yaml         # pnpm 锁文件
  postcss.config.mjs     # PostCSS 配置
  tsconfig.json          # TypeScript 配置
```

## 图片性能优化

围绕「缓解网页初次加载图片慢」的目标，从 **上传压缩** 和 **加载渲染** 两端做了优化。

### 1. 上传端：WebP 压缩（lib/imageHandler.ts）

**核心函数**：`compressImage(file, options)`

将上传图片统一转为 WebP，通过多轮降级策略在画质与体积间寻找最佳平衡。

**配置参数**

| 参数 | 默认值 | 说明 |
|---|---|---|
| `maxWidth` | 1920 | 最大宽度，超出等比缩放 |
| `maxHeight` | 1920 | 最大高度，超出等比缩放 |
| `quality` | 0.85 | 起始质量（高画质优先） |
| `minQuality` | 0.6 | 质量下限（画质底线） |
| `targetSizeKB` | — | 目标体积，达到即停止降级 |

**关键策略**

- **所有图片统一转 webp**（无大小阈值），保证路径后缀 `.webp` 与内容格式严格一致，避免「假 webp」
- **`imageSmoothingQuality = 'high'`**：canvas 缩放启用高质量模式
- **多轮降级**：从 `quality` 起步，每轮降 `0.05`（不低于 `minQuality`），找到体积/画质最佳点
- **真实尺寸**：使用 `naturalWidth/Height` 拿到解码后尺寸，不被 CSS 拉伸误导
- **内存回收**：`URL.createObjectURL` 用完立即 `revokeObjectURL`
- **EXIF 兼容**：`applyExifOrientation` 兜底处理手机拍照的旋转

**调用方配置**（`uploadImage`）

```ts
compressImage(file, {
  maxWidth: 1920,
  maxHeight: 1920,
  quality: 0.85,
  minQuality: 0.65,
  targetSizeKB: 300   // 单图目标 ≤ 300KB
})
```

### 2. 加载端：响应式图片组件（components/masonry-photo-gallery.tsx）

**核心组件**：`ResponsiveImage`

封装在 `<picture>` 中统一处理加载优化。

**优化项**

- **`<picture>` 包裹**：原图非 webp 时自动尝试同名 `.webp` 作为 source，浏览器自动回退
- **`loading="lazy"`**：非首屏图懒加载
- **`decoding="async"`**：异步解码，避免阻塞主线程
- **`fetchPriority="high"`**：首屏前 2 张图标记高优先级，提升 LCP
- **`width`/`height` 占位**：固定占位尺寸，避免 CLS
- **`sizes` 响应式**：配合 `columns-1/2/3/4` 告诉浏览器各断点下的渲染宽度

```ts
// PhotoCard 中的调用
<ResponsiveImage
  src={image.url}
  alt={image.alt}
  eager={index < 2}     // 前 2 张 eager + high 优先级
  width={800}
  height={600}
  sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw,
         (min-width: 640px) 50vw, 100vw"
/>
```

**Lightbox 大图**

用户点开的大图走 `eager` + `fetchPriority="high"`，配合 `width=1600 height=1200` 占位。

### 3. 上传行为

每次上传在 Supabase Storage 中写入 **1 张**图片，内容统一为 webp：

| 场景 | 写入数量 | 实际内容 |
|---|---|---|
| 任意大小 | 1 | webp（路径 `.webp` + 内容 webp） |

路径生成器 `generateDiaryImagePath` / `generateYearlyImagePath` 始终返回 `.webp` 后缀，与内容完全对齐。

### 4. 性能收益

| 指标 | 优化前 | 优化后 |
|---|---|---|
| 首屏图片请求 | 全部一起抢带宽 | 仅前 2 张立即下载 |
| LCP 时间 | 受限于图请求排队 | high 优先级，浏览器优先调度 |
| 主线程占用 | 解码阻塞渲染 | 异步解码 |
| CLS 布局抖动 | 加载时元素高度变化 | width/height 占位固定 |
| 旧 JPG/PNG 兼容 | 一直传大体积 | `<picture>` 优先尝试 webp |
| 单图体积 | 原图直传 | webp + targetSize 300KB |

### 5. 后续可做（未实现）

- **预加载首图**：在 `app/page.tsx` 注入 `<link rel="preload" as="image" href={...}>`，让浏览器在 HTML 解析完就启动下载
- **缩略图**：上传时除原图外再生成一张 480px 的 WebP，列表用缩略图、点开换大图
- **缓存头升级**：`cacheControl` 改为 `31536000, immutable`（路径带日期/哈希版本时）


## API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/ai-analysis` | POST | 分析日记内容，生成摘要和情绪 |
| `/api/diary-download` | GET | 导出日记数据为 JSON |
| `/api/test-env` | GET | 测试环境变量配置 |
| `/api/translate` | POST | 翻译日记内容 |

## 开发规范

### 代码风格

- 使用 TypeScript 进行类型检查
- 使用 ESLint 进行代码检查
- 遵循 shadcn/ui 组件库的使用规范
- 使用 clsx + tailwind-merge 进行样式合并

### 提交规范

```
feat: 添加新功能
fix: 修复 bug
docs: 更新文档
style: 代码格式调整（不影响逻辑）
refactor: 代码重构
test: 添加/更新测试
chore: 构建/工具相关
```

## 许可证

MIT

## 维护日志

### 2026-06-22 - 全面审计与优化

#### 1. 冗余文件清理

**删除的未使用UI组件（23个）**：
- accordion.tsx, alert.tsx, aspect-ratio.tsx, avatar.tsx, badge.tsx
- breadcrumb.tsx, checkbox.tsx, collapsible.tsx, context-menu.tsx
- drawer.tsx, empty.tsx, hover-card.tsx, kbd.tsx, menubar.tsx
- navigation-menu.tsx, radio-group.tsx, scroll-area.tsx, switch.tsx
- command.tsx, button-group.tsx, field.tsx, input-group.tsx, item.tsx

**删除的未使用依赖**：
- recharts (图表库，项目中未使用)
- @hookform/resolvers, cmdk, dotenv, embla-carousel-react, input-otp
- next-intl, react-resizable-panels, vaul, baseline-browser-mapping, tw-animate-css

**删除的临时文件**：
- test-api.js, test-api.ts, all-emotion-icons.html
- CREATE_ANONYMOUS_MESSAGE_TABLE.sql, CREATE_HEALTH_CONDITIONS_TABLE.sql
- package-lock.json (统一使用 pnpm-lock.yaml)

#### 2. 代码质量修复

**React Hooks 优化**：
- 为 `loadEntries` 和 `loadAllEntriesForCalendar` 添加 `useCallback` 稳定函数引用
- 修复多个 useEffect 依赖数组不完整问题
- 使用 `useMemo` 包装 `minDate` 避免每次渲染创建新对象

**性能优化**：
- 将所有原生 `<img>` 标签替换为 Next.js `<Image>` 组件
- 使用 `fill` 模式适配容器布局，`width/height` 属性用于固定尺寸场景
- 配置 `images: { unoptimized: true }` 避免构建时图片优化错误

**代码清理**：
- 删除 `app/page.tsx` 中注释掉的废弃代码
- 删除重复的 hook 文件（hooks/use-mobile.ts, hooks/use-toast.ts）
- 更新引用路径，统一使用 components/ui 下的 hook

#### 3. README 文档更新

**功能描述修正**：
- 新增：用户认证系统（访客/查看者/管理员三级权限）
- 新增：音频留言板（独立于日记条目）
- 新增：健康状况追踪（日历标记）
- 新增：离线模式（localStorage备份）
- 修正：日记条目不支持音频上传，音频功能在独立留言板模块

**技术栈描述修正**：
- AI 服务：ModelScope API（通过 OpenAI 兼容层调用）

**数据库字段修正**：
- `diaryContent` 表：`images` 字段名更正为 `image_paths`

**包管理器统一**：
- 文档中所有 `npm run` 命令统一为 `pnpm` 命令

#### 4. 代码检查

- 添加 ESLint 9.x 配置文件 (`eslint.config.js`)
- 添加 `eslint` 和 `eslint-config-next` 开发依赖
- 所有代码通过 `pnpm lint` 检查（0 errors, 0 warnings）
