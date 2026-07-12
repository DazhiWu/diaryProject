# AI 日记分析应用

这是一个基于 Next.js、React 和 Supabase 的个人日记应用。它支持日记 CRUD、搜索与日历浏览、图片和音频、健康记录、匿名留言、CSV 导出与年度总结，并通过服务端 API 调用 ModelScope 上的 `deepseek-ai/DeepSeek-V3.2` 生成日记标题、情绪标签和翻译。

## 功能

- 创建、编辑、删除和分页浏览日记，支持内容/副标题搜索与日历视图。
- 每篇日记最多选择 18 张图片；浏览器会把图片压缩为 WebP 后上传到 Supabase Storage。
- AI 分析生成短标题和情绪标签；翻译同样通过服务端接口完成，ModelScope 密钥不进入浏览器代码。
- 年度总结包含重要事件、AI 读后感、意见和年度照片。
- 匿名留言支持 2–1000 字内容、HTML 转义和每页 10 条分页。
- 健康状况可按日期范围记录并显示在日历中。
- 支持按日期范围导出 CSV，以及上传、播放、编辑元数据和删除音频。
- Supabase 读取失败时可回退到浏览器中已有的压缩日记备份；这不是完整的离线 CRUD 或 PWA 支持。

## 当前权限模型与下一阶段目标

- `guest`：按日期排序查看最新 5 篇日记，并可访问公开显示的年度总结和匿名留言。
- `viewer`：当前主要用于查看全部历史日记；下一阶段目标是允许翻译，但禁止 AI 分析和 CSV 导出，相关按钮不显示。
- `admin`：当前承担创建、编辑、删除、AI 分析、翻译、CSV 导出、健康管理、年度总结和音频管理等操作；下一阶段将由服务端 Session 强制执行。

当前 `/api/auth` 使用运行时密码比较后返回等级，浏览器把等级保存在 `localStorage`；这仍不是可信授权。下一阶段已批准改为无状态服务端签名 HttpOnly Cookie Session，并将敏感数据库访问迁移到服务端 API。设计见 [`docs/superpowers/specs/2026-07-12-stateless-session-backend-authorization-design.md`](docs/superpowers/specs/2026-07-12-stateless-session-backend-authorization-design.md)。

## 架构

- `app/page.tsx`：以客户端状态在列表、日历、新建、详情、编辑、导出、年度总结、留言和音频视图间切换。
- `app/api/`：认证、AI 分析、翻译和 CSV 下载路由。
- `components/`：业务组件与 `components/ui/` 基础组件；文件通常使用 kebab-case，导出的 React 组件使用 PascalCase。
- `hooks/`：认证等级和健康状况 hooks。项目未使用 React Context 作为全局状态容器。
- `lib/`：Supabase 访问、AI、媒体、运行时环境变量和业务 API。
- `test_extra/`：部分 SQL 示例、实验和 UI 自动化辅助文件，不是完整迁移或测试套件。

当前浏览器仍直接使用 Supabase anon client；完整后端授权、私有 Storage 和按需媒体代理属于下一阶段，尚未实现。

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
SUPABASE_ANON_KEY=
MODELSCOPE_TOKEN_API_KEY=
AUTH_PASSWORD_ADMIN=
AUTH_PASSWORD_VIEWER=
```

| 变量 | 用途 | 要求 |
|---|---|---|
| `SUPABASE_URL` | Supabase 客户端 URL | 必需；会进入浏览器构建，仍不要硬编码 |
| `SUPABASE_ANON_KEY` | Supabase anon 凭据 | 必需；不是服务端秘密，权限依赖 RLS/Storage policies |
| `MODELSCOPE_TOKEN_API_KEY` | AI 分析和翻译 | 启用 AI 功能时必需；仅服务端运行时 |
| `AUTH_PASSWORD_ADMIN` | 管理员密码 | 启用管理员模式时必需；仅服务端运行时 |
| `AUTH_PASSWORD_VIEWER` | 浏览者密码 | 启用浏览者模式时必需；仅服务端运行时 |

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
- `pnpm lint` 已声明，但 `eslint` 不是直接依赖；全新安装下的行为仍需确认。
- `next.config.mjs` 当前忽略 TypeScript build errors，因此构建成功不等于类型检查完全通过。

## 数据库和存储

代码访问以下表：

- 日记与 AI：`diaryContent`、`diary_AI_analysis`
- 健康与留言：`health_conditions`、`anonymous_messages`
- 音频：`audio_messages`
- 年度总结：`yearly_summaries`、`important_events`、`ai_analysis_sections`、`ai_analysis_opinions`、`yearly_images`

Storage bucket 为 `2024To2025_diary_images`、`2025_Summary_Images` 和 `audio_messages`。

生产 Supabase 状态已于 2026-07-12 只读核查：业务表均启用 RLS；匿名留言只允许 anon/authenticated 读取和新增；其余浏览器直连业务表仍有宽松的公开写策略。三个 Storage bucket 均公开，只允许公开读取和插入对象，不允许覆盖或删除。详见 [`docs/DATABASE.md`](docs/DATABASE.md)。

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
pnpm deploy
```

`SUPABASE_URL` 和 `SUPABASE_ANON_KEY` 由 `next.config.mjs` 注入浏览器构建，因此 Cloudflare 构建阶段必须可用；共享 Supabase client 被服务端路径导入时，运行时也应能读取它们。当前五个 Worker 运行时绑定均已配置为 secrets，但 Supabase URL/anon key 进入浏览器后仍不是秘密。构建变量与已部署 Worker 的运行时 secrets 是两个作用域。

已确认生产 Worker 为 `diaryproject`，自定义域名为 `diary.wuzhizhii.com`，未配置单独的 zone route，并存在可回滚的历史版本。Workers Builds 的 Git 仓库、生产分支和命令因当前 OAuth 无 Builds API 权限仍需在 Dashboard 确认。完整流程见 [`docs/DEPLOY.md`](docs/DEPLOY.md)。

## 需要确认

- Cloudflare Workers Builds 当前连接的 Git 仓库、生产分支、root directory 和 build/deploy commands。
- 其余业务表的宽松公开写策略何时迁移到可信服务端会话或 Supabase Auth。
- Supabase Advisor 报告的公开 Storage 列表权限和 `public.rls_auto_enable()` SECURITY DEFINER 执行权限是否仍有必要。

## 文档导航

- [`AGENTS.md`](AGENTS.md)：架构摘要、开发约束和文档维护规则。
- [`docs/DATABASE.md`](docs/DATABASE.md)：数据库、RLS、Storage 与访问模式。
- [`docs/DEPLOY.md`](docs/DEPLOY.md)：OpenNext、Wrangler、环境变量与部署流程。

## 许可证

MIT
