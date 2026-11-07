---
name: post-change-lint-chain
description: 每次代码改动后必跑 lint + typecheck + tailwindcss:lint 三件套（根目录有 bun run check 一键跑），无需等提交前
metadata:
  type: feedback
---

**用户强原则（2026-09-04 锁定）：每次代码改动后必跑 lint 三件套——不是只在提交前。**

## 三件套

```bash
bun run lint             # ESLint（scripts/lint.ts，--max-warnings=0，忽略 mini/）
bun run typecheck        # bunx nuxi typecheck（走 .nuxt/tsconfig.json）
bun run tailwindcss:lint # Tailwind 类名规范
bun run check            # 上面三项串行一次跑完
```

## 触发时机

- 「每次代码改动后」= 改完即跑，不攒到 commit 前；三件套是并列的三道，不是「跟 commit 绑定的额外一道」。
- 只改 docs/注释/纯 markdown 可省 typecheck 与 eslint，tailwindcss:lint 仍可跑（快）。
- 改 `mini/` 用 `bun run mini:lint` / `bun run mini:type-check`（CWD 别残留在 mini/）。

## 命令细节

- 根 `package.json` 已有 `lint` / `lint:fix` / `typecheck` / `check`，`bun run lint` 即可，等价于 `bunx eslint . --max-warnings=0`。
- `bun run typecheck` = `bunx nuxi typecheck`；**根 `vue-tsc` 不走 `.nuxt/tsconfig.json` 会漏报**（曾漏掉 Prisma 可空字段、emit payload 类型等），别用裸 vue-tsc 代替。
- 任何一项 exit ≠ 0 即未通过；修完再跑，不要 `--no-verify` 绕过。

## 何时必须全跑

- 改 .vue → lint + tailwindcss:lint
- 改 .ts（类型/接口/server api/composable）→ lint + typecheck
- 改 schema.prisma → typecheck（会联动 prisma generate）
- 改 CSS / Tailwind 配置 → tailwindcss:lint
- 后端纯逻辑（无类型签名变动）→ 至少 lint

相关：[[eslint-adopted-strict]]
