---
name: cdn-edgeone-purge-and-cache-migration
description: 页面缓存三层结构（EdgeOne 边缘 / Nitro 源站 / 短期缓存）、双档 TTL、写库主动失效链、边缘额度模型、EdgeOne API 形态与 TC3 签名、nginx 透传要求、不可违背的铁律
metadata:
  type: project
---

# 页面缓存三层结构与 EdgeOne 边缘失效（现状）

用户 CDN = **腾讯云 EdgeOne**。页面整页缓存的主战场是**边缘缓存**；Redis 是**可选**组件（生产可以不装）。

## 一、三层结构与职责

| 层 | 实现位置 | 键/载体 | TTL |
|---|---|---|---|
| 边缘层 | EdgeOne 控制台（规则=**跟随源站 Cache-Control**） | 边缘缓存条目 | 内容页 `build.edgeCacheSeconds`=3600（1h）／列表页 `build.listPageCacheSeconds`=15／公开 API 60 |
| 源站层 | Nitro routeRules `cache`（`nuxt.config.ts` 的 `pageCacheRules`） | Redis 驱动 `nitro:routes:_:<frag>.<hash>.json` 或文件驱动 `.nitro/cache/nitro/routes/_/<frag>.<hash>.json` | 内容页 `build.pageCacheSeconds`=21600（6h） |
| 短期缓存/计数 | `server/utils/cache/store.ts`（Redis 优先 → 进程内内存回落） | `search:` / `custom:footprint` / `likes:` / `error:notify:` / `rl:` / `login:` | 各 API 自定 |

- 源站层**两种驱动都在**（Redis 开→`base:"redis"`；关→`base:"cache"`→文件驱动）。详见 [[nitro-source-cache-layer]]。
- 短期缓存使用者：搜索结果（`server/api/search.get.ts`）、访客分布聚合（`server/api/footprint.get.ts`，键 `custom:footprint`，TTL 10 分钟）、点赞限速、错误通知去重；限流在 `server/utils/rate-limit.ts` / `login-rate-limit.ts`（Redis 优先、异常回落内存）。
- **TTL 档位单一来源**：`shared/cache-routes.ts` 的 `isListPageRoute()` / `isCdnCachedPage()`，nuxt.config 与运行时响应头共用（别各写一套）。
- **边缘 TTL 与源站 TTL 刻意分开**（2026-11-07）：边缘到期回源验证时命中源站缓存 → 只回 304（ETag），不重渲染 ⇒ 边缘 TTL 可以远小于源站 TTL。改边缘 TTL 不增加源站渲染量；只降源站 TTL 才会加重渲染。
- 响应头最终由 `server/plugins/cache-control.ts` 的 `beforeResponse` 决定：routeRules 的 `headers` 会被 Nitro 缓存处理器写死的 `max-age=<源站 TTL>` 覆盖，**只有 beforeResponse 能改回来**。页面 `public, max-age=0, s-maxage=<档位>`；公开 API `max-age=0, s-maxage=60`；**所有 4xx/5xx 一律 `no-store`**（边缘「默认缓存」会把无 Cache-Control 的错误响应缓存半小时）。
- 304 走不到 beforeResponse（h3 在 event.handled 时跳过）→ 由 `server/middleware/cache-304.ts` 在 `writeHead` 里按路径改写成该路径真正的边缘 TTL。

## 二、写库主动失效链（核心链路）

`server/utils/content-cache.ts` 的 `invalidateContentCaches()`，被所有写库接口调用：

1. **清源站缓存**（`server/utils/source-cache.ts` 的 `clearSourceCache`，**驱动无关**，Redis/文件都能精确失效）→ 含 `api*` 与 `search*` 键（否则边缘回源拿到旧 JSON / 旧搜索结果）。
1b. **清搜索短缓存**（`search:*` 前缀，2026-11-07 加）——搜索结果是 contents/metas/comments 的派生视图，不清则改完要等 `searchCacheExpire`（默认 5 分钟）才搜得到。
2. **排边缘刷新**（`scheduleCdnPurge`，`PURGE_DEBOUNCE_MS` = **2 秒**，与编辑器自动保存间隔对齐）→ 防抖窗口内合并成一次提交 → `flushCdnPurge` → `purgeCdnUrls`（精确 URL）／`purgeCdnRoutes`（目录前缀）。

> **铁律：边缘刷了哪条，源站就得清哪条。** 否则边缘回源时源站命中旧缓存回 304 → 旧内容复活。

### 刷新目标按「展示面」（scope）展开

`server/types/utils/content-cache.d.ts` 的 `ContentScope`：`article`（文章页）｜`card`（显示卡片的页：分类/标签/首页/归档/站点地图）｜`related`（引用了这篇文章的「相关文章」页）｜`listDir`（文章进出列表 → 页码位移）｜`fixed`（固定页与公开接口）。**不传 scopes = 保守全刷**。

- 计数类变更（评论增删/审核）显式传 `countOnly: true` → 只刷「文章所在的那一页」（`server/utils/content-urls.ts` 的 `contentListPagePaths` 按 `create_time` 位次算页码，**邻页 ±1** 兜并列）。
- 内容类变更（增删改/改分类归属/改发布状态）→ 后续页码位移 → 分类/标签目录整组刷（`LIST_EDGE_DIRECTORIES` = 2 条目录额度，低频）。
- 目标优先级：**精确 URL**（URL 池）优先，展开不了或超阈值才退回**目录前缀**（目录池紧）。`server/utils/cdn/route-url.ts`：`/xxx/**`→prefix、`/xxx`→url、空/`/**`→根 prefix；`CDN_PURGE_SCOPE=site` → 不管什么路由都合并成一条根前缀（省额度、多回源）。
- 精确刷的文章页 URL 集合：`contentUrlPaths`（含改 slug 后的旧地址）；相关文章页按 `relatedContentPagePaths` 反查。

## 三、边缘额度模型

- 实时读 `DescribeContentQuota`（60 秒快照缓存）→ 三个池：**URL**／**目录+Host 共用**／**整站**。按**资源条目数**计（3 个目录 = 3 个额度），不是任务数。
- 额度不够 → **只提交额度内的部分**并注明未提交数量；模块级 `purgeCursor` **轮转**提交起点，保证每个目标都有机会刷到（不轮转 = 永远只刷前 N 个）。
- 剩余 <20% → 每天告警一次（`warnLowQuota`）；额度用尽 → 当天不再自动刷新（`isCdnQuotaExhausted`，按天复位），内容靠边缘 TTL 自然更新。
- 写库自动刷新默认开启（`CDN_AUTO_PURGE=0` 关闭）；后台手动刷新与 MCP `target=cdn` 不受此开关限制。

## 四、EdgeOne API 形态与签名

- **只有一个建任务接口 `CreatePurgeTask`**（service=`teo`、version=`2022-09-01`、host=`teo.tencentcloudapi.com`），用 `Type` 区分：`purge_url`（必须带协议、**不支持通配符**）／`purge_prefix`（带协议 + 结尾斜杠）／`purge_host`（只写主机名）／`purge_all`。
- 目标字段叫 **`Targets`**（不是 Urls）；返回 **`JobId`**（不是 TaskId）；状态用 `DescribePurgeTasks`（Filters 里 `job-id`，状态 processing/success/failed/timeout/canceled）。
- **TC3 签名三步派生**（`server/utils/cdn/tencent-signature.ts`）：`kDate=HMAC("TC3"+SecretKey, date)` → `kService=HMAC(kDate, service)` → `kSigning=HMAC(kService, "tc3_request")` → `signature=HMAC(kSigning, stringToSign)`。**key 与 message 写反 100% 报 `AuthFailure.SignatureFailure`**。参与签名的头 `content-type;host;x-tc-action`（官方 SDK 签 `content-type;host`，本仓默认带 action，可关）。Content-Type 必须与实际发出的头逐字一致，`x-tc-action` 在 canonical headers 里小写。
- 请求 15 秒超时；单次提交条数默认 50（`CDN_PURGE_BATCH_SIZE` 可覆盖）。
- 权限 `teo:*`（策略 `QcloudTEOFullAccess`），不是 `cdn:*`。

## 五、必须同时满足的外部条件

1. **nginx 要透传源站 Cache-Control**：`scripts/generate-nginx-conf.ts` 默认强制 `no-cache, no-store, must-revalidate` 且 `proxy_hide_header Cache-Control` → 边缘缓存彻底废掉。要透传必须 `.env` 里 `DEPLOY_CDN_CACHE_PAGES="true"` **再重新生成** nginx 配置。
2. **EdgeOne 控制台规则 = 跟随源站**（`Cache.FollowOrigin`），别用「强制 TTL」的自定义规则（会无视源站 no-store，把 `/api/csrf/token` 缓存掉并剥掉 Set-Cookie → 登录必 403）。`/admin/**`、`/login`、`/api/*` 子规则保持 `DefaultCache:off`。
3. **服务器要有刷新凭据**（`EDGEONE_*`），否则内容变更不会即时从边缘失效（`warnCdnNotConfigured` 只告警一次，别当静默）。
4. **边缘缓存键含查询串** → 站点级 `CacheKey.QueryString.Switch` 保持 on，别改成「忽略查询串」（`/category/**?page=N` 会串页）。

## 六、SSR 必须与登录态无关（缓存页面的前提）

所有随登录态变化的 UI 都在 `<ClientOnly>` 里；SSR 阶段 `isLoggedIn` 恒 false；前端零 `useCookie`。⇒ 匿名与已登录抓到的 SSR HTML 逐字节相同，边缘才能缓存页面。**以后在页面 setup 里服务端读会话并渲染用户态就会把 A 的 HTML 发给 B**。

守卫测试：`test/unit/app/ssr-user-independent-invariant.test.ts`（静态）+ `test/e2e/ssr-user-independence.spec.ts`（真 SSR 对比）。

## 七、查询串与 301 规范化

- `shared/cache-routes.ts` 的 `SIGNIFICANT_QUERY_PARAMS` 登记「会改变 SSR 输出」的参数（`/category/**`=page、`/tag/**`=page、`/map`=view+place、`/subscribes`=source、`/changelogs`=type）。**漏登记 = 源站与边缘串页**（生产真实发生过：`/map?place=` 漏登记 → 全站标题变「中街」）。
- `server/middleware/cache-canonical.ts`（生产）把不影响 SSR 的参数剥掉并 **301** 到规范 URL → 边缘只存一条缓存，精确刷新即覆盖；`server/middleware/cache-key.ts` 同步归一化源站缓存键（否则爬虫推广参数各生成一份缓存文件 + 一次整页渲染）。

## 八、启动行为（`server/plugins/cache-reset.ts`）

- **源站缓存每次启动清空**：配了 Redis → `redis.flushdb()`（清**整个 db0**）；没配 → `useStorage("cache").clear()`（文件驱动）。清空 await 完成才开始监听（否则与启动请求并发写坏 `.nitro/cache`）。
- **边缘缓存只在 buildHash 变化时刷一次**（换构建后旧 HTML 引用的 `static/<旧hash>` 资源可能已清理）；标记存 fs 挂载 `deploy/edge-cache-build-hash`，**成功才落标记**；`CDN_PURGE_ON_STARTUP=0` 可关。

## 九、开发环境一律不启用（与「开发恒不启用 Redis」同口径）

边缘缓存头（`isProduction` 门控）｜短期缓存（`cacheDisabled()` 判 `NODE_ENV==="development"`）｜**CDN 刷新**（`isCdnDisabledByEnv()`——不加这道闸，本地 .env 配了密钥就会每次写库真去刷生产站，既白烧额度又可能把线上刷成旧内容）｜Redis（`getRedisConfig` 非 production 恒 null）。

## 十、已知边界与雷区

- `/search` **不进边缘**（`no-store`）；源站缓存**只在配了 Redis 时挂**（`nuxt.config.ts` 的 `/search` 规则）→ 无 Redis 时每次搜索都实打实查库 + SSR。
- **额度耗尽时内容页挂满 1 小时边缘 TTL**（列表页 15s 照常更新）；源站缓存已清（数据是新的），只是边缘手里那份旧 HTML 还在。
- ⚠️ **不要用整站刷新做兜底**：整站刷新 + 启动清空源站缓存 ⇒ 全站回源全量渲染（单页 ~411ms，156 篇连续渲染）⇒ 3.9GB 内存下曾把进程打死 → 5 分钟 502。
- 边缘是否命中看响应头 **`EO-Cache-Status`**（HIT/MISS/RefreshHit）与 **`Age`**（持续增长 = 命中缓存；改控制台规则后必须实测 Age 是否复位，否则源站的 TTL 白改）。

## 十一、环境变量清单（运行时，不烘焙）

`EDGEONE_ZONE_ID`（必填）｜`EDGEONE_SECRET_ID` / `EDGEONE_SECRET_KEY`（必填）｜`EDGEONE_REGION`（可选）｜`EDGEONE_API_HOST`（国际站）｜`CDN_PROVIDER`（默认按上面自动识别 edgeone）｜`CDN_AUTO_PURGE`（默认开）｜`CDN_PURGE_BASE_URL`｜`CDN_PURGE_SCOPE`（route/site）｜`CDN_PURGE_BATCH_SIZE`｜`CDN_PURGE_ON_STARTUP`（默认开）。

密钥走**运行时环境变量**，不烘焙进产物。

相关：[[redis-build-baked-docker-ondemand]]、[[nitro-source-cache-layer]]、[[site-config-values-stay-bare]]、[[build-hash-nitro-path]]、[[mcp-ops-tools]]
