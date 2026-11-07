---
name: get-site-settings-uses-findmany-not-findunique
description: getSiteSettings 走 prisma.informations.findMany（批量合并 defaults），不是 findUnique；测它的 fake 必须注册 findMany 返数组
metadata:
  type: feedback
---

`server/utils/siteSettings.ts` 的 `getSiteSettings()` 走 **`prisma.informations.findMany({ where: { key: { in: Object.keys(defaults) } } })`**（批量取 settings 再合并 defaults），**不是** `findUnique`。

**Why:** `--isolate` 之后 mock handler 只在当前测试文件可见，每个文件必须自己注册用到的 model.method。之前靠别的文件模块级注册的 `informations.findMany` 跨文件共享才"能用"，`--isolate` 切断共享后拿不到 handler → `findMany` 返 null → catch 兜底返 defaults（siteUrl 落到 siteConfig.site.url）→ 测试期望值失败。

**How to apply:**
- 测 `getSiteSettings` 或用 siteUrl 的端点（sitemap/feed）时：`sharedFake.on("informations", "findMany", async () => [{ key: "siteUrl", value: "..." }, ...])`，返**数组**（每个 key 一条 row）。
- `findUnique` 只用于按主键查单条的场景（`sessionStoreType`、`commentAvatarService` 用它是对的）。
- 写 mock 前先看被测源码调哪个方法：`grep -n "prisma.informations" server/utils/siteSettings.ts`。
- 调试时若返回的 siteUrl/字段不符预期但没报错 ⇒ 多半是漏注册 handler，优先怀疑 `findMany`。

相关：[[bun-test-isolate-root-fix]]
