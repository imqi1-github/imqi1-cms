---
name: hotfix-targeted-chunk-upload
description: server-only 热修只能就地改 .output/server 的单个 chunk；build hash 烘焙进 server 端，不能只传 .output/server；chunk 导入别名每次 build 都变
metadata:
  type: project
---

**server-only 改动的免打包热修路径**（线上出问题时用，等下次发版被覆盖）：

- Nitro 把每个 api handler 编译成独立 chunk：`.output/server/chunks/routes/api/**`；共享 util 的导出在 `chunks/_/nitro.mjs`，导入方用**别名**（形如 `getClientIp as ab` 导出、`ab as getClientIp` 导入）。**别名每次 build 都会变**，跨版本覆盖前必须核对。
- build hash 烘焙进 server bundle（`runtimeConfig.buildHash`，由 `/api/site` 下发）⇒ **重 build 后只传 `.output/server` 会断静态引用**（`static/<新hash>` 不在 COS）。真·增量只能点传单个 chunk、不动 hash；或运行时 `NUXT_BUILD_HASH=<旧hash>` 压住（备用手段）。
- 实际手段是**在服务器上就地 sed**（比点传更稳）：改前必须有前置 grep 守卫（旧实现还在 + 导出别名一致，如 `grep -c "getClientIp as ab" .output/server/chunks/_/nitro.mjs`）；改完 `node --check` + 留 `.bak-<时间戳>`。
  ⚠️ **`node --check` 只查语法、不解析导入** —— 别名错了该路由**首次请求**才炸（懒加载 500）。
- 产物里中文是 `\uXXXX` 转义、变量名带 `_count2` 之类后缀，定位要靠 grep，不能照抄源码。
- 补丁期间**别再跑 `bun run build`**（会重写 `.output`，丢掉补丁）。

相关：[[build-hash-nitro-path]]
