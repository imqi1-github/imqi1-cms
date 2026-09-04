---
name: post-change-lint-chain
description: 每次代码改动后必跑 eslint + nuxi typecheck + tailwindcss:lint 三件套,无需等提交前
metadata:
  type: feedback
  originSessionId: 2ce53c45-c3ae-4342-882e-3e5525896d2c
---

**用户强原则(2026-09-04 锁定):每次代码改动后必跑 lint 三件套——不是只在提交前。**

## 三件套

```bash
bunx eslint .                          # 1) JS/TS/Vue 模板规范(.vue/.ts 改动后)
bunx nuxi typecheck                    # 2) 端到端类型(类型/接口改动后,根 .nuxt/tsconfig.json)
bun run tailwindcss:lint               # 3) Tailwind 类名规范(任何时候都跑)
```

## 触发时机

- 「**每次代码改动后**」= 改完即跑,不攒到 commit 前
- 三件套是**同时跑**,不是顺序;tailwindcss:lint 与 eslint/typecheck 并列,不是「跟 commit 绑定的额外一道」
- 改 docs/comments/纯 markdown 可省 typecheck 与 eslint,但 tailwindcss:lint 仍建议跑(快、几十秒)

## 命令细节

- 根目录必须(CLAUDE.md `lint-typecheck-no-root-script`):bash CWD 易残留在 mini/ 致验错项目,先 `pwd` 确认
- `bunx eslint .` ≠ `bun run lint` —— 根 package.json 没有 lint 脚本,务必用 bunx
- `bunx nuxi typecheck` 走 .nuxt/tsconfig.json,根 vue-tsc 不走它会漏报
- `bun run tailwindcss:lint` 跑 scripts/tailwindcss-lint.mjs,扫 CSS 指令 / 类名冲突 / canonical 建议

## 退出判定

任何一项 exit ≠ 0 即视为未通过;修完再跑下一项,不要 `git commit --no-verify` 绕过。

## 何时必须三件套全跑

- 改 .vue(组件/页面/布局) → eslint + tailwindcss:lint 必跑
- 改 .ts 类型/接口/composable/server api → eslint + typecheck 必跑
- 改 schema.prisma → typecheck 必跑(prisma generate 联动)
- 改 CSS / Tailwind 配置 → tailwindcss:lint 必跑
- 后端纯逻辑(无类型签名变动) → 至少跑 eslint

相关:[[lint-typecheck-no-root-script]] [[eslint-adopted-strict]]