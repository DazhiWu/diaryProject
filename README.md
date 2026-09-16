# AI 日记分析应用

这是一个基于 Next.js、React 和 Supabase 的个人日记应用。它支持日记 CRUD、搜索与日历浏览、图片和音频、健康记录、匿名留言、CSV 导出、年度总结与管理员个人知识库。日记分析、翻译和有引用的事实问答由服务端调用 ModelScope；旧的主题时间线、人工审核和跨月比较运行代码已经归档；已产生的数据库历史数据暂时保留。本地开发的知识库索引和查询 Embedding 调用 Qwen3-Embedding-0.6B FastAPI 服务；部署后的查询 Embedding 与候选重排使用 Cloudflare Workers AI。

## 功能

- 创建、编辑、删除和分页浏览日记，支持内容/副标题搜索与日历视图。
- 每篇日记最多选择 18 张图片；浏览器会把图片压缩为 WebP 后上传到 Supabase Storage。
- AI 分析生成短标题和情绪标签；翻译同样通过服务端接口完成，ModelScope 密钥不进入浏览器代码。
- 管理员个人知识库使用本地 `Qwen/Qwen3-Embedding-0.6B` 将日记按原文位置分段并生成 1024 维向量。本地 `pnpm dev` 也用该服务生成归一化查询向量，并按向量相似度选择候选，不连接 Workers AI。部署后的搜索由 Cloudflare `@cf/qwen/qwen3-embedding-0.6b` 生成查询向量，再由 `@cf/baai/bge-reranker-base` 重排前 5 个结果。两种环境都复用 Supabase pgvector/原文融合 RPC；页面通过 `rerankApplied` 区分是否应用重排。
- 管理员日记回顾按需理解问题：历史问题默认查全部已索引日记；应对办法和相似经历使用多个检索方向，应对类问题最多补查两次随后七天的相关片段。可提供当前经历和日期；回答附原日记引用，显示实际范围及选读量，区分原文与 AI 解读，不生成长期记忆或审核任务。保留原有结构化引用校验和 ModelScope 额度限制。详见 [回顾助手](docs/PRIVATE_RECALL_ASSISTANT.md)。
- ModelScope 分析、翻译和事实回答生成共享北京时间自然日 180 次的服务端安全上限；每个实际尝试的模型各消耗一次额度。模型按 `MODELSCOPE_CHAT_MODEL` 的顺序调用，且只对白名单内的上游异常切换：网络/超时、明确可重试的 HTTP 或模型错误码、HTTP 成功但响应体 JSON 损坏，以及缺少/空白内容、分析格式错误、事实问答结构/引用错误。认证、配置、额度、请求合同、数据库和未知程序异常不切换，并向页面返回安全原因；所有模型均发生可切换异常时提示“所有模型 API 调用失败”。零候选问答、知识索引和检索阶段不消耗此额度。
- 年度总结包含重要事件、AI 读后感、意见和年度照片。
- 匿名留言支持 1–2000 字内容、HTML 转义和每页 10 条分页；写入通过同源 API 按客户端 IP 限制为每 60 秒 3 条。
- 健康状况与 CSV 导出共用日历日期范围选择器（最早可选 2024-11-01）；健康图例仅显示与当前日历月重叠的记录。
- 支持按日期范围导出 CSV，以及上传、播放、编辑元数据和删除音频。
- 全站默认使用 Liquid Glass 视觉模式；顶部开关可随时切换回原始页面。两种模式复用相同的业务逻辑和布局，且玻璃模式覆盖卡片、按钮、表单、下拉和弹窗。

## 权限模型

- `guest`：按日期排序查看最新 5 篇日记，并可访问公开显示的年度总结和匿名留言。
- `viewer`：查看全部历史日记、翻译和健康记录。
- `admin`：拥有 viewer 权限，并可创建、编辑、删除、AI 分析、CSV 导出、健康管理、年度总结、音频管理和私人知识索引/搜索等操作。

`/api/auth` 写入签名 HttpOnly Cookie，浏览器通过 `/api/auth/session` 获取角色，且不保存会话令牌或角色到 `localStorage`。这不是 Supabase Auth。应用数据均通过同源服务端 API；匿名留言读取/写入也已迁入 `/api/anonymous-messages`。数据库只保留 anon 对 `anonymous_messages.id/content/created_at` 三列的只读 Data API 权限，应用浏览器不再直接使用 Supabase client。历史重构设计与批次边界见 [`docs/superpowers/specs/2026-07-12-stateless-session-backend-authorization-design.md`](docs/superpowers/specs/2026-07-12-stateless-session-backend-authorization-design.md)，当前行为以本 README、`AGENTS.md` 和专题文档为准。

## 架构

- `app/page.tsx`：轻量入口；`useDiaryController` 管理日记业务状态，`DiaryAppShell` 负责视图组合和切换。
- `app/layout.tsx` 与 `app/globals.css`：初始化并定义全局 Liquid Glass 主题；`DiaryAppShell` 在液态玻璃与原始页面之间切换根节点样式，Portal 弹窗与下拉也同步切换。
- `app/api/`：认证、受 Cookie 会话保护的日记读取/CRUD、AI、翻译、知识索引/搜索/事实回答、CSV 与媒体代理路由。
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
- ModelScope OpenAI-compatible API 与服务端配置的有序对话模型列表
- 本地 Qwen3-Embedding-0.6B FastAPI 服务（`http://127.0.0.1:8000/embeddings`，用于文档索引和本地开发查询）
- OpenNext、Cloudflare Workers、Workers AI、Wrangler
- Node.js 22+、pnpm 10.20.0

## 本地开发

在未提交的 `.env.local` 中配置变量；仓库目前没有 `.env.example`。不要提交真实 URL、密钥、令牌或密码。

本地 `pnpm dev` 优先直接读取 `.env.local` 注入的 `process.env`。只有本地值缺失时才回退到 Cloudflare context；生产 Worker 仍以运行时 bindings 为准。这个顺序避免普通会话校验和 Supabase API 无意义地建立远程 Workers 绑定连接。

```dotenv
SUPABASE_URL=
MODELSCOPE_TOKEN_API_KEY=
MODELSCOPE_CHAT_MODEL=deepseek-ai/DeepSeek-V4-Pro,ZhipuAI/GLM-5.2,Tencent-Hunyuan/Hy3
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
| `MODELSCOPE_TOKEN_API_KEY` | AI 分析、翻译和事实回答生成 | 启用对应功能时必需；仅服务端运行时 |
| `MODELSCOPE_CHAT_MODEL` | ModelScope 对话模型优先级列表，使用英文逗号分隔 | 启用对应功能时必需；仅服务端运行时，不提供代码默认值 |
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
- 归档理解数据：生产中已应用的 `understanding_*` 表保留为不再读写的历史派生数据；当前应用没有对应页面或 API。
- ModelScope 分析/翻译/事实回答生成调用预算：`modelscope_daily_usage`（由迁移 `20260720134848_modelscope_daily_quota.sql` 创建）

Storage bucket 为 `2024To2025_diary_images`、`2025_Summary_Images` 和 `audio_messages`。

Batch 3 的媒体不变量迁移已于 2026-07-13 在生产执行并通过 postflight 与重复 preflight。Batch 4、Batch 5 和后续匿名留言/函数 ACL 加固均已于 2026-07-15 在生产完成并通过回归。个人知识库迁移及首批 Worker 已于 2026-07-20 上线并通过单篇索引、搜索和来源日记回归。详见 [`docs/DATABASE.md`](docs/DATABASE.md)。

`supabase/migrations/20260719155837_knowledge_base_index.sql` 已在生产应用。迁移为现有日记创建待索引任务；管理员需要同时启动本地 FastAPI 服务和 `pnpm dev`，再从本地页面执行同步和知识查询。本地索引使用 `input_type: "document"`，本地查询使用 `input_type: "query"` 并在服务端归一化；本地查询不初始化 Workers AI 绑定，也不运行 BGE 重排。部署后的查询不调用回环服务，仍使用 Workers AI Embedding 与 Reranker。此运行方式不修改现有文档向量，也不需要数据库迁移或重建索引。

主题时间线、人工审核和跨月比较的运行代码已经移除。已应用的 3A–3C 数据表与历史数据暂时保留；从未应用的 3D/v4 SQL 已移出活动迁移目录。当前开发目标见 [私人日记回顾助手](docs/PRIVATE_RECALL_ASSISTANT.md)，历史材料见 [Phase 3 归档](docs/archive/phase3/README.md)。

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

`SUPABASE_URL`、service-role、认证和 ModelScope 配置均由服务端运行时读取，不再通过 `next.config.mjs` 注入浏览器构建。本地 Next.js 从 `.env.local` 读取 `MODELSCOPE_CHAT_MODEL`，部署后的 Worker 从同名 runtime variable 读取；调整模型顺序不需要修改源代码。Worker 部署配置声明了 Workers AI `AI` binding；该 binding 只在部署后的知识查询路径使用。本地 `pnpm dev` 的查询和索引均依赖回环 FastAPI 服务，不需要 Cloudflare Access、远程开发代理或 TUN。

已确认生产 Worker 为 `diaryproject`，自定义域名为 `diary.wuzhizhii.com`，未配置单独的 zone route，并存在可回滚的历史版本。Workers Builds 当前连接 GitHub `DazhiWu/diaryProject` 的 `main` 分支，root directory 为 `/`，build command 为 `pnpm run cf:build`，deploy command 为 `node scripts/deploy-worker.mjs`。部署阶段直接调用已检入的 Wrangler wrapper，复用前一步生成的 `.open-next` 产物，避免 `pnpm run deploy` 的 `predeploy` 生命周期再次执行 OpenNext 构建；不能使用 `opennextjs-cloudflare deploy`。完整流程见 [`docs/DEPLOY.md`](docs/DEPLOY.md)。

## 文档导航

- [`docs/PRIVATE_RECALL_ASSISTANT.md`](docs/PRIVATE_RECALL_ASSISTANT.md)：当前回顾助手的目标、检索流程、成本上限及暂停功能边界。

- [`AGENTS.md`](AGENTS.md)：架构摘要、开发约束和文档维护规则。
- [`docs/DATABASE.md`](docs/DATABASE.md)：数据库、RLS、Storage 与访问模式。
- [`docs/DEPLOY.md`](docs/DEPLOY.md)：OpenNext、Wrangler、环境变量与部署流程。
- [`docs/FACT_LAYER_PLAN.md`](docs/FACT_LAYER_PLAN.md)：第二阶段事实问答的已实现边界、验证要求与生产验收状态。
- [`docs/archive/phase3/README.md`](docs/archive/phase3/README.md)：已归档的主题时间线、人工审核、跨月比较、数字分身设计和未应用 SQL。

## 许可证

MIT
