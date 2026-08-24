---
name: audit
description: >-
  检测项目某目录的代码/功能问题：先列目录文件 → 查硬性约定 → 找代码/功能 bug 与可优化点 →
  给选项问用户修哪些 → 修复后跑 eslint/typecheck，并用 chrome-devtools/playwright 在真浏览器复测。
  改动或新增 admin/api/组件后，想整体体检、揪运行时问题、并实测验证时使用。
---

# /audit — 目录代码/功能体检（约定 + bug + 实测）

模拟「逐目录人工 review」的完整流程：列文件 → 约定 → 真 bug → 用户拍板 → 实测。**不要只扫约定**，也要读逻辑找真 bug；给用户选择题；最后真浏览器验证。

## 0. 确定目标
- 参数 = 一个目录/路径（如 `app/pages/admin`、`server/api/admin/attachments`）→ 只审它；无参数 → 默认 `app/pages/admin`（后台最易暴露问题，也可改）。
- 前置：`cd "$(git rev-parse --show-toplevel)"` 校正到项目根，防 CWD 残留在 `mini/` 验错项目。

## 1. 列目录，建立全貌
```bash
find <目录> -type f | sort
```

## 2. 查硬性约定（CLAUDE.md 五条 + 记忆台账）
约定来源：CLAUDE.md「硬性约定」+ `.claude/memory/`。逐条：
- **约定1 公开接口白名单**：`findMany` 带 `select`、响应禁 `...row`（重点是 `mini/**`、前台 `app/**`、公开 `.get.ts`）。
- **约定2 admin 写接口必带 CSRF**：`/api/admin/*` POST/PUT/DELETE 有 `validateCsrfToken`（POST/PUT body `csrfToken`，DELETE header `x-csrf-token`）。
- **约定3 禁 migrate dev/reset**；schema 走 db execute / 幂等 tsx；库名 `imqi1-cms`。
- **约定4 类型放独立文件**：`.vue`/`.ts` 内不内联 `interface`/`type`。
- **约定5 敏感配置运行时化**：redis/amap 等 key 不硬编码在前后端分支。
- **记忆约定**：admin 确认弹窗走 `useConfirm()`（禁原生 `confirm()`/`alert()`）；写接口 catch 别吞 400/404（透传 statusCode，`P2025`→404）；前台动态路由需 `setResponseStatus(404)`。

扫描命令（admin 页面常用）：
```bash
# 内联类型（排除 import type）
grep -rnoE "^\s*(interface|type)\s+[A-Za-z_]" <dir>
# 原生 confirm/alert（命中=违规）：字符串参数是原生，对象参数 confirm({ 才是 useConfirm
grep -rnoE 'confirm\(\s*["\x27]' <dir>
# 残留 console.log
grep -rnoE 'console\.log' <dir>
# 写接口 CSRF 覆盖：每文件「写调用数」vs「csrfToken 出现数」（注意单引号 method 也要算）
for f in $(find <dir> -name "*.vue"); do
  w=$(grep -coE 'method:\s*["\x27](POST|PUT|DELETE|PATCH)' "$f"); c=$(grep -coE 'csrfToken' "$f")
  [ "$w" -gt 0 ] && [ "$c" -eq 0 ] && echo "⚠️  $f 有写接口但无 csrfToken"
done
```

## 3. 找代码/功能 bug（重点，读文件）
逐个 Read，重点：
- **竞态**：重复请求无「最后写入守卫」/序号守卫；搜索防抖缺失；慢响应覆盖新数据。
- **越界/空**：分页越界不跳回；`page` 负数/NaN 未钳制；`Math.ceil(total/pageSize)` 满页后 page 越界。
- **null/undefined**：可选链缺失；字段可能空（如 `originalLink?.name` 拼出 "undefined"）。
- **一致性**：同一字段两处取值（ref vs `document.cookie`）；两文件逻辑不一致（如 pages vs contents 少了未保存提醒 / 预览不拦草稿）。
- **数据关联**：增删误伤同表其它类型（如分类 PUT 不带 `metas.type: "category"` 过滤会清掉标签）。
- **守卫缺失**：删除/批量删除空态、发布前校验、草稿预览 404、未保存离开提醒。

## 4. 给选项 → 问用户修哪些
- 分开列「硬违规（约定）」与「功能 bug / 优化点」，每条给 `file:line` + 成因 + 建议改法。
- **不要自动修**。用 `AskUserQuestion`（多选）或列清单问：修哪几条 / 只修硬违规 / 全修 / 先不修。
- 用户定范围后再动；改完逐条说明**功能影响（是否回归）**。

## 5. 修复后验证

### 5.1 会话策略（先定，再实测）
后台是**单端登录**：每次登 admin 都会清掉该用户其它 session、并让旧 session 的 authCode 失配被判失效（`server/lib/auth.ts` `setSession`/`getUser`）。并行多个 /audit 各自登录会**互相踢下线**。所以：

- **并行 /audit（推荐）→ 共享会话**：只登录一次，各会话只注入 cookie、不重复登录（否则一登就清了别人）。
  ```bash
  cd "$(git rev-parse --show-toplevel)"
  SID=$(bash scripts/audit-shared-session.sh)   # 播种一次；已有且仍有效则复用，缓存 .audit-session（gitignored）
  ```
  - **注入浏览器**：**别再走 `/login` 重新登录**。优先用 **Playwright MCP**（它有 `browser_context.add_cookies()` 能设 httpOnly cookie，且每个会话自带一个浏览器）：`browser_context.add_cookies([{name:'session', value:"$SID", url:'http://localhost:3001'}])` → `browser_navigate` `/admin`。**chrome-devtools MCP 不便设 httpOnly cookie**（`document.cookie` 写不进 httpOnly），单会话排查才走它。
  - **纯 API 契约校验（零浏览器、真并行）**：`bash scripts/audit-api-check.sh /api/admin/stats /api/admin/recent-comments`。
  - 每个并行会话要用**独立浏览器实例**（Playwright 自带，或脚本化 headless），别让多个会话共用一个 chrome-devtools-profile。
- **单会话 / 交互排查（fallback）**：才走老路径登录 `admin / 123456`。注意——一旦又登一次，其它还持有旧共享会话的会话会被踢。

### 5.2 静态校验
先 `bunx eslint <改动路径>`；再 `bunx nuxi typecheck`（慢，但 `select` 等类型改动必过）。都 exit 0 才算过；有错原样贴，勿降级 warn/跳过。

### 5.3 浏览器实测（chrome-devtools / playwright MCP）
- dev server 常驻 `http://localhost:3001`（绑 `[::1]`，`localhost` 可解析；`127.0.0.1` 不通）。确认 `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/`。没起 → 后台 `bun run dev`（3000 被占自动落 3001；重复起被 Nuxt dev lock 挡，用已有的即可）。
- **优先 chrome-devtools MCP**：`list_pages` / `navigate_page` / `take_snapshot` / `click` / `fill`。若报 `browser already running for chrome-profile` → 有残留锁，杀该 chrome-devtools-mcp 浏览器进程，或回退 playwright。
- **回退 playwright MCP**：`browser_navigate` / `browser_snapshot` / `browser_click` / `browser_fill_form` / `browser_console_messages`。
- 实测点：进入会话（共享注入或登录）→ 目标页加载/空态/交互（搜索、筛选、分页、删除）→ 编辑/保存 → 抓 console/page 错误。

## 说明
- 与既有 skill 分工：`/review` 只扫约定且只报告；`/check` 只 lint/typecheck；本 skill **约定 + 真 bug + 用户拍板 + 实测**一条龙，会读逻辑、给选择题。
- **并行提速**：找 bug 阶段（step 0-3，纯读代码）零浏览器、天然可并行，多个会话各审不同目录即可；只有 step-5 要浏览器，用 `scripts/audit-shared-session.sh` 播种共享会话、各会话 `audit-api-check.sh` 或 Playwright inject，避开单端登录互踢。共享缓存 `.audit-session` / `.audit-cookies*` 已 gitignored。
- 测试产物 `.playwright-mcp`（及 `.playwright`）已 gitignore，别提交。
