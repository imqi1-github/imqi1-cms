---
name: ssr-internal-request-secret
description: x-ssr-internal-request 密钥不再回落源码里的公开常量（2026-09-14 修）；由 Nitro 插件启动时写入 process.env 兜底随机值，因 app/nitro 两个 bundle 模块状态不共享
metadata:
  node_type: memory
  type: security
---

`x-ssr-internal-request` 头用于让**服务端自己的 SSR 请求**绕过 referer 门禁。发起端 `app/utils/internal-request.ts`（只在 `import.meta.server` 时返回该头，客户端返回 `{}`）、校验端 `server/middleware/referer-check.ts`（dev 下整段跳过）。

**为什么不能各写各的随机值**：发起端在 app bundle、校验端在 nitro bundle，**模块级状态互不可见**（与 [[nuxt-ssr-api-bundle-singleton-memory-session]] 同一个坑）。所以两侧各自 `randomBytes` 必然不一致 → SSR 内部请求全部 403。密钥必须落在**进程级共享的 `process.env`** 上：`server/plugins/ssr-internal-secret.ts` 在启动时写入，两侧随后读到的就是同一个值。

**原 bug（2026-09-14 修）**：两处都 `process.env.SSR_INTERNAL_REQUEST_SECRET || "imqi1-cms-ssr-internal-request"` —— 那个常量**写在本公开仓库的源码里**，等于把门禁钥匙摆在明处：任何人发这个头就能绕过 referer 校验。现改为未配置则启动时 `randomBytes(32)` 写入 `process.env`；两侧都去掉常量回落，取不到就不放行（fail-closed）。与 `server/utils/security-token.ts` 对 `LOGIN_SECRET` 的兜底策略对齐：**宁可每次启动换密钥，也不留公开常量**。密钥随重启变化无副作用——两侧同进程总是一起变。

**app 侧 `process.env.X` 不会被 Vite 内联**（实测产物 `chunks/build/server.mjs` 里是 `process.env.SSR_INTERNAL_REQUEST_SECRET` 运行时读取，非 `||` 常量），所以插件启动时写入对两侧同时生效——这是整个方案成立的前提。

**验证方式**（本仓库无测试框架）：`bun run build` 后 `NODE_ENV=production NITRO_PORT=3100 node .output/server/index.mjs`，再 curl `/api/<任意路径>`（403=门禁拦住，404=过了门禁但无此路由）：
- 不设 env + 带旧的公开常量 → 必须 **403**（修复后的关键证据）
- `SSR_INTERNAL_REQUEST_SECRET=xxx` + 带 `xxx` → 不 403；带错值/旧常量 → 403

公开 URL 白名单（`siteConfig.security.allowedRefererDomains`）是同一道 referer 门禁的另一半。

**新增 SSR 内 useFetch 必带 `headers: getInternalRequestHeaders()`**（2026-10-07 实锤）：v1.2.0 五个列表页拉 `/api/likes/counts` 全漏了这个头 → SSR 内部请求无 Referer 无密钥 → 生产全部 403 → 首页/归档/分类/标签/搜索点赞数恒「暂无点赞」；浏览器内 fetch 有 Referer 正常，所以只有 SSR 烘焙的数据是坏的。**dev 下 referer-check 整段跳过，本地永远复现不了**。修复：列表接口直接内联 `like_num`（Prisma `_count`，与 `comment_num` 同语义），取消独立拉取；`/api/likes/counts` 仅剩 admin 客户端在用（浏览器 Referer 放行）。曾用 sed 停补丁给生产 nitro.mjs 的 referer-check 加 `/api/likes/` 白名单过渡（编译产物未压缩、锚点唯一可 patch，但下次全量发版自动覆盖）。
