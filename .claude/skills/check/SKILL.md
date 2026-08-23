---
name: check
description: 校验本次改动（lint + typecheck），自动 cd 回项目根跑，防 CWD 残留在 mini/ 验错项目。改动 Nuxt / mini 代码后、验证是否通过 lint 与类型检查时使用。
---

# /check — 校验改动（Nuxt / mini）

CLAUDE.md：根目录**没有** lint/type-check 脚本，必须回到项目根再用 `bunx eslint .` / `bunx nuxi typecheck`；CWD 残留在 `mini/` 会验错项目（mini 的脚本在根，用 `bun run mini:*`）。本流程**先把目录校正回项目根**再跑，这是最关键的一步。

## 0. 确定目标
- 参数 `mini` → 只跑小程序校验。
- 参数是一个路径（如 `server/api/admin/xxx.post.ts`）→ 只 eslint 该路径 + 全项目 typecheck。
- 无参数 → 全项目 lint + typecheck。

## 1. 校正到项目根（防 CWD 残留）
```bash
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")"
# ROOT 必须是含 app/ + server/ 的 Nuxt 根，而不是 mini/ 等子目录
if [ -d "$ROOT/app" ] && [ -d "$ROOT/server" ]; then
  cd "$ROOT" && echo "已校正到项目根: $ROOT"
else
  echo "✗ 未定位到 Nuxt 项目根（当前: $PWD），请手动确认目录后重试" && exit 1
fi
```

## 2. 分支执行

### 若目标是 mini
```bash
bun run mini:lint
bun run mini:type-check
```
> 这两条是根脚本（`mini:lint`/`mini:type-check`），从 ROOT 跑即可，不用 `cd mini`。

### 否则（Nuxt 项目，默认或指定路径）
```bash
# 2a. ESLint（参数给了路径就只跑该路径，默认整个项目）
bunx eslint "${1:-.}"

# 2b. typecheck（必须走 nuxi！根 vue-tsc 不走 .nuxt/tsconfig.json 会漏报类型）
bunx nuxi typecheck
```
> `nuxi typecheck` 全项目较慢，属正常。若只想快速看 lint，可在参数路径时只跑 `2a` 并询问用户是否要 typecheck。

## 3. 汇报
- 有报错 → **原样贴出**（file:line + message），不要吞、不要改写。
- 全绿 → 一行确认「✓ eslint + typecheck 通过」。
- 某一步失败 → 停下，除非用户要求，否则**不**擅自把 lint 降级为 warn 或跳过 typecheck。
