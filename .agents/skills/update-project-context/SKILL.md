---
name: update-project-context
description: Review the current repository changes and update the project's long-term documentation, including README.md, AGENTS.md, docs/DATABASE.md, and docs/DEPLOY.md. Use after development tasks, architecture changes, database changes, deployment changes, or when asked to preserve the current session context for future AI agents.
---

# Update Project Context

## Purpose

Synchronize confirmed repository changes into long-term project documentation so future AI agents can understand the project without chat history. Preserve durable decisions, current behavior, operating constraints, and document navigation. Keep documentation accurate, concise, and idempotent.

Do not run a documentation update merely to produce a diff. Update only information that is confirmed and useful beyond the current task.

## Files to inspect

Start with:

- `README.md`
- `AGENTS.md`
- `docs/DATABASE.md`
- `docs/DEPLOY.md`
- `package.json`

Read these only when they exist and are relevant to the changes:

- `docs/ARCHITECTURE.md`
- `docs/TODO.md`
- `docs/CHANGELOG.md`
- `.env.example`
- Wrangler configuration
- OpenNext configuration
- Next.js configuration
- Database migrations and SQL files
- Source files related to the current changes

Do not read the entire repository unconditionally. Use the changed-file list and targeted search to locate the smallest relevant set of source and configuration files.

## Inspect repository changes

Run:

```bash
git status --short
git diff --stat
git diff
git diff --staged
```

Then:

1. Identify changed, staged, untracked, and deleted files.
2. Read the relevant code/configuration and the documentation sections that describe it.
3. Determine which changes are durable enough to document.
4. Compare chat claims or user summaries against repository evidence.

Use actual code and configuration as the primary evidence. Do not update documentation from chat alone. If chat and repository evidence conflict, report the conflict and document the confirmed implementation. When Git diffs are empty, a user-confirmed durable decision may still justify an update, but inspect relevant repository files before writing it.

## Classify documentation changes

| Change type | Update |
|---|---|
| Project introduction, startup, major features, or user-facing usage | `README.md` |
| AI development constraints, directory summary, technology summary, important conventions, or documentation navigation | `AGENTS.md` |
| Database tables, fields, indexes, RLS, Supabase Storage, media paths, or data-access patterns | `docs/DATABASE.md` |
| Cloudflare, OpenNext, Wrangler, build commands, environment variables, Secrets, or deployment procedures | `docs/DEPLOY.md` |
| Significant architecture change | Update the summary in `AGENTS.md`, then create or update `docs/ARCHITECTURE.md` when dedicated detail is justified |
| Temporary debugging process | Usually do not record |
| Resolved issue likely to recur | Record the final cause, impact, and stable solution; omit the full investigation transcript |

Update every applicable document when a change spans categories. Keep a short summary and link in `AGENTS.md`; place detailed material in the focused `docs/` file.

## Writing rules

- Record only confirmed, long-term information.
- Do not record raw chat history, large terminal output, or one-time failed attempts.
- Omit abandoned approaches unless a durable warning is necessary to prevent recurrence.
- Never write real keys, tokens, passwords, cookies, URL query parameters, or environment-variable values.
- For environment variables, record only name, purpose, lifecycle stage, requirement, and sensitivity.
- Do not invent database fields, deployment settings, commands, or architecture.
- Mark unresolved facts as `需要确认`.
- Edit the existing authoritative section instead of appending a new session note.
- Merge duplicate statements and remove confirmed obsolete guidance.
- Preserve each document's existing language, heading style, and formatting.
- Keep `AGENTS.md` concise; move detailed database, deployment, and architecture content into `docs/`.
- Do not copy long explanations into multiple files. Use summaries and links.
- Preserve valid user-authored content and unrelated working-tree changes.

## Scope control

By default, modify only:

```text
README.md
AGENTS.md
docs/*.md
```

Without explicit user authorization, do not modify:

- Business or application source code
- Configuration files
- Database migrations or SQL
- Environment files
- `package.json`
- Lockfiles

If code or configuration appears wrong, report it in the final response. Do not fix it opportunistically during a documentation-maintenance task.

## Validation

After editing documentation:

1. Confirm every referenced repository path exists, except items explicitly marked as future or `需要确认`.
2. Confirm documented commands exist in the current `package.json` or another authoritative repository file.
3. Confirm Node.js, package-manager, and tool versions from repository evidence or mark them `需要确认`.
4. Confirm each documented environment-variable name is referenced by current code/configuration.
5. Recheck database and deployment descriptions against their relevant source/configuration.
6. Check Markdown links and document navigation.
7. Scan changed documentation for secret-like values and sensitive data.
8. Search for duplicate or contradictory statements in the affected documents.
9. Review the documentation-only diff:

   ```bash
   git diff -- README.md AGENTS.md docs/
   git diff --staged -- README.md AGENTS.md docs/
   ```

10. Confirm the final diff contains only authorized documentation changes and preserves unrelated user changes.

## When no update is needed

If no confirmed, durable information requires documentation changes:

- Do not edit files merely to create activity.
- State: `本次无需更新项目文档`.
- Briefly explain the evidence used, such as no relevant diff, behavior already documented, or changes being temporary/internal.

## Final response

Use this concise structure and omit empty sections:

```markdown
## 文档更新结果

### 已修改
- `文件路径`：修改内容摘要

### 未修改
- `文件路径`：无需修改的原因

### 需要确认
- 仍无法从代码或配置确认的信息

### 发现的问题
- 文档与代码不一致或可能需要后续处理的问题
```
