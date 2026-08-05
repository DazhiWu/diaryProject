# AI 日记分析应用

这是一个基于 Next.js、React 和 Supabase 的个人日记应用。它支持日记 CRUD、搜索与日历浏览、图片和音频、健康记录、匿名留言、CSV 导出、年度总结与管理员个人知识库。日记分析、翻译和有引用的事实问答由服务端调用 ModelScope；Phase 3A 主题时间线和 Phase 3D 期间比较由本地 Ollama 对话模型生成。知识库文档 Embedding 在本地调用 Qwen3-Embedding-0.6B FastAPI 服务，线上查询 Embedding 与候选重排使用 Cloudflare Workers AI。

## 功能

- 创建、编辑、删除和分页浏览日记，支持内容/副标题搜索与日历视图。
- 每篇日记最多选择 18 张图片；浏览器会把图片压缩为 WebP 后上传到 Supabase Storage。
- AI 分析生成短标题和情绪标签；翻译同样通过服务端接口完成，ModelScope 密钥不进入浏览器代码。
- 管理员个人知识库使用本地 `Qwen/Qwen3-Embedding-0.6B` 将日记按原文位置分段并生成 1024 维向量。线上搜索由 Cloudflare `@cf/qwen/qwen3-embedding-0.6b` 生成归一化查询向量，经 Supabase 现有 pgvector/原文融合 RPC 召回 20 个候选，再由 `@cf/baai/bge-reranker-base` 返回前 5 个结果。Embedding 失败返回 503；Reranker 失败时按原始向量相似度降级，并在管理员界面标明未应用重排。可选“诊断模式”会依次展示 RPC 召回候选、Reranker 原始前五和合并/多样化后的最终结果，用于直接检查真实日记语料的召回质量。
- 管理员事实问答复用同一检索链，将最多 5 个最终片段交给 `deepseek-ai/DeepSeek-V3.2`。服务端预先分配 `S1`–`S5`，只接受结构化、引用标识合法且正文引用一致的模型结果；无候选或证据不足时明确拒答，引用卡片可打开原日记。回答和引用不会写入数据库。
- Phase 3A/3B 的源码质量加固版把主题从一句宽泛文字升级为每运行冻结的 `ThemeSpec`（名称、定义、纳入、排除、不确定边界）。既有 400–700 字知识分块不变；服务器仅在 Phase 3 处理时把分块确定性切成带绝对字符范围的证据单元 ID。同一 4B Ollama 先将每个 ID 完整分桶为 `relevant/uncertain/irrelevant`，服务器校验三个集合必须无重复且完整覆盖；随后只把 relevant（或纯 uncertain）证据交给第二次观察合成，防止同篇的旅行、消费或情绪内容带偏友情观察。`uncertain` 在人工审核前不进入摘要/聚合。全部来源处理后运行停在 `awaiting_review`，不再自动生成摘要；只有所有观察被确认、编辑或拒绝后，才可用 `confirmed/edited` 观察生成首个待审核摘要。旧 v3 运行保留为历史且因 pipeline/prompt 版本变化显示 stale；本加固迁移尚未应用生产，因此尚不能创建 v4 运行。
- Phase 3C 为单个已完成、非 stale 运行显式生成版本化语料聚合快照。PostgreSQL 原子计算 eligible/processed 来源覆盖、确认/编辑观察数、distinct 支持日记、首末支持日期和月度分组；来源覆盖是字面数据库行计数，观察/支持日记是带 extractor/model/prompt/语料版本的语义计数，不会伪装成关键词出现次数。每个快照冻结所纳入观察的陈述、审核状态和证据数量，并通过观察 ID 保留到原文证据和来源日记的完整链。观察或来源变化会让当前快照显示为 stale；管理员可显式再生成并保留旧版本。聚合不合并独立试跑、不调用 Ollama/ModelScope，也不需要处理当前 pending 日记。
- Phase 3D 源码可在同一个 current、非 stale 的 Phase 3C 聚合内选择两个不同自然月，使用两侧全部 confirmed/edited 观察调用一次本地 Ollama，生成 1–12 条连续性、变化、可能矛盾或转折点发现。每条发现必须分别引用两个期间的服务器自有观察 ID，并明确标为 `fact`、`summary` 或 `inference`；可能矛盾和转折点只能是推断。模型结果一律从 `proposed` 开始，管理员可在线确认、编辑或拒绝，历史只追加保留。该功能不会拼接独立运行，不让模型生成统计数字，也不会处理 pending 日记。3D 数据库迁移和 Worker 尚未部署，当前单月试跑也不具备真实跨月生成条件。
- ModelScope 分析、翻译和事实回答生成共享北京时间自然日 180 次的服务端安全上限；零候选问答、本地知识索引和仅使用 Workers AI 的知识搜索不消耗此额度。
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
- ModelScope OpenAI-compatible API 与 `deepseek-ai/DeepSeek-V3.2`
- Windows Ollama 与本地 `qwen3.5:4b`（仅 Phase 3A 提取/摘要和 Phase 3D 期间比较生成）
- 本地 Qwen3-Embedding-0.6B FastAPI 服务（`http://127.0.0.1:8000/embeddings`，仅文档索引）
- OpenNext、Cloudflare Workers、Workers AI、Wrangler
- Node.js 22+、pnpm 10.20.0

## 本地开发

在未提交的 `.env.local` 中配置变量；仓库目前没有 `.env.example`。不要提交真实 URL、密钥、令牌或密码。

本地 `pnpm dev` 优先直接读取 `.env.local` 注入的 `process.env`。只有本地值缺失时才回退到 Cloudflare context；生产 Worker 仍以运行时 bindings 为准。这个顺序避免普通会话校验、Supabase API 和本地 Ollama 请求无意义地建立远程 Workers 绑定连接。

```dotenv
SUPABASE_URL=
MODELSCOPE_TOKEN_API_KEY=
OLLAMA_BASE_URL=http://127.0.0.1:11434
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
| `OLLAMA_BASE_URL` | Phase 3A/3D 本地 Ollama API 根地址 | 本地 Phase 3A 处理或 Phase 3D 比较生成必需；仅服务端，默认 `http://127.0.0.1:11434` |
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
- 可审核理解：`understanding_runs`、运行来源、观察/证据、审核历史、摘要/链接，Phase 3C 的 `understanding_aggregates`、`understanding_aggregate_periods`、`understanding_aggregate_observations`（3C 已应用生产），Phase 3D 的期间比较/发现表（3D 未应用），以及质量加固版的 `understanding_run_semantic_configs` 和 `understanding_observation_scopes`（v4 迁移未应用）。
- ModelScope 分析/翻译/事实回答生成调用预算：`modelscope_daily_usage`（由迁移 `20260720134848_modelscope_daily_quota.sql` 创建）

Storage bucket 为 `2024To2025_diary_images`、`2025_Summary_Images` 和 `audio_messages`。

Batch 3 的媒体不变量迁移已于 2026-07-13 在生产执行并通过 postflight 与重复 preflight。Batch 4、Batch 5 和后续匿名留言/函数 ACL 加固均已于 2026-07-15 在生产完成并通过回归。个人知识库迁移及首批 Worker 已于 2026-07-20 上线并通过单篇索引、搜索和来源日记回归。详见 [`docs/DATABASE.md`](docs/DATABASE.md)。

`supabase/migrations/20260719155837_knowledge_base_index.sql` 已在生产应用。迁移为现有日记创建待索引任务；管理员需要同时启动本地 FastAPI 服务和 `pnpm dev`，再从本地页面执行同步，应用才会调用本机服务生成文档向量。该 FastAPI 服务当前由管理员在仓库外单独维护。生产页面在索引维护方面只显示状态；知识搜索和已部署验收的 Fact Layer 事实问答均可在线使用。索引同步、重建和失败任务重试按钮均禁用，对生产 `/api/knowledge/index` 的维护请求也会返回 `409`。索引请求使用 `input_type: "document"`，每批最多 16 条文本。线上查询不调用本地回环服务，也不重新生成现有文档向量。日记保存本身不会等待 Embedding。切分规则更新后，已有向量不会自动重建；需要在本地先点击“重建全部索引”，再同步待处理日记。

Phase 3 开发使用 2026-07-30 时已完成索引的 598 篇日记作为冻结语料基线。每天新增日记可以继续积累为待处理任务，不阻塞开发，也不会被表示为已经纳入全语料分析；Phase 3 功能完成后再补齐全部索引并重新生成受影响的派生结果。

Batch 3A 的基础迁移位于 `supabase/migrations/20260730071934_phase3_theme_timeline.sql`。创建运行时会原子校验 598 篇基线及 corpus fingerprint，并保存全部 `source_id + indexed_content_hash`；日期范围只决定其中哪些快照来源进入本次提取。每个 eligible 来源调用一次本地 Ollama；只要存在提取观察，最后再调用一次生成待审核摘要。Ollama 不占用 ModelScope 日额度；超时或不可达会释放当前 claim 回 pending 并停止，结构化输出无效才记为可重试失败，已完成来源不会重复生成观察。来源哈希、索引状态或冻结模型/Prompt/参数签名变化会让结果显示为 stale，而不会静默覆盖。基础迁移已于 2026-07-30 作为生产 Supabase migration `20260730080402_phase3_theme_timeline` 应用；同日的 `20260730081356_phase3_theme_timeline_fk_indexes` 补齐两条外键覆盖索引。新增 `20260731015350_phase3_ollama_run_config.sql` 已于 2026-07-31 作为生产 migration `20260731024031_phase3_ollama_run_config` 应用；权限 postflight、顾问复查和子事务回滚冒烟通过。Windows-to-WSL Ollama 连通通过后，一个明确标记的 2026-07-22 单篇运行完成了 1 次提取和 1 次摘要，保存 1 条观察、1 条原文证据和 1 条待审核摘要，且无 failed/pending/stale 来源。冻结基线仍为 598 completed 和原 fingerprint；截至 2026-08-03，当前 11 条 pending 日记未处理。Phase 3A–3C 读取、审核和确定性聚合路由已随 Phase 3C Worker 上线；提取、重试和摘要重新生成继续只允许本地开发服务器执行。

源码中新增的 `20260803082412_phase3_theme_semantic_quality_v4.sql` 是对上述 v3 试跑的质量更正，不会回写旧观察。它冻结结构化主题契约、允许同一 chunk 保存多个精确证据范围、记录 relevant/uncertain 范围判定，并把首摘要推迟到观察审核之后。每篇 eligible 来源至少一次范围分桶调用，有 relevant/uncertain 证据时再一次合成调用；审核闭合后的非空首摘要再调用一次。迁移、rollback、只读 postflight 和静态契约测试已写入仓库。2026-08-03 使用 Docker Desktop 中一次性、未链接线上项目的 Supabase PostgreSQL 17 环境完成了真实迁移、postflight、精确证据拒绝、relevant/uncertain/irrelevant 分支、审核后首摘要、真实 rollback、回滚后旧约束/RPC 恢复以及重新迁移的闭环烟测；所有夹具事务均已回滚。生产迁移、advisors、Worker 部署、角色矩阵和新运行人工验收仍是独立门槛。

Phase 3B 观察审核迁移 `supabase/migrations/20260731062228_phase3_observation_review.sql` 已于 2026-07-31 作为生产 migration `20260731063023_phase3_observation_review` 应用。它新增 service-role-only 的审核历史和摘要影响记录，并提供确认、编辑、拒绝 RPC；stale 或未完成运行不能审核。摘要闭环迁移 `supabase/migrations/20260731070803_phase3_summary_regeneration.sql` 同日作为 `20260731071402_phase3_summary_regeneration` 应用：只有全部观察完成审核、没有活动摘要且运行仍为 current/completed 时，才允许基于确认/编辑观察创建新的 proposed 摘要。两项 migration 的 postflight、顾问检查、事务审核/生成冒烟和 rollback 脚本演练均通过；操作员已完成最新运行的全部观察审核及摘要重新生成/编辑，验收快照为 16 条确认或编辑观察、2 条拒绝观察、2 条已取代摘要和 1 条用户编辑摘要。生产总状态为 63 条观察、75 条证据、6 个摘要、21 条观察审核历史和 1 条摘要影响记录。

Phase 3C 源迁移 `supabase/migrations/20260803021419_phase3_corpus_aggregation.sql` 已作为生产 migration `20260803025058_phase3_corpus_aggregation` 应用，Worker `cd1f5f09-a607-4781-8be0-36eba039762f` 已部署。postflight、advisors、事务聚合/版本替换/真实回滚烟测和 guest/viewer/admin 角色矩阵均通过。已审核月度试跑的 current 聚合覆盖 31/31 个 eligible 来源，含 16 条 confirmed/edited 观察和 16 篇支持日记，1 个自然月期间且没有 stale reason；线上显式再生成保留了首版并将其标记为 superseded。当前 pending 日记仍未处理。完整索引、新全语料检查点、受影响派生数据重建和最终 Phase 3 全语料验收仍是后续独立门槛。详细边界见 [`docs/PHASE3_UNDERSTANDING_PLAN.md`](docs/PHASE3_UNDERSTANDING_PLAN.md)。

Phase 3D 源迁移位于 `supabase/migrations/20260803034844_phase3_change_contradiction_analysis.sql`，配套 rollback、只读 postflight、服务端/API/client/UI 和契约测试均已写入源码，但尚未应用 Supabase 或部署 Worker。比较只能选择同一 current、非 stale 聚合中两个按时间排序且都有保留观察的自然月；生成必须从本地开发服务器显式发起并使用完整两侧观察集，线上只允许读取和审核已存储结果。迁移应用前，主题时间线 GET 只把 PostgREST 的“3D 比较表不存在”错误降级为空比较历史，继续读取 3A–3C；其他数据库错误仍然失败。当前已审核生产试跑只有一个自然月，因此本轮没有伪造跨月业务结果；待未来存在真实双月聚合后，再独立执行 migration、transaction smoke、advisors、角色矩阵和生产验收。

Windows Ollama 默认只监听 Windows 自身的 `127.0.0.1:11434`。如果 `pnpm dev` 运行在 WSL，应在 Windows 端把 Ollama 绑定到 WSL 可访问的接口，并用 Windows 防火墙把 11434 端口限制在本机/WSL 虚拟网络，然后在 WSL 的 `.env.local` 设置 `OLLAMA_BASE_URL=http://<Windows-host-IP>:11434`。不要把 Ollama API 暴露到公网；先用 `curl "$OLLAMA_BASE_URL/api/tags"` 确认 WSL 能看到 `qwen3.5:4b`，再从页面创建运行。本仓库不会自动修改 Windows 的 Ollama 或防火墙配置。

本地每次点击“同步待处理日记”会连续运行每批最多 10 篇的 API 批次，直到队列为空、连续 3 篇失败或请求异常；不再设置 50 批或约 500 篇的单次上限。相邻索引任务及批次之间至少间隔 2 秒。同步期间状态卡片每 2 秒绕过缓存读取数据库计数，所有退出路径都会执行最终刷新。“日记来源”显示当前 `completed` 任务数而不是历史 `last_indexed_at` 数量。单篇失败不会自动重试而是继续下一篇，连续 3 篇失败会停止本次同步并提示管理员，尚未处理的已领取任务会返回待处理队列。失败任务手动重新入队后仍按现有队列顺序排在后面。当前维护流程按单一管理员操作设计：同步期间不新增或修改日记；全量重建请求若因网络中断失败，联网后从本地重新执行完整重建。

知识搜索和事实问答各自使用可编辑的日期范围；开始日期默认是 `2024-11-04`，结束日期在页面访问时按浏览器本地日期初始化为当天，两者都可手动修改或清空。

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

`SUPABASE_URL`、service-role、认证和 ModelScope 配置均由服务端运行时读取，不再通过 `next.config.mjs` 注入浏览器构建。`OLLAMA_BASE_URL` 同样只在本地服务端读取，不配置到生产 Worker。Worker 部署配置声明了 Workers AI `AI` binding，并保留登录、匿名留言和交互式 AI 三个 Rate Limit binding；`AI_RATE_LIMITER` 将分析、翻译、知识搜索和事实问答限制为每客户端 IP 每 60 秒 5 次，ModelScope 请求另有 30 秒超时。当前本地 Embedding 回环地址仅服务管理员文档索引，线上查询使用 Workers AI。Workers AI 免费计划每天提供 10,000 Neurons 免费额度，超过额度的请求会失败并进入既定错误/降级路径；本项目不要求新增模型密钥、Account ID 或 API Token。

已确认生产 Worker 为 `diaryproject`，自定义域名为 `diary.wuzhizhii.com`，未配置单独的 zone route，并存在可回滚的历史版本。Workers Builds 当前连接 GitHub `DazhiWu/diaryProject` 的 `main` 分支，root directory 为 `/`，build command 为 `pnpm run cf:build`。Deploy command 必须设为 `pnpm run deploy`，不能使用 `opennextjs-cloudflare deploy`。完整流程见 [`docs/DEPLOY.md`](docs/DEPLOY.md)。

## 文档导航

- [`AGENTS.md`](AGENTS.md)：架构摘要、开发约束和文档维护规则。
- [`docs/DATABASE.md`](docs/DATABASE.md)：数据库、RLS、Storage 与访问模式。
- [`docs/DEPLOY.md`](docs/DEPLOY.md)：OpenNext、Wrangler、环境变量与部署流程。
- [`docs/FACT_LAYER_PLAN.md`](docs/FACT_LAYER_PLAN.md)：第二阶段事实问答的已实现边界、验证要求与生产验收状态。
- [`docs/PHASE3_UNDERSTANDING_PLAN.md`](docs/PHASE3_UNDERSTANDING_PLAN.md)：第三阶段可审核理解的开发基线、独立批次、覆盖率与验收边界。
- [`docs/THEME_TIMELINE_THEME_CATALOG.md`](docs/THEME_TIMELINE_THEME_CATALOG.md)：长期日记主题时间线的可复制主题目录、主题写法和试跑/全量边界。
- [`docs/DIGITAL_TWIN_ROADMAP.md`](docs/DIGITAL_TWIN_ROADMAP.md)：事实层之后的可审核理解、私人分身、成长分析、公开分身与长期维护路线图。

## 许可证

MIT
