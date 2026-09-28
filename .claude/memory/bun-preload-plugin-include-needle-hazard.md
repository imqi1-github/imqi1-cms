---
name: bun-preload-plugin-include-needle-hazard
description: "bun-preload plugin 注入判定用 src.includes(关键字) 会被注释字符串误判漏注入,改 src.startsWith('import \"...\"')"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 1f182c31-517f-4d2f-9ec0-e8b8236ee4da
  modified: 2026-09-28T09:36:51.879Z
---

`test/helpers/bun-preload.ts` 的 Bun.plugin 给 `test/app/composables/*.test.ts` 注入首行 `import "#test/app/composables/setup-composable-globals";`。**判定"已注入"必须用 `src.startsWith('import "..."')`,不能用 `src.includes("setup-composable-globals")`**。

**坑(2026-09-28 实测):** `usePlayerManager.test.ts` 注释里出现"setup-composable-globals 提供了 useNuxtApp stub"字面量,`src.includes("setup-composable-globals")` 返 true → `patched === src`(没注入首行 import)→ `useNuxtApp` 未注册到 globalThis → 3 个测试全部 `ReferenceError: useNuxtApp is not defined`。

**Why:** 注释、字符串、文档链接里都可能包含注入关键字字面量,`includes` 会把它们当成"已注入"。`startsWith` 严格按首行实际 import 判定,不会误命中。

**How to apply:**
- `bun-preload.ts` plugin 注入判定:
  ```ts
  // ❌ 会被注释/字符串误命中
  const patched = src.includes("setup-composable-globals") ? src : `import "...";\n${src}`;
  // ✅ 按实际 import 判定
  const alreadyInjected = src.startsWith('import "#test/app/composables/setup-composable-globals";');
  const patched = alreadyInjected ? src : `import "#test/app/composables/setup-composable-globals";\n${src}`;
  ```
- 类似 plugin 注入判定都用 `startsWith('import "<模块路径>";')` 而不是 `includes`
- 写新 composable 测试时,若测试文件 import composable 报错说 Nuxt 全局未定义,先看 `setup-composable-globals` 是否被注入(注释里写关键字字符串会导致 plugin 漏注入)