---
name: array-index-trim-nouncheckedindexedaccess
description: "ESLint 不管 TS 类型；vue-tsc 开了 noUncheckedIndexedAccess，`parts[i].trim()` 下标访问报 TS2532 'Object is possibly undefined'，要写成 `(parts[i] ?? '').trim()`"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 3516d828-7163-41ba-9923-6fe96175c5f6
  modified: 2026-08-25T07:40:03.341Z
---

`eslint.config.mjs` 的 flat config 不跑类型检查，所以**下标直接 `.trim()`/调用方法**这种只在 strict 类型下才炸的错误，`bunx eslint .` 全绿、`bunx nuxi typecheck` 才报。

本仓库 vue-tsc 启用 `noUncheckedIndexedAccess`（看 tsconfig / nuxt 默认 strict），数组下标 `arr[i]` 的类型是 `T | undefined`，对它直接 `parts[i].trim()` 会报 `TS2532: Object is possibly 'undefined'`。

**Fix 范式**：`const p = (parts[i] ?? "").trim();`（或 `parts[i]?.trim() ?? ""`、`String(parts[i] ?? "")`）。

**Why**：并行批改（[[cli-skill-audit-workflow]] 一类的一次多文件工作流）里 agent 各自跑 eslint 校验，eslint 检查不到类型，导致此类错误在 typecheck 才暴露；而 `nuxi typecheck` 的 exit code 经 `| tail` 管道时会失真（取的是 tail 的码），正确判读要 `grep "error TS"`。

**How to apply**：给工作流 agent 校验时，除了 eslint 还要跑 typecheck 并 grep `error TS`；自己写循环下标时统一用 `?? ""` 兜底；server 里 `parts[i].trim()` 出现在 login.post.ts / mini/comments.post.ts 的 getClientIp，2026-08-25 修过。相关：[[lint-typecheck-no-root-script]]、[[eslint-adopted-strict]]。
