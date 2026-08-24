---
name: review
description: 扫描仓库约定违规（...row 泄白名单 / select 漏敏感列 / admin 漏 CSRF / catch 吞 400/404 / 内联类型 / 禁 migrate / 敏感配置写死 / 会话用 Math.random），输出 file:line 与改法，只报告不自动修。默认跑 A/B/C/D + E2 人工核对；`--deep` 才额外跑 E1/F/G 空趟线。改动或评审公开接口、admin 写接口、DB schema、敏感配置、会话/令牌相关代码前，用来核对硬性约定与安全不变式时使用。
---

# /review — 约定违规扫描

按 CLAUDE.md 五条硬性约定扫存量违规。**只报告，不自动修复**，逐条给 `file:line → 违反哪条 → 改法`，停在这里让用户定夺。
- **用法分层**：`/review`（默认，跑 A/B/C/D + E2 人工核对）；`/review --deep` 才额外跑 **E1/F/G** 三条空趟线。范围参数可叠加：`/review server --deep`。
- 范围默认 `server app mini`；参数可收窄（如 `/review server`）。
- 本流程规则已在本仓库实测：**B（CSRF）当前全绿**，价值在防新增写接口漏 CSRF；A 会捞出真实候选（如 `sitemap.get.ts ...category`）；D 较噪，属信息项。

## A. 公开接口泄字段（约定 1：禁 ...row / findMany 必带 select）

**A1. 直接展开敏感对象**
```bash
rg -n '\.\.\.\s*(row|meta|author|user|tag|category|content|comment|msg)\b' server app mini
```
> 命中即候选。**重点看 `.get.ts` 等公开/网关端**（`sitemap`、`links`、`comments`…）；`utils/*`、`lib/*` 里的 `...row`（如 `data-transfer.ts`）是内部操作，判为噪声。公开端命中 → 改成逐字段白名单构造。

**A2. findMany 所在文件是否整文件含 `select:`**（无则疑似漏白名单）
```bash
for f in $(rg -l '\.findMany' server app mini); do
  grep -q 'select:' "$f" || echo "NO_SELECT: $f"
done
```
> 会带出一批 admin/后台文件（`server/api/admin/*.get.ts`、工具类），它们面向内部，**需人工判断**；真正要收紧的是 `mini/**` 与 `app/**`。改法：`findMany` 后接 `select:{...}` 或逐字段构造响应。

**A3. 公开接口 select 里漏了敏感列**（约定 1：即使带了 select，也不能把 `password`/`secret`/`authCode` 等塞进响应）
```bash
rg -n '(password|secret|authCode|resetToken|salt)' server/api --glob '!**/admin/**'
```
> 只扫**公开**（非 admin）接口，避开后台表单/前端表单噪声。命中 → 看出处是「输入校验、内部标记」还是「被放进返回值」。当前仅 `auth/login.post.ts`（读 body 的 password 做校验）、`auth/me.get.ts`（注释写明 authCode 不暴露）——逐条确认确没进 `select`/响应即可。

## B. admin 写接口漏 CSRF（约定 2）

```bash
for f in $(find server/api/admin -name '*.post.ts' -o -name '*.put.ts' -o -name '*.delete.ts'); do
  grep -q 'validateCsrfToken' "$f" || echo "NO_CSRF: $f"
done
```
> **高危项**。命中说明新增写接口没走 CSRF。规则：POST/PUT 从 body `csrfToken`、DELETE 从 header `x-csrf-token`。参考 `server/api/admin/categories/[id].put.ts`（DELETE 的读 header 写法见 `links/[id].delete.ts`）。

## C. catch 吞错误（约定 3：别把 400/404 盖成 500）

列出 admin 写接口的 catch 块，人工过一眼：凡 catch 里没有 `'statusCode' in error` 原样透传、且没有 `P2025 → 404` 处理的标黄。
```bash
for f in $(find server/api/admin -name '*.post.ts' -o -name '*.put.ts' -o -name '*.delete.ts'); do
  echo "=== $f ==="; grep -n -A5 'catch' "$f" | head -12
done
```
> 范式参考：`if (error instanceof Error && 'statusCode' in error) throw error;` + `error.code === 'P2025'` → 404。详 `.claude/memory/admin-write-catch-swallow-pattern.md`。

## D. 内联类型（约定 4：类型放独立文件）

```bash
rg -n '^\s*(export\s+)?(interface|type)\s+\w+' server app --glob '*.ts' --glob '*.vue' --glob '!**/types/**'
```
> **信息项，最吵**。`.vue` 组件里的 `type Props` / Prop 类型是 Vue 惯例，通常合法；真正要挪的是 `server/`、`app/` 下的**领域/API 数据结构** interface/type → 移到 `server/types/apis` / `app/types/apis`。

## E. 敏感配置（约定 5：redis/amap key 走构建期烘焙或 env 注入，别写死在分支）

**E1.【--deep】redis 带凭据的字面量（应恒为空 = 趟线）**
```bash
rg -n 'redis://[^[:space:]]+:[^@[:space:]]+@' app server shared
```
> tripwire：命中说明把含密码的 redis URL 写死进代码，应改读 env。当前为空。

**E2. 人工核对（grep 不可靠，靠读文件确认约定没被破）**
- `shared/redis-config.ts`：`REDIS_*` 是否只从构建期 env 烘焙，没写死 host/password。
- `server/utils/cos.ts`：附件存储的 COS 密钥是否读**后台 informations 表**（而非 .env 的 `COS_*`——那套仅供 `upload-cos` 部署脚本用）。
- `app/utils/amap-loader.ts`：proxy 模式下浏览器是否**不持 key**（key/securityCode 由服务端 `/api/amap/config` 注入）。
> 三处任一发现字面量 → 违约定 5，改为 env/运行时注入。

## F.【--deep】会话/令牌必须 crypto.randomBytes（安全不变式）

```bash
rg -n 'Math\.random' server/lib/auth.ts server/utils/session-store.ts server/utils
```
> tripwire：`sessionId`/`authCode` 必须用 `crypto.randomBytes`；`Math.random()` 可预测 → 会话劫持。`auth.ts` 已注明禁用，命中即回归。当前为空。

## G.【--deep】DB 改动（约定 3：禁 migrate dev/reset，schema 走 db execute / 幂等 tsx）

```bash
rg -n 'migrate\s+(dev|reset)' package.json scripts
```
> tripwire：改成 `migrate dev/reset` 会 reset 丢数据，命中即违规。当前为空。
> 另注意**库名 `imqi1-cms`**（与目录/包名一致；同实例 imqi1/imqi1-old/imqi1-test 是历史库别碰），写库名处核对。

## 汇报格式
按 A/B/C/D 分组输出，每条：
```
file:line  |  违反：<约定缩写>  |  改法：<一句话>
```
- **默认（A/B/C/D + E2 核对）**：A、B＝高置信可修；C、D＝需人工判断；E2＝读三个文件核对。
- **`--deep` 额外（E1/F/G 趟线）**：报「✓ 未发现 / ⚠️ 命中：<file:line>」；未跑时说明「（已跳过 E1/F/G，需 --deep）」。
- 无违规 → 明确说「✓ 未发现 X」。
- 结尾给一句：是否有要我现在修的；若用户选，只动用户点名的条目。
