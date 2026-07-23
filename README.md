# AI 日记分析应用

这是一个基于 Next.js、React 和 Supabase 的个人日记应用。它支持日记 CRUD、搜索与日历浏览、图片和音频、健康记录、匿名留言、CSV 导出、年度总结与管理员个人知识库。日记分析和翻译由服务端调用 ModelScope；知识库文档 Embedding 在本地调用 Qwen3-Embedding-0.6B FastAPI 服务，线上查询 Embedding 与候选重排使用 Cloudflare Workers AI。

## 功能

- 创建、编辑、删除和分页浏览日记，支持内容/副标题搜索与日历视图。
- 每篇日记最多选择 18 张图片；浏览器会把图片压缩为 WebP 后上传到 Supabase Storage。
- AI 分析生成短标题和情绪标签；翻译同样通过服务端接口完成，ModelScope 密钥不进入浏览器代码。
- 管理员个人知识库使用本地 `Qwen/Qwen3-Embedding-0.6B` 将日记按原文位置分段并生成 1024 维向量。线上搜索由 Cloudflare `@cf/qwen/qwen3-embedding-0.6b` 生成归一化查询向量，经 Supabase 现有 pgvector/原文融合 RPC 召回 20 个候选，再由 `@cf/baai/bge-reranker-base` 返回前 5 个结果。Embedding 失败返回 503；Reranker 失败时按原始向量相似度降级，并在管理员界面标明未应用重排。可选“诊断模式”会依次展示 RPC 召回候选、Reranker 原始前五和合并/多样化后的最终结果，用于直接检查真实日记语料的召回质量。
- ModelScope 分析和翻译共享北京时间自然日 180 次的服务端安全上限；本地知识索引和 Workers AI 知识搜索不消耗此额度。
- 年度总结包含重要事件、AI 读后感、意见和年度照片。
- 匿名留言支持 1–2000 字内容、HTML 转义和每页 10 条分页；写入通过同源 API 按客户端 IP 限制为每 60 秒 3 条。
- 健康状况可按日期范围记录并显示在日历中。
- 支持按日期范围导出 CSV，以及上传、播放、编辑元数据和删除音频。

## 权限模型

- `guest`：按日期排序查看最新 5 篇日记，并可访问公开显示的年度总结和匿名留言。
- `viewer`：查看全部历史日记、翻译和健康记录。
- `admin`：拥有 viewer 权限，并可创建、编辑、删除、AI 分析、CSV 导出、健康管理、年度总结、音频管理和私人知识索引/搜索等操作。

`/api/auth` 写入签名 HttpOnly Cookie，浏览器通过 `/api/auth/session` 获取角色，且不保存会话令牌或角色到 `localStorage`。这不是 Supabase Auth。应用数据均通过同源服务端 API；匿名留言读取/写入也已迁入 `/api/anonymous-messages`。数据库只保留 anon 对 `anonymous_messages.id/content/created_at` 三列的只读 Data API 权限，应用浏览器不再直接使用 Supabase client。历史重构设计与批次边界见 [`docs/superpowers/specs/2026-07-12-stateless-session-backend-authorization-design.md`](docs/superpowers/specs/2026-07-12-stateless-session-backend-authorization-design.md)，当前行为以本 README、`AGENTS.md` 和专题文档为准。

## 架构

- `app/page.tsx`：轻量入口；`useDiaryController` 管理日记业务状态，`DiaryAppShell` 负责视图组合和切换。
- `app/api/`：认证、受 Cookie 会话保护的日记读取/CRUD、AI、翻译、知识索引/搜索、CSV 与媒体代理路由。
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
- ModelScope OpenAI-compatible API 与 `deepseek-ai/DeepSeek-V3.2`
- 本地 Qwen3-Embedding-0.6B FastAPI 服务（`http://127.0.0.1:8000/embeddings`，仅文档索引）
- OpenNext、Cloudflare Workers、Workers AI、Wrangler
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
| `MODELSCOPE_TOKEN_API_KEY` | AI 分析和翻译 | 启用分析/翻译时必需；仅服务端运行时 |
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
- 个人知识库：`knowledge_source_settings`、`knowledge_chunks`、`knowledge_index_jobs`（由迁移 `20260719155837_knowledge_base_index.sql` 创建）
- ModelScope 分析/翻译调用预算：`modelscope_daily_usage`（由迁移 `20260720134848_modelscope_daily_quota.sql` 创建）

Storage bucket 为 `2024To2025_diary_images`、`2025_Summary_Images` 和 `audio_messages`。

Batch 3 的媒体不变量迁移已于 2026-07-13 在生产执行并通过 postflight 与重复 preflight。Batch 4、Batch 5 和后续匿名留言/函数 ACL 加固均已于 2026-07-15 在生产完成并通过回归。个人知识库迁移及首批 Worker 已于 2026-07-20 上线并通过单篇索引、搜索和来源日记回归。详见 [`docs/DATABASE.md`](docs/DATABASE.md)。

`supabase/migrations/20260719155837_knowledge_base_index.sql` 已在生产应用。迁移为现有日记创建待索引任务；本地 FastAPI 服务启动后，管理员进入“个人知识库”并点击“同步待处理日记”，应用才会调用本机服务生成文档向量。索引请求使用 `input_type: "document"`，每批最多 16 条文本。线上查询不调用本地回环服务，也不重新生成现有文档向量。日记保存本身不会等待 Embedding。切分规则更新后，已有向量不会自动重建；需要先点击“重建全部索引”，再同步待处理日记。

每次点击“同步待处理日记”会连续运行每批最多 10 篇的 API 批次，直到队列为空、连续 3 篇失败或请求异常；不再设置 50 批或约 500 篇的单次上限。相邻索引任务及批次之间至少间隔 2 秒。同步期间状态卡片每 2 秒绕过缓存读取数据库计数，所有退出路径都会执行最终刷新。“日记来源”显示当前 `completed` 任务数而不是历史 `last_indexed_at` 数量。单篇失败不会自动重试而是继续下一篇，连续 3 篇失败会停止本次同步并提示管理员，尚未处理的已领取任务会返回待处理队列。失败任务手动重新入队后仍按现有队列顺序排在后面。

知识搜索的开始日期默认是 `2024-11-04`，结束日期在页面访问时按浏览器本地日期初始化为当天；两者仍可手动修改或清空。

`supabase/migrations/20260720134848_modelscope_daily_quota.sql` 已于 2026-07-20 在生产应用。它使用 Supabase 原子计数协调所有 Worker 实例；计数不可用时调用失败关闭，OpenAI SDK 自动重试被禁用，确保一次数据库预留最多对应一次上游 HTTP 调用。由于无法可靠回溯迁移前的当日调用，迁移当天已保守初始化为 180 次并暂停到北京时间次日零点。

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

`SUPABASE_URL`、service-role、认证和 ModelScope 配置均由服务端运行时读取，不再通过 `next.config.mjs` 注入浏览器构建。Worker 部署配置声明了 Workers AI `AI` binding，并保留登录、匿名留言和交互式 AI 三个 Rate Limit binding；`AI_RATE_LIMITER` 将分析、翻译和知识搜索限制为每客户端 IP 每 60 秒 5 次，ModelScope 请求另有 30 秒超时。当前本地 Embedding 回环地址仅服务管理员文档索引，线上查询使用 Workers AI。Workers AI 免费计划每天提供 10,000 Neurons 免费额度，超过额度的请求会失败并进入既定错误/降级路径；本项目不要求新增模型密钥、Account ID 或 API Token。

已确认生产 Worker 为 `diaryproject`，自定义域名为 `diary.wuzhizhii.com`，未配置单独的 zone route，并存在可回滚的历史版本。Workers Builds 当前连接 GitHub `DazhiWu/diaryProject` 的 `main` 分支，root directory 为 `/`，build command 为 `pnpm run cf:build`。Deploy command 必须设为 `pnpm run deploy`，不能使用 `opennextjs-cloudflare deploy`。完整流程见 [`docs/DEPLOY.md`](docs/DEPLOY.md)。

## 需要确认

- Cloudflare Dashboard 的 production Deploy command 需要从旧的 `pnpm exec opennextjs-cloudflare deploy` 改为 `pnpm run deploy`；当前 API 连接可以读取但没有修改 Builds 设置的权限。

## 文档导航

- [`AGENTS.md`](AGENTS.md)：架构摘要、开发约束和文档维护规则。
- [`docs/DATABASE.md`](docs/DATABASE.md)：数据库、RLS、Storage 与访问模式。
- [`docs/DEPLOY.md`](docs/DEPLOY.md)：OpenNext、Wrangler、环境变量与部署流程。

## 许可证

MIT
