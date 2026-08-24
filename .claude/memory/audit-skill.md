---
name: audit-skill
description: "/audit Skill：约定+真bug+用户拍板+实测一条龙的目录体检流程;固化 dev server 绑 [::1]:3001、admin/123456、chrome-devtools 锁回退 playwright"
metadata:
  node_type: memory
  type: reference
---

本项目有 `/audit` skill（`.claude/skills/audit/SKILL.md`）：先列目录 → 套 CLAUDE.md 五条硬性约定 + 记忆约定 → 读逻辑找真 bug → 用 AskUserQuestion 问用户修哪些 → `bunx eslint` + `bunx nuxi typecheck` → chrome-devtools / playwright 真浏览器实测。与 `/review`(只扫约定只报告)、`/check`(只 lint/typecheck) 分工。

**它固化的运行时事实（都是踩过的坑）**：
- dev server 常驻 `http://localhost:3001`，**绑定 `[::1]`**——`localhost` 可解析、`127.0.0.1` 不通；重复 `bun run dev` 会被 Nuxt dev lock 挡（见 PID 占用 `[::1]:3001`），用已跑的那个即可。
- 后台登录 `admin / 123456`（`db:init` 种子）；后台页未登录会 302 到 `/login?to=...`。
- chrome-devtools MCP 报 `browser already running for chrome-profile` → 有残留进程锁，杀掉该 chrome-devtools-mcp 浏览器进程，或回退 playwright MCP。
- 测试产物 `.playwright-mcp` / `.playwright` 已 gitignore。相关：[[imqi1-cms-db]]。
