# AI 日记分析应用

这是一个基于 Next.js、React 和 Supabase 的个人日记应用。它支持日记 CRUD、搜索与日历浏览、图片和音频、健康记录、匿名留言、CSV 导出与年度总结，并通过服务端 API 调用 ModelScope 上的 `deepseek-ai/DeepSeek-V3.2` 生成日记标题、情绪标签和翻译。

## 功能

- 创建、编辑、删除和分页浏览日记，支持内容/副标题搜索与日历视图。
- 每篇日记最多选择 18 张图片；浏览器会把图片压缩为 WebP 后上传到 Supabase Storage。
- AI 分析生成短标题和情绪标签；翻译同样通过服务端接口完成，ModelScope 密钥不进入浏览器代码。
- 年度总结包含重要事件、AI 读后感、意见和年度照片。
- 匿名留言支持 1–2000 字内容、HTML 转义和每页 10 条分页；写入通过同源 API 按客户端 IP 限制为每 60 秒 3 条。
- 健康状况可按日期范围记录并显示在日历中。
- 支持按日期范围导出 CSV，以及上传、播放、编辑元数据和删除音频。

## 权限模型

- `guest`：按日期排序查看最新 5 篇日记，并可访问公开显示的年度总结和匿名留言。
- `viewer`：查看全部历史日记、翻译和健康记录。
- `admin`：拥有 viewer 权限，并可创建、编辑、删除、AI 分析、CSV 导出、健康管理、年度总结和音频管理等操作。

`/api/auth` 写入签名 HttpOnly Cookie，浏览器通过 `/api/auth/session` 获取角色，且不保存会话令牌或角色到 `localStorage`。这不是 Supabase Auth。应用数据均通过同源服务端 API；匿名留言读取/写入也已迁入 `/api/anonymous-messages`。数据库只保留 anon 对 `anonymous_messages.id/content/created_at` 三列的只读 Data API 权限，应用浏览器不再直接使用 Supabase client。历史重构设计与批次边界见 [`docs/superpowers/specs/2026-07-12-stateless-session-backend-authorization-design.md`](docs/superpowers/specs/2026-07-12-stateless-session-backend-authorization-design.md)，当前行为以本 README、`AGENTS.md` 和专题文档为准。

## 架构

- `app/page.tsx`：轻量入口；`useDiaryController` 管理日记业务状态，`DiaryAppShell` 负责视图组合和切换。
- `app/api/`：认证、受 Cookie 会话保护的日记读取/CRUD、AI、翻译、CSV 与媒体代理路由。
- `components/`：业务组件与 `components/ui/` 基础组件；年度总结按分析、事件、图库和编辑器拆分在 `components/yearly-summary/`。
- `hooks/`：认证、健康、日记和年度总结 controller hooks。项目未使用 React Context 作为全局状态容器。
- `lib/`：Supabase 访问、AI、媒体、运行时环境变量和业务 API。
- `test_extra/`：部分 SQL 示例、实验和 UI 自动化辅助文件，不是完整迁移或测试套件。

媒体读写通过同源 API：日记按 guest/viewer/admin 规则授权，年度图片对所有角色可读，音频限 admin 并支持单 Range 流式响应；写入、替换和删除要求 admin Cookie。删除若元数据成功而 Storage 清理失败，界面会提示残留路径。三个媒体 Bucket 已在 Batch 5 中设为私有，浏览器 anon 不能直接列出、读取或写入对象。匿名留言列级权限和两个触发器函数的 EXECUTE 收紧迁移均已在生产应用并通过独立 postflight。

生产部署通过 OpenNext 适配到 Cloudflare Workers。详细结构与长期约束见 [`AGENTS.md`](AGENTS.md)。

## 技术栈

- Next.js 16 App Router、React 18、严格 TypeScript
- Tailwind CSS 4、Radix UI、Lucide React
- Supabase PostgreSQL 和 Storage
- ModelScope OpenAI-compatible API、`deepseek-ai/DeepSeek-V3.2`
- OpenNext、Cloudflare Workers、Wrangler
- Node.js 22+、pnpm 10.20.0

## 本地开发

在未提交的 `.env.local` 中配置变量；仓库目前没有 `.env.example`。不要提交真实 URL、密钥、令牌或密码。

```dotenv
SUPABASE_URL=
MODELSCOPE_TOKEN_API_KEY=
AUTH_PASSWORD_ADMIN=
AUTH_PASSWORD_VIEWER=
SESSION_SECRET=
SESSION_VERSION=
SUPABASE_SERVICE_ROLE_KEY=
APP_ORIGIN=
```

| 变量 | 用途 | 要求 |
|---|---|---|
| `SUPABASE_URL` | Supabase 项目 URL | 服务端 API 必需；不再注入浏览器构建 |
| `SUPABASE_ANON_KEY` | Supabase anon 凭据 | 应用运行不需要；仅旧的操作审计脚本/直接访问回归需要 |
| `MODELSCOPE_TOKEN_API_KEY` | AI 分析和翻译 | 启用 AI 功能时必需；仅服务端运行时 |
| `AUTH_PASSWORD_ADMIN` | 管理员密码 | 启用管理员模式时必需；仅服务端运行时 |
| `AUTH_PASSWORD_VIEWER` | 浏览者密码 | 启用浏览者模式时必需；仅服务端运行时 |
| `SESSION_SECRET` | Cookie 会话 HMAC 密钥 | 必需；仅服务端运行时，至少 32 字节 |
| `SESSION_VERSION` | 会话整体失效版本 | 必需；仅服务端运行时；认证密码变更后递增 |
| `SUPABASE_SERVICE_ROLE_KEY` | 受信任服务端 Supabase client | 受保护后端 API 必需；绝不进入浏览器 |
| `APP_ORIGIN` | 生产写请求 Origin 边界 | 必需；仅服务端运行时 |

安装并启动：

```bash
pnpm install
pnpm dev
```

保留 `pnpm-lock.yaml`，不要添加 npm 或 Yarn lockfile。

验证命令：

```bash
pnpm build
pnpm lint
pnpm cf:build
```

- `pnpm build` 只生成并验证 Next.js 构建，不生成 Worker 部署产物。
- `pnpm cf:build` 生成 `.open-next/worker.js` 和 `.open-next/assets`。
- `next.config.mjs` 不再忽略 TypeScript build errors；构建会执行类型验证。
- `pnpm lint` 使用 ESLint 9、Next.js Core Web Vitals 和 TypeScript flat config；当前检查通过且无警告。

## 数据库和存储

代码访问以下表：

- 日记与 AI：`diaryContent`、`diary_AI_analysis`
- 健康与留言：`health_conditions`、`anonymous_messages`
- 音频：`audio_messages`
- 年度总结：`yearly_summaries`、`important_events`、`ai_analysis_sections`、`ai_analysis_opinions`、`yearly_images`

Storage bucket 为 `2024To2025_diary_images`、`2025_Summary_Images` 和 `audio_messages`。

Batch 3 的媒体不变量迁移已于 2026-07-13 在生产执行并通过 postflight 与重复 preflight。Batch 4、Batch 5 和后续匿名留言/函数 ACL 加固均已于 2026-07-15 在生产完成并通过回归。详见 [`docs/DATABASE.md`](docs/DATABASE.md)。

## Cloudflare Workers 部署

```text
Next.js source
→ pnpm cf:build
→ .open-next/worker.js + .open-next/assets
→ Cloudflare Workers
```

```bash
pnpm cf:build
pnpm exec wrangler deploy --dry-run
pnpm run deploy
```

`SUPABASE_URL`、service-role、认证和 ModelScope 配置均由服务端运行时读取，不再通过 `next.config.mjs` 注入浏览器构建。生产 Worker 已配置登录、匿名留言和 AI 三个 Rate Limit binding；`AI_RATE_LIMITER` 将分析/翻译限制为每客户端 IP 每 60 秒 5 次，ModelScope 请求另有 30 秒超时。

已确认生产 Worker 为 `diaryproject`，自定义域名为 `diary.wuzhizhii.com`，未配置单独的 zone route，并存在可回滚的历史版本。Workers Builds 的 Git 仓库、生产分支和命令因当前 OAuth 无 Builds API 权限仍需在 Dashboard 确认。完整流程见 [`docs/DEPLOY.md`](docs/DEPLOY.md)。

## 需要确认

- Cloudflare Workers Builds 当前连接的 Git 仓库、生产分支、root directory 和 build/deploy commands。

## 文档导航

- [`AGENTS.md`](AGENTS.md)：架构摘要、开发约束和文档维护规则。
- [`docs/DATABASE.md`](docs/DATABASE.md)：数据库、RLS、Storage 与访问模式。
- [`docs/DEPLOY.md`](docs/DEPLOY.md)：OpenNext、Wrangler、环境变量与部署流程。

## 许可证

MIT
