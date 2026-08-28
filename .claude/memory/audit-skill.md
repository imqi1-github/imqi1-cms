---
name: audit-skill
description: "/audit Skill：约定+真bug+用户拍板+实测一条龙的目录体检流程;固化 dev server 绑 [::1]:3001、admin/123456、chrome-devtools 锁回退 playwright"
metadata:
  node_type: memory
  type: reference
---

本项目有 `/audit` skill（`.claude/skills/audit/SKILL.md`）：先列目录 → 套 CLAUDE.md 五条硬性约定 + 记忆约定 → 读逻辑找真 bug → 用 AskUserQuestion 问用户修哪些 → `bunx eslint` + `bunx nuxi typecheck` → chrome-devtools / playwright 真浏览器实测。与 `/review`(只扫约定只报告)、`/check`(只 lint/typecheck) 分工。

**它固化的运行时事实（都是踩过的坑）**：
- dev server 常驻 `http://localhost:3001`，**绑定 `[::1]`**——`localhost` 可解析、`127.0.0.1` 不通；重复 `bun run dev` 会被 Nuxt dev lock 挡（见 PID 占用 `[::1]:3001`），用已跑的那个即可。**用户可能自起 dev server 在 3000 等其他端口——绝不 kill/占用用户已在跑的端口；要用自己起的另开端口（如 3001），测试直接访问用户已跑的那个即可。**
- 后台登录 `admin / 123456`（`db:init` 种子）；后台页未登录会 302 到 `/login?to=...`。
- chrome-devtools MCP 报 `browser already running for chrome-profile` → 有残留进程锁，杀掉该 chrome-devtools-mcp 浏览器进程，或回退 playwright MCP。
- 测试产物 `.playwright-mcp` / `.playwright` 已 gitignore。相关：[[imqi1-cms-db]]。

**大目录审计技巧（2026-08 用过）**：`server/api/admin`（61 文件）、`server/utils`+`server/types`（39 文件）这种量级用 **Workflow** 并行：按域分 ~8-12 个 finder 只读找问题 → 每个 finding 交给独立 agent 对抗复核，最后 AskUserQuestion 定修复范围。纯读阶段天然可并行；只有修复后要浏览器实测才受单端登录/会话约束。

**验证取舍**：`server/utils`/`server/types` 等**后端/非 handler** 改动（无 UI 可交互）可只跑 `bunx eslint` + `bunx nuxi typecheck`，不必真浏览器实测（用户 2026-08-25 明确「修改完后不用实测」）；**页面/交互类**审计才需 chrome-devtools/playwright 实测，且后台单端登录须用 `scripts/audit-shared-session.sh` 共享会话或单会话登录。改完务必确认 `nuxi typecheck` 只报**自己改的文件**，别把 batch-2（另一会话）在途代码的报错揽到自己头上。
