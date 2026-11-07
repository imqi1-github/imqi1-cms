---
name: cdn-edgeone-purge-and-cache-migration
description: 页面缓存迁到 CDN 边缘（EdgeOne），Redis 变可选；含 EdgeOne 刷新接口真实形态、TC3 签名三步派生、路由→刷新目标映射、nginx 透传 Cache-Control 的坑
metadata:
  type: project
---

2026-11 起，**页面整页缓存的主战场从「Nitro + Redis ISR」换成「CDN 边缘缓存」**，Redis 变成**可选**组件（生产可以不装）。用户 CDN 用 **腾讯云 EdgeOne**。

**当前策略（2026-11-05 定）：双档 TTL + 写库主动失效**。目标同时满足「边缘 TTL 尽量长（降源站压力）」和「改完尽快看到」——两者无法靠 TTL 兼顾，必须主动失效。
- **两档页面**（`shared/constants.ts` 的 `LIST_PAGE_ROUTES` / `CONTENT_PAGE_ROUTES`，`server/utils/cache-routes.ts` 的 `isListPageRoute` 判定）：
  - **列表/统计页**（`/`、`/category/**`、`/tag/**`、`/archiving`、`/about`、`/sitemap`）：内嵌评论数等聚合数据 → 边缘 TTL 短（`build.listPageCacheSeconds`，默认 **60 秒**），**写库时不提交边缘刷新**，靠 TTL 自然收敛。
  - **内容页**（`/content/**`、`/links`、`/subscribes`、`/changelogs`、`/agreement`、`/messages`、`/map`、`/sitemap.xml`）：边缘 TTL 长（`build.pageCacheSeconds`，默认 **21600 / 6 小时**），靠写库后的**精确 URL 刷新**保持新鲜（秒级可见）。
- **源站缓存两档都保持长**（`pageCacheSeconds`）：写库时删掉对应缓存键 → 下次回源即重新渲染，**源站渲染频率不变**；边缘 TTL 短只让边缘更频繁来问一次（命中源站缓存，很便宜）。源站缓存短了反而会让源站每 60 秒重渲染一次。
- 浏览器头由 `server/plugins/cache-control.ts` 的 `beforeResponse` 钩子统一改写：页面 `public, max-age=0, s-maxage=<按档位>`、公开 API `max-age=0, s-maxage=60`；4xx/5xx 改 `no-store`。**Nitro 缓存处理器会写死 `max-age=<源站 TTL>` 覆盖 routeRules 的 headers，只有 beforeResponse 能改回来。**
- `server/middleware/cache-conditional.ts` 在生产环境剥离缓存路径的 `If-None-Match`/`If-Modified-Since`：否则 Nitro 命中条件请求直接回 304 并写回 `max-age=<长 TTL>`，会把 CDN TTL 顶回去。
- `invalidateContentCaches` 写库后：① 清源站页面键，并同时清 `api*` 缓存键；② 5 秒防抖后展开成**精确 URL** 提交 EdgeOne。**区分变更类型**：`resolvePurgeTargets` 里 `countOnly = !routes.some(r => !isListPageRoute(r))` → 纯计数类变更（评论增删/审核，路由集全是列表页）**完全不提交边缘刷新**（0 额度，60 秒内自然收敛）；内容类变更才刷（并连带刷列表页，因为卡片也展示该文章）。
- `CDN_AUTO_PURGE` **默认开启**，=0 关闭。
- 开发环境不挂 routeRules 页面缓存、不下发边缘头（与 `cacheDisabled()` 同口径）。
- **实测额度（2026-11-05 生产）**：URL 池 1000/天、目录池 50/天、整站 10/天。按「2 篇文章 + 200 评论 + 其他」估算：文章 2×~15 + 评论 200×**0** + 其他 ~30 ≈ **60 URL/天**（余量 16 倍）；若评论也刷那 6 个固定 URL，单这一项就 1200 → 直接超限。

**源站缓存层的精确失效（`server/utils/source-cache.ts` 的 `clearSourceCache`）**：走 `useStorage("cache")` 而非裸 Redis SCAN——**驱动无关**（Redis 关掉后文件缓存照样能精确失效）。键形两套驱动不同：Redis `nitro:routes:_:<frag>.<hash>.json`、文件 `nitro/routes/_/<frag>.<hash>.json`；且**文件驱动的 `getKeys` 无视 base 返回全部键**（Redis 驱动才按 base 过滤）→ 实现要自己再筛缓存组（`isRouteCacheKey`）。键里的片段是**路径**的转义（`/content/cat/slug` → `contentcatslug`），路由片段（`/content/**` → `content`）只是它的**前缀** → 匹配用 `startsWith`。⚠️ 这个模块**独立于 `content-cache.ts`**：单测大量 `mock.module("#server/utils/content-cache")` 只提供 `invalidateContentCaches`，新导出放这里才不会把那些用例打成 SyntaxError（导出对不上）。

**源站缓存失效的生产验证**：`REDIS_ENABLED=false` 构建 + 生产运行 → 请求页面生成 `.nitro/cache/nitro/routes/_/<frag>.<hash>.json` → 调 MCP `clear_cache target=pages` → **3 个缓存文件被删**、日志 `[缓存] [INFO] invalidate routes=(all) cleared=3` ✓（MCP 端点要带 `Accept: application/json, text/event-stream`，否则 406；生产 cookie 是 secure 的，http 下 curl 不会带 → 走不了后台写接口的 CSRF）。

历史：2026-11-05 之前是「短 TTL 靠预刷新收敛」（1800 秒 + 1% 预刷新实测 25–37 秒；曾试 60 秒降到 ~9 秒但源站渲染 ×30 被回退）。现改为长 TTL + 主动失效，预刷新只作兜底，建议关闭或 90–99%（填 1% 会让每个请求都回源）。

**启动时的缓存清理（`server/plugins/cache-reset.ts`，取代原 `redis-cache-reset.ts`）**：① **源站缓存每次启动清空**——配了 Redis 就 `redis.flushdb()`（与原行为一致），没配则 `useStorage("cache").clear()`（文件缓存，驱动无关），否则重启后仍会命中旧构建残留；② **CDN 边缘缓存只在「构建变化」时刷一次**——不能每次启动都刷（重启一天可能好几次，免费版目录额度才 50/天），也不能不刷（换构建后旧 HTML 引用 `static/<旧 buildHash>`，资源被清理就 404）；用 `buildHash` 做去重，标记存 `fs` 挂载的 `deploy/edge-cache-build-hash`（跨重启/跨发版保留），**成功才落标记**（失败下次重试）；`CDN_PURGE_ON_STARTUP=0` 可关掉边缘那半边。实测：`REDIS_ENABLED=false` 构建启动 → 日志 `[cache] 服务启动：已清空源站缓存（文件缓存）`，`.nitro/cache/nitro/routes/_/` 旧文件被清空 ✓。

**主动刷新（EdgeOne API）默认开启**：写库后 5 秒防抖，精确 URL 走 URL 池、无法展开才退回目录池；`CDN_AUTO_PURGE=0` 关闭。后台手动刷新与 MCP `target=cdn` 不受此开关限制（人工动作）。

**分层现状**：CDN 边缘缓存 HTML（源站只渲染）→ 源站缓存层（`nuxt.config.ts` 的 `pageCacheRules`：Redis 或文件）→ 短期缓存与计数（`server/utils/cache/store.ts`：Redis 优先、异常或未启用回落**进程内内存** `server/utils/cache/memory-store.ts`）。计数器（限流 rl:/、登录锁定、点赞限速、错误通知去重）**CDN 换不了**，靠内存版即可（单实例部署够用）。**开发环境恒不启用缓存**（`cacheDisabled()` 判 `NODE_ENV === "development"`）：本地要能立刻看到刚改的数据，开了缓存就搜到旧结果——e2e 搜索用例（造文章→搜标题）就是被这条抓出来的；**测试环境保持启用**（单测要断言缓存读写确实发生）。`memoryExpire(key, ttlSec)` **两个参数都要传**（漏传 ttlSec → expiresAt=NaN → 键永不过期）。

**列表页分页变体：改为「精确刷文章所在的那一页」（2026-11-06 定，取代"只能靠 TTL"）**：分类/标签列表按 `content.create_time desc` 分页，一篇文章只落在**一页**上 ⇒ 位次 = 「同 mid 中 create_time 更晚的文章数 + 1」，页码 = ⌈位次 / 每页条数⌉（`server/utils/content-urls.ts` 的 `contentListPagePaths`，每页条数读 `informations.contentPageSize`，**必须与前台分页同值**否则页码算错）。于是：
- 文章保存（标题/摘要/封面/正文/更新时间在卡片上）→ 刷**那一页** → 不再出现「第 1 页新、第 2 页旧」；
- **评论增删/审核（countOnly）→ 也只刷那一页**（评论数就在卡片上）→ 评论数从 ≤15 秒变成**秒级**，约 1~2 URL/次、200 评论/天 ≈ 200~400 URL，仍在 1000/天 预算内；`countOnly` 不再刷路由派生的固定页（/、/about…）；
- 结构性变更（新增/删除/批量删除文章、发布状态变化、改分类/标签归属、定时发布）→ 后续文章页码整体位移 → **刷整个列表目录**（`shared/constants.ts` 的 `LIST_EDGE_DIRECTORIES = ["/category/**","/tag/**"]`，2 个目录额度/次，低频；目录池 50/天）。
`invalidateContentCaches` 新增 `edgeDirectories` 参数承载后者。**代价**：每次写库多 1~2 次 `contents.count`（走 create_time 索引）；`create_time` 并列时位次可能差 1 → 由列表页短 TTL 兜底。
**分页参数归一化**：`?page=1` / `?page=abc` / `?page=0`（后端都回退第 1 页）在 `canonicalSearch` 里一律剥掉并 301 到裸路径 → 「第 1 页」只有一条缓存键。`?page>=2` 保留（越界如 `?page=999` 也保留，由前端水合后 `router.replace` 钳制）。

**列表页 TTL 仍保留 15 秒作兜底**（`build.listPageCacheSeconds`）：它覆盖的是「算错页 / 并列位次 / 爬虫扫出的任意 `?page=N` / 首页与关于页」这些精确刷新够不到的情况。降 TTL 的代价靠 304（见上）压到几乎为零。

**「是否纯计数」必须显式声明，不能靠"路由里全是列表页"猜（2026-11-06）**：原启发式是"routes 全是列表页 → 跳过边缘刷新"；但**列表页档位与是否要刷边缘是两件事**（`/map` 挪进列表页档后，足迹变更会被误判成纯计数 → 文章页与地图页都不刷）。现在 `invalidateContentCaches` 的 `countOnly` 由调用方显式传（评论 5 个写接口都传了 `countOnly: true`），启发式已删。**/map 归入短 TTL 档**（15 秒）：它内嵌访客分布/足迹/博客网络，且 `?place=N` 的标题依赖地点名（改名后要跟着变）→ 不再展开它的 29 个查询串变体（短 TTL 已覆盖，省额度）。

**访客分布（读者地图）的粒度由源站聚合缓存决定，不是边缘 TTL**：`server/api/footprint.get.ts` 的聚合缓存（键 `custom:footprint`）TTL 已从 1 小时降到 **10 分钟**（`shared/constants.ts` 的 `FOOTPRINT_CACHE_TTL`；本地 qqwry ipdb 查表、无外部调用，重算成本可忽略）→ 读者地图 ≤10 分钟新鲜。⚠️ 该常量此前在 handler 里**私藏了一份写死的 3600**（与 shared 各存一份 → 改 shared 不生效）→ 已统一引 shared。边缘侧 `/api/footprint` 是 60 秒、`/map?view=footprint` 随 /map 走 15 秒档，但**聚合缓存是硬上限**（刷边缘也不会更新得更早）。

**全站"SSR 内嵌派生数据"的时效审计（2026-11-06，结论）**：评论数（列表页 ≤15s）、评论列表（文章页/留言板：客户端拉，实时）、点赞数（文章页：精确刷新，秒级；列表页 ≤15s）、访客分布（≤10min）、足迹/博客网络（≤15s）、文章数与统计（≤15s）、热力图（客户端拉，≤60s）、友链/订阅/日志/独立页/文章详情（精确刷新，秒级）、RSS（≤5min，设计如此）。⇒ **评论数是最后一处"只能靠 TTL"的**；其余要么精确刷新、要么本来就是客户端实时。


**CDN 抽象层 `server/utils/cdn/`**（接别家 CDN 只需继承 `CdnProviderBase` 实现 `purgeUrls` + `isEnabled`）：类型在 **`server/types/utils/cdn.d.ts`**（provider 契约、刷新结果、刷新目标，按仓库规则4 放独立类型文件）/ `base.ts`（公共父类：路由→目标转换、目录/Host 刷新的默认兜底、多结果合并）/`route-url.ts`（路由→刷新目标映射）/`edgeone.ts`（EdgeOne 实现）/`tencent-signature.ts`（TC3 签名）/`index.ts`（工厂 + `purgeCdnRoutes`/`purgeCdnUrls`，按 `CDN_PROVIDER`/`EDGEONE_ZONE_ID`/`EDGEONE_SECRET_*` 选实现（**命名口径：厂商专属用 `EDGEONE_` 前缀**——对齐 `COS_SECRET_ID` 的模式，不用 `TENCENTCLOUD_*` 那看着像通用变量的；与厂商无关的用 `CDN_` 前缀，换一家 CDN 时后者不动），未配置返回 null 即整段跳过）。密钥走**运行时环境变量**，不烘焙进产物。

**开发环境一律不启用（与「开发恒不启用 Redis」同口径）**：① 边缘缓存头——routeRules 的 `headers` 由 `isProduction` 门控，dev 不下发；② 服务端短期缓存——`server/utils/cache/store.ts` 的 `cacheDisabled()` 判 `NODE_ENV === "development"`；③ **CDN 刷新**——`server/utils/cdn/index.ts` 的 `isCdnDisabledByEnv()` 闸门（**这条最要紧**：本地 `.env` 配了 ZoneId/密钥时，不加闸门就会每次写库真去刷生产站，既白烧额度又可能把线上刷成旧内容）；④ Redis 本身——`shared/redis-config.ts` 只在 production 返回配置。

**EdgeOne 刷新接口的真实形态（与旧版腾讯云 CDN 完全不同，别照 CDN 的接口名写）**：只有一个建任务接口 **`CreatePurgeTask`**（service=`teo`、version=`2022-09-01`、host=`teo.tencentcloudapi.com`），用 `Type` 区分：`purge_url` / `purge_prefix` / `purge_host` / `purge_all` / `purge_cache_tag`；目标字段叫 **`Targets`**（不是 Urls），`purge_url` 必须带协议、`purge_prefix` 必须带结尾斜杠、`purge_host` 只写主机名；返回的是 **`JobId`**（不是 TaskId），查状态用 `DescribePurgeTasks`（Filters 里 `job-id`，状态 processing/success/failed/timeout/canceled）；**不支持通配符 URL**（`https://x/content/*` 非法），所以本站的 `/content/**` 路由转成**目录刷新**；权限是 `teo:*`（预设策略 `QcloudTEOFullAccess`），不是 `cdn:*`。文档 https://cloud.tencent.com/document/api/1552/80703 。

**刷新额度的口径（2026-11 查实，最容易踩）**：**`Daily`/`Batch` 计的是「资源条目数」不是任务数**（官方错误码文案：「当天提交的资源数超过上限」；套餐表单位是「个」）。提交 3 个目录 = 扣 3 个额度。免费版：URL 刷新 500 个/次、**1000 个/天**；目录/Host（共用一池）50 个/次、**50 个/天** ← 最紧；整站 `purge_all` 10 次/天。付费版的 URL 单日额度官方写「-」（无数值）→ **一律以运行时 `DescribeContentQuota` 为准，别写死数字**。额度用尽 = **硬失败**（任务不创建），已提交的任务照常执行；控制台手动刷新与 API 同一张表（未查到明文，按共用对待）。额度不够可调 **`IncreasePlanQuota`** 增购（刷新额度不计入套餐外超量费用）。本仓库据此做了三件事：provider 实时读额度（`describeQuota()`，60 秒快照缓存）决定单次提交上限 + **提交前预检**（不够就不提交并给出可读原因）；`CDN_PURGE_SCOPE=site` 把多路由合并成根目录一条（3 个目录额度 → 1 个）；后台「缓存管理」顶部显示今日剩余额度，额度耗尽当天不再自动刷新（靠 TTL 自然更新）。

**不靠"刷新"的手段（额度不够时用）**：① **短 TTL**（`site.config.ts` 的 `build.cdnCacheSeconds`，默认 300 秒 = 不发刷新时内容自动更新的最大延迟，改它要重新打包）；② EdgeOne 的 **缓存预刷新**（站点加速 → 缓存配置 → 缓存预刷新，百分比 1–99，**全套餐免费**）——节点在缓存过期前回源验证，**依赖源站支持条件请求**（本仓库已内置 ETag/304）；③ **预热不能替代刷新**（预热不覆盖未过期的旧缓存）；④ **Cache-Tag 只有企业版**（`purge_cache_tag`，`Targets` 填 tag 值、`CacheTag.Domains` 填域名）；⑤ EdgeOne **没有 origin→edge 的 purge webhook**（官方范式是 COS 事件 → SCF → 调 `CreatePurgeTask`）；⑥ 「自定义 Cache Key」能忽略查询串，但**绝不能对 `/search` 用**（会串号）；⑦ `Method=invalidate`（默认）是「标记过期 + 下次回源条件请求」，源站发 `ETag`/`Last-Modified` 才有 304 优化；验证边缘是否命中看响应头 **`EO-Cache-Status`**（HIT/MISS）。

**ETag/304（`server/plugins/etag.ts` + `server/utils/etag.ts`）**：页面响应带强 ETag，命中 `If-None-Match` 回 304（无正文、无 content-type/length）。**坑：Nuxt payload 是 devalue 扁平数组，`timeSsrStart` 的「值」不在对象里而在数组别处**（对象里存的是下标，如 `{"timeSsrStart":498}` + `payload[498]`）——按对象取值会取到下标、抹不掉时间戳，ETag 每次都变、304 永不生效。正确做法：正则取出 `__NUXT_DATA__` 的 JSON → `JSON.parse` → 找到带 `timeSsrStart` 的对象、拿它的下标、把 `payload[下标]` 置 0 → `JSON.stringify` 回填（**替换要用函数形式**，JSON 里可能含 `$&` 模式）。另：`useFetch` **不 await** 时 SSR 阶段数据可能没就绪 → payload 的 key 时有时无 → HTML 每次都不一样（导航会缺一段、ETag 不稳）→ `SiteNavMenu.vue` / `ActivityHeatmap.vue` 已补 `await`（实测修复后 HTML 稳定）；`/links` 的友链顺序是**故意洗牌**的，ETag 永远不稳（无害）。改 Nitro plugin 后 **dev server 必须重启**（plugin 不走 HMR，热重载不生效会误判成逻辑 bug）。**生产环境 `cache-conditional` 中间件会剥离条件请求头，源站不再回 304**（避免 304 把长 TTL 写回 CDN）；ETag 仍用于边缘↔浏览器。

**TC3 签名的坑（`tencent-signature.ts`，2026-11 实测踩中）**：① **派生密钥链每一步都是 `HMAC(key=上一步, msg=本步字符串)`**：kDate=HMAC("TC3"+SecretKey, date) → kService=HMAC(kDate, service) → kSigning=HMAC(kService, "tc3_request") → 签名=HMAC(kSigning, stringToSign)。**把 kService/kSigning 的 key 与 message 写反会 100% 报 `AuthFailure.SignatureFailure`**（本仓实现最初就写反了）。官方文档的伪代码变量名有歧义，**以官方 SDK `tencentcloud-sdk-nodejs-common/tencentcloud/common/sign.js` 为准**（它签 `content-type;host`，不带 x-tc-action）。⚠️ **「按文档独立重算」的交叉校验测不出这类错**（两处同时写反仍自洽）→ 正确做法是**用官方 SDK 产出的 golden vector 锁死**（单测里固定 ts/payload/假密钥，比对整条 Authorization）。② 参与签名的头默认 `content-type;host;x-tc-action`（实测 API 两种都收 ✓）；**Content-Type 必须与实际发出的头逐字一致**（签名写 `application/json` 就别发 `application/json; charset=utf-8`），`x-tc-action` 在 canonical headers 里要小写。③ 排查手法：**在服务器上直接调 `DescribeContentQuota`（只读、不消耗刷新额度）**，再装官方 SDK 用同一套凭据对照——SDK 成功就说明是自己实现的问题，SDK 也失败就是凭据问题。

**路由 → 刷新目标映射（`route-url.ts`）**：`/xxx/**` → 目录前缀（`https://域名/xxx/`），精确页 → 完整 URL，`/**` 与空列表 → 根目录前缀（= 全站页面）。`/search` **不进边缘缓存**（SSR 结果随查询词变化，边缘会堆一次性条目，且通配刷不掉带查询串的变体）。

**触发链路**：写库后走 `server/utils/content-cache.ts` 的 `invalidateContentCaches({ routes, contentCids })`——清源站页面键 + `api*` 键，并 `scheduleCdnPurge` 防抖 5 秒；flush 时按 cid 查 `contents.slug` + `contentrelations.metas` 生成精确 URL（文章页/分类页/标签页/独立页面 + 相关 API），查不到 cid（删除）或批量变更才退回目录刷新。**纯计数变更（评论：路由集全是列表页）整段跳过边缘刷新**（显式传 `countOnly: true`）→ 0 额度、60 秒内靠 TTL 收敛。调用点在文章/评论/附件/分类标签关联等写接口传了 `contentCids`；其余不传的走目录兜底。新增参数：`edgeRoutes`（显式指定边缘刷新的路由，传 `[]` = 只刷 `edgePaths`；不传 = 沿用 `routes`）与 `edgePaths`（具体路径）→ 用来把「源站缓存要清的路由」与「边缘要刷的路由」解耦（点赞只刷文章页即 `edgeRoutes: []` + `edgePaths: [文章URL]`）。后台手动刷新：`POST /api/admin/cache/cdn-purge`（action=all/routes/urls/zone/status）+ 后台「缓存管理 → CDN 边缘缓存」；MCP `clear_cache` 的 `target=pages` 现在也会触发一次防抖边缘刷新，`target=cdn` 立即刷。**EdgeOne 刷新是异步的**（只返回 JobId），`describeTask(jobId)` 查状态。**未配置 CDN 时自动刷新路径也要告警**（`warnCdnNotConfigured()`）——否则忘配密钥全程静默，内容不即时更新没人知道。

**日志口径（`server/utils/cdn/index.ts` 的 `runCdnPurge` 统一出口，自动刷新与后台手动刷新都走它）**：`log.cache("CDN 刷新", {provider, 来源(自动/后台手动), 路由, 目标数, 结果(成功/失败 …), 任务号, 状态})` → 落 `logs/缓存/`；状态查询单独一行 `log.cache("CDN 刷新状态", …)` 便于区分；额度耗尽 `log.error` 一次（当天不再自动刷新）；provider 抛异常 `log.error("[cdn] 刷新失败")`；**未配置 CDN 时只 `log.error` 一次**（否则忘配密钥会全程静默，内容不即时更新也没人知道）。日志字段值含空格会被日志工具 JSON 引号包住（`结果="失败 …"`），断言时别直接 `toContain("结果=失败")`。

**nginx 的坑（不改就白搭）**：`scripts/generate-nginx-conf.ts` 生成的配置默认在 `location /` 强制 `no-cache, no-store, must-revalidate` 且 `proxy_hide_header Cache-Control`，会把边缘缓存彻底废掉。要透传源站的 `Cache-Control`（页面规则下发 `public, max-age=0, s-maxage=1800`）必须 `.env` 里加 `DEPLOY_CDN_CACHE_PAGES="true"` 再重新生成。

**EdgeOne 缓存策略实测（2026-11）**：① 「自定义规则 + 强制 TTL」模式**无视源站的 `no-store`**（会把 `/api/csrf/token` 缓存掉、且剥掉 Set-Cookie → 登录必然 403「CSRF token 验证失败」；请求侧带 `Cache-Control: no-cache` 也**无效**）；② 切「**遵循源站 Cache-Control**」后：敏感接口（源站已发 no-store 的 csrf/token、captcha/image、auth/verify、attachments/list）→ MISS ✓ 不缓存 ✓，公开接口（`public, max-age=300, s-maxage=300`）→ HIT ✓。⇒ **边缘规则要用「遵循源站」，别用强制 TTL 的自定义规则**。③ **缓存预刷新百分比的语义极易搞反**：它是「**从 TTL 的第百分之几开始**回源验证」，**数值越小越早验证**（官方例：TTL 10 秒、填 80% → 第 8–10 秒才验证）。⚠️ 早前误判为「越大越频繁」并建议设 99%，实测（2026-11-05 生产）：`/about` 的 `Age` 42→62→82 秒一路递增、源站访问日志**完全没有页面请求** → 99% 等于「TTL 快到期才验证」，内容变更最坏要等整个 TTL（1800 秒）才生效。要快就填 **1%**（1800s → 18 秒后每个请求都验）；验证生效时边缘返回 `RefreshHit`。→ 客户端延迟大降（API 250–760ms → 160ms ≈ 纯 POP）但**源站 DB 照跑**；页面侧靠源站 ISR+ETag 让验证只花 3ms ✓，API 侧必须自己加源站缓存（`nuxt.config.ts` 的 `PUBLIC_STATIC_API_ROUTES`：categories/tags/site/travels/subscribes/changelogs/blog-network，60 秒）才不让每次验证都跑 DB。④ `/api/heatmap`、`/feed/**` 原先只在有 Redis 时才挂缓存 → 关掉 Redis 就每次全表扫 ✓ 已修为 base 按 redis/cache 自适应 ✓。

**响应头最终由 `server/plugins/cache-control.ts` 决定**：routeRules 的 headers 会被 Nitro 缓存处理器覆盖（写死 `max-age=<源站 TTL>`），所以页面 `public, max-age=0, s-maxage=21600`、公开 API `max-age=0, s-maxage=60` 都在 `beforeResponse` 钩子里改写；4xx/5xx 改 `no-store`。`/login`、`/admin/**`、`/api/auth/**`、`/api/admin/**` 仍由 routeRules 下发 `no-store`，插件不碰。

**304 的缓存头要单独修（2026-11-06）**：Nitro 命中条件请求时直接回 304，而 **304 走不到 `beforeResponse` 钩子**（h3 在 `event.handled` 时跳过 `onBeforeResponse`）→ 304 会带着 `max-age=<源站 TTL>`（6 小时）出去，把边缘 TTL 顶回去、内容 6 小时不更新。⇒ ① 原来的 `server/middleware/cache-conditional.ts`（生产剥掉 If-None-Match 防这个坑）**已删除**；② 改由 `server/middleware/cache-304.ts` 在 `res.writeHead` 里按路径改写成该路径真正的边缘 TTL（纯逻辑在 `server/utils/cache-control.ts`）。改完源站就能正常回 304：边缘/浏览器的重新验证**只传头不传正文** → 列表页 TTL 可以从 60 秒降到 15 秒而回源流量几乎不涨（评论数等聚合数据的可见延迟从 ≤60 秒降到 ≤15 秒）。实测（本地生产构建）：首页 `GET` → `etag` + `s-maxage=15`；带 `If-None-Match` 再取 → `304` + `cache-control: public, max-age=0, s-maxage=15` + 无正文 ✓；内容页 304 → `s-maxage=21600` ✓。

**动态接口要源站显式 no-store（别只靠 EdgeOne 控制台规则）**：`/api/comments`、`/api/search`、`/api/check-link`、`/api/contents/likes/**` 已在 routeRules 里显式 `no-store`——其中 `/api/contents/likes/[cid]` 的 `liked` 是**按访客指纹算的**，一旦边缘规则丢失/重建 zone 而缓存住，第一个访客的 `liked=true` 会被发给所有人（边缘默认缓存 1800s）。同理，任何**与访客或实时状态相关**的接口都要源站自己声明 no-store，别依赖控制台那条 `/api/*` 子规则。

**dev 与 Redis 两种后端的缓存门控（2026-11-05 修）**：`/feed/**`、`/api/heatmap`、`PUBLIC_STATIC_API_ROUTES` 的源站缓存规则原先**没被 `isProduction` 门控**（dev 下就有文件缓存 → 本地看不到刚改的数据，与「开发恒不启用缓存」冲突），且**配了 Redis 时整段被跳过**（公开静态 API 没有源站缓存 → 边缘 1% 预刷新直接打 DB）。现在统一：dev 一律不挂；生产两种后端都挂（`base: redisConfig ? "redis" : "cache"`）。

**边缘缓存 HTML 的前提：SSR HTML 必须与登录态无关**（已实测：匿名 vs 已登录抓首页 SSR HTML **逐字节相同**，唯一差异是 payload 里的 `timeSsrStart` 时间戳）。原因：所有按登录态变化的 UI 都在 `<ClientOnly>` 里（页脚「后台管理」、文章页「编辑此文章」、地图页「编辑足迹」、评论区的登录态、changelogs/links/subscribes 的后台入口）——`<ClientOnly>` 的内容不进 SSR HTML；`useAuth()` 的 `checkAuthStatus()` 被 `import.meta.client` 门控、`auth.client.ts` 是 client-only 插件 → SSR 阶段 `isLoggedIn` 恒 false；前端**零 `useCookie`**（SSR 不读会话）；全局中间件 `auth.global.ts` 只管 `/admin`（已 no-store）；评论列表是客户端 `fetch`（不是 SSR `useFetch`）。**以后在页面 setup 里服务端读会话并渲染用户态就会把 A 的 HTML 发给 B**，这类 UI 必须继续放 `<ClientOnly>`。

**两条回归测试守着这个前提**：`test/unit/app/ssr-user-independent-invariant.test.ts`（静态守卫：app/ 零 useCookie、零 SSR 侧 auth/verify 拉取、checkAuthStatus 有 client 门控、routeRules 的 no-store 边界，每次 `bun run test` 都跑）+ `test/e2e/ssr-user-independence.spec.ts`（真 SSR 对比：匿名抓两次取基线 → 登录 → 再抓，断言①无后台入口元素 ②无登录用户邮箱 ③归一化后与匿名版一致；**等值比较必须先剥掉 `__NUXT_DATA__` payload 脚本**——payload 的 devalue 扁平结构里 asyncData 键是否落进去取决于那次 SSR 时序，dev 下尤其明显；`/links` 的友链顺序本身随机，靠"基线不稳定就跳过并记注解"兜住）。

**生产实测踩坑（2026-11-05）**：① Nuxt payload 缓存的键是 URL，unstorage `normalizeKey` 在 `?` 处截断 → 根路径带查询串（`/?utm=…`）得到空键，fs 驱动会 `open` 目录本身 → `EISDIR`/`ENOTDIR` 全站 500；修复=在 `nuxt.config` 的 `nitro.storage` 给 `cache:nuxt:payload` 单独挂 `{driver:"memory"}`（route 缓存仍走 fs/redis）。② h3 的 `event.path` 带 `?query`，`server/utils/cache-routes.ts` 匹配前必须 `split("?")[0]`，否则带查询串的页面/API 全部跳过头改写。③ `cache-reset` 的启动清缓存是异步的，日志里 `Listening` 先出现；它与启动瞬间的请求并发会写坏 `.nitro/cache` 目录，已把清缓存改成 await（Nitro 插件不阻塞监听，真正兜底是 ①）。④ 生产是 nginx → Node 3000；宝塔 Node 项目用 `/www/wwwroot/glass/132_start.sh` 裸 `nohup` 启动（无 pm2/systemd），重启=杀旧 PID + 跑该脚本；宝塔 API 有 IP 白名单，本机/服务器 IP 都可能被拒。⑤ 验证响应头要 `curl --resolve imqi1.com:443:127.0.0.1` 走 nginx HTTPS；直接 `127.0.0.1:3000` 会因 Host 不匹配让 `/api/*` 返回 404。⑥ 生产库名 `imqi1cms`（不是本地 `.env` 的 `imqi1`），服务器没有 psql 客户端，可用 `/www/wwwroot/glass/node_modules/pg` + `132_start.sh` 里的 DB_* 查。

**EdgeOne 控制台规则现状（2026-11-05 站主手改，已上线验证）**：`rule-3x0l48u2xkel`（host=imqi1.com，优先级 1）主分支 = `Cache.FollowOrigin{DefaultCache:on, DefaultCacheStrategy:off, DefaultCacheTime:1800}` + `CachePrefresh 1%`；子规则 `/admin/**`、`/login`、`/api/*` = `FollowOrigin{DefaultCache:off}`（**别动**，否则 csrf/token 被缓存 + 剥 Set-Cookie → 登录必 403）。⇒ 源站下发的 `s-maxage`（列表页 60 / 内容页 21600）**这才真正在边缘生效**：改之前是「强制 TTL 1800 + IgnoreCacheControl=on」，两级设计全废（实测 `Age` 涨到 736s）；改之后首页 `Age` 每 60s 复位一次（MISS→RefreshHit→Age 31 循环）✓。**改控制台规则后必须实测 `Age` 是否复位**，否则源站的 TTL 白改。查规则用 `DescribeL7AccRules`、查额度用 `DescribeContentQuota`（腾讯云 teo 2022-09-01，TC3 签名，用仓库自带的 `server/utils/cdn/tencent-signature.ts` 即可调）。

**边缘 CacheKey 含查询串**（zone 级 `CacheKey.QueryString.Switch=off`）→ **别改成「忽略查询串」**：`/category/**?page=N`、`/tag/**?page=N` 的 SSR 输出随分页参数变，忽略会把第 2 页返回成第 1 页。

**边缘「默认缓存」开启后，任何没有 Cache-Control 的响应都会被缓存 1800s** → 源站必须给**所有** 4xx/5xx 下发 `no-store`（不能只管「已缓存路径」）：否则一次偶发 500/404 会被边缘缓存半小时。`server/plugins/cache-control.ts` 已把状态判断提到路径判断之前（实测修复前 404 是 MISS→HIT，修复后两次都 MISS + no-store）。

**源站缓存键含完整 URL**（Nitro `hash(原始URL)`，`nitropack/dist/runtime/internal/cache.mjs`）→ 爬虫推广参数（`?source=…`）会各自生成一份 ~200KB 缓存文件 + 一次整页渲染。已加 `server/middleware/cache-key.ts`：只保留会改变 SSR 输出的参数，其余剥掉 → 同一路由共用一份缓存（实测 3 个不同推广参数的首页请求后仍只有 1 个 `index.*` 文件）。**分页/视图类参数绝不能剥**。参数登记表在 `server/utils/cache-routes.ts` 的 `SIGNIFICANT_QUERY_PARAMS`（cache-key 与规范化跳转共用）。

**查询串变体 = 独立的边缘缓存条目（2026-11-05 生产实测后修，最易漏）**：实测 `/content/note/1024` MISS → `/content/note/1024?utm_source=test` **也 MISS**（不是同一条）→ 再访问 HIT ⇒ **带推广参数的 URL 是独立条目**，而刷新只提交裸 URL ⇒ 带参链接的内容永远不更新（内容页 TTL 6 小时）。两端修：① `server/middleware/cache-canonical.ts` 把「不影响 SSR 输出的参数」剥掉并 **301** 到规范 URL → 边缘只存一条，精确刷新即覆盖（仅生产生效；`canonicalSearch()` 固定参数顺序 → 同一页面只有一条缓存键）；② 刷新侧 `content-cache.ts` 的 `queryVariants()` 把**可枚举**变体逐个刷（/map 的 view×place、/subscribes 的 source、/changelogs 的 type）；**分页 `?page=N` 变体无限 → 列表页只能靠 60 秒短 TTL 收敛**（精确刷列表页本来就不可能）。

⚠️ **登记表漏一个参数 = 源站缓存串页（生产真实发生过）**：`/map` 的 `place` 决定 `<title>`，漏登记时 `/map?view=travels&place=5` 渲染出的「中街 - 我的足迹」被缓存成 `/map?view=travels` 的标题 → 所有人打开都是"中街"。**新增任何 SSR 读取的 query 参数，必须同时登记进 `SIGNIFICANT_QUERY_PARAMS`**（`/category/**`=page、`/tag/**`=page、`/map`=view+place、`/subscribes`=source、`/changelogs`=type）。

**写库失效的四个补漏（2026-11-05 修）**：① **旧 URL**：改 slug/主分类/类型后旧地址仍是边缘缓存里的旧 HTML（取消发布更是继续对外提供下线文章）→ 更新类接口要在写库**前**用旧记录算 `contentUrlPaths()` 一起传 `contentPaths`（删除类接口本来就做了）；② **点赞**：`/api/contents/likes/[cid].get` 的 `likeCount` 会渲染进文章页 SSR HTML → 点赞要刷文章页 URL（列表页角标靠 60 秒 TTL），配 `edgeRoutes: []` + `edgePaths`（`invalidateContentCaches` 新增这两个参数，用来把「源站缓存要清的路由」与「边缘要刷的路由」解耦）；③ **旅行足迹**：文章页渲染关联地点 → travels 增删改要传关联文章的 cid；④ **metaContentPaths 超阈值返回 null**（不是空数组）——返回空数组时调用方再 push 一条新路径会让「目录刷新兜底」被跳过 → 旧文章 URL 不刷。

**额度熔断与部分提交（2026-11-05 修）**：额度用尽的熔断标记按**天**复位（原来进程内永不复位，实际是"到下次重启前都不刷新"）；额度不够时**只提交额度内的部分**并注明未提交数量（原来整批拒绝 → 全部落空更糟）；EdgeOne API 调用加 15 秒超时。

**刷新日志的来源标记**：`purgeCdnUrls(urls, "自动")` / `purgeCdnRoutes(routes, source)` → 写库触发=自动、后台=后台手动、MCP=MCP 手动。以前自动刷新全被记成「手动」（`purgeCdnUrls` 的 source 默认值），额度无法归因。

**MCP `clear_cache` 不再依赖 Redis**：无 Redis 时搜索/足迹/限流计数都在进程内内存（`server/utils/cache/store.ts` 的内存回落），已改走 `cacheClearByPrefix`/`cacheClearBySubstring`（Redis SCAN / 内存遍历）；限流还要清 `server/utils/rate-limit.ts` 与 `login-rate-limit.ts` 各自的私有内存表（Redis 模式下键分别是 `rl:*`、`login:*`、点赞 `likes:*`）。后台「缓存管理」页仍按 Redis 灰显（那里清的就是 Redis 键，保持原样）。

**生产库 `contents.comment_num` 漂移**：旧的 `comments/[id].patch` RMW race 留下过偏差（cid 836/1016 各差 2，2026-11-05 已按 `status=1` 实际条数重算修正；`comment_num` 只在后台展示，前台不显示）。重算 SQL：`WITH s AS (SELECT cid,count(*) n FROM comments WHERE status=1 GROUP BY cid) UPDATE contents c SET comment_num=s.n FROM s WHERE s.cid=c.cid AND c.comment_num<>s.n`。绕过应用直接改库**不会触发缓存失效** → 改完要 `clear_cache target=pages`。

相关：[[redis-build-baked-docker-ondemand]]、[[nitro-route-cache-key-colon]]、[[admin-write-api-csrf-required]]、[[post-change-lint-chain]]

---

## 2026-11-06 全面复核后的修复（10 条功能 + 3 条安全）

**复核方法**：逐条读代码 + 用真库量化（本库 156 篇文章 / 4 分类 / 18 标签 / 单标签最多 30 篇 / 1029 条评论），修前对每条重新验证一遍。

### 【最重要的认知】源站缓存 TTL 才是列表页的新鲜度硬上限
边缘 TTL（列表页 15s）只决定「多久回源一次」。回源时源站若命中**源站缓存**（TTL 6h）就返回旧 HTML → 边缘继续用旧的。⇒ **凡是把评论数/点赞数渲染进列表卡片的路由，源站缓存必须在写库时清掉**，否则那个数字会挂满 6 小时（不是 15 秒）。这也解释了为什么 `COMMENT_CACHE_ROUTES` 要含 `/category/**` `/tag/**` `/archiving` `/about` `/sitemap` —— 粗粒度清源站是**正确性需要**，不是省事；真正要避免的是清到**文章页**（Shiki 全量重渲染）。

### P1 点赞清空全站文章页源站缓存（已修）
`LIKES_CACHE_ROUTES` 含 `/content/**` → 源站缓存按 frag 前缀匹配（`/content/**` → `content`）→ **一次点赞清掉所有文章页的源站缓存** → 边缘每次回源验证都要全量重渲染（Shiki + DB）。旧代码注释里明确避开的坑，迁边缘缓存后又踩回来了。
修法：`clearSourceCache` 支持 `paths` 精确失效（`server/utils/source-cache.ts`），点赞改传 `sourcePaths: [文章页]`；`LIKES_CACHE_ROUTES` 整个常量删除（它唯一的用处就是那个 `/content/**`）。**注意路由集合里没有 `/content/**` 时，源站缓存不会碰文章页**。
⚠️ frag 匹配是**前缀**语义且只取 16 字符：两条长路径可能共用片段 → 多清一个页面（可接受），漏清则挂满 TTL。中文 slug 必须先 `decodeURI` 再剥非词字符，否则片段对不上。

### P2 countOnly 在 5 秒防抖窗口内是「粘」的（已修）
原来 `pendingCountOnly` 只会被置 true 不置 false → 评论（countOnly）与文章保存同窗时，整窗按计数类处理 → **文章自身的 URL 被 skipRouteTargets 跳过**。改成三态（初始 true = 「本窗全是计数变更」，出现内容类变更即置 false）。

### P3 读者地图不随评论更新（已修）
`/api/footprint` 的聚合缓存在 `custom:footprint`（TTL 600s = 读者地图的新鲜度**硬上限**，刷边缘也不会更新得更早），而评论写接口没人删这个键 → 新读者落点最多 10 分钟才出现。已在 `invalidateContentCaches` 里按 `countOnly` 一并清（countOnly 目前的唯一来源就是评论写接口）。

### P4 别人页上的「相关文章」卡片不随本文更新（已修）
文章页 SSR **内嵌**相关文章卡片（标题/封面/描述，Nuxt 的 `useAsyncData` 走 `onServerPrefetch`，即使没 `await` 也会等它 → 确实进 HTML）。改 B 的标题只刷 B 自己的 URL → A 页上 B 的旧标题挂满 6 小时。
修法：`server/utils/content-urls.ts` 的 `relatedContentPagePaths(cid, tagMids)` 按 **`/api/related-contents` 的同一套排序规则**反查（标签池并集取 20 → 相关度 → 时间 → top3）出真正会展示它的那几页，一并刷边缘。实测本库 156 篇逐篇与暴力模拟**完全一致**（458 页 vs 458 页，0 不一致），单次均 9ms。调用点：文章新建/更新/删除（删除要**在删前**算，删完就查不到引用关系）/批量删除（>20 篇跳过）/定时发布。

### P5 后台手动清理不刷边缘（已修）
「按类别/关键词清理」只清源站 → 站主清完线上仍是旧 HTML 6 小时。改为一并提交边缘刷新：预设带 `route` 就精确刷该路由，自由关键词刷整站一条目录前缀（目录池 50/天，人工低频）。

### P6 空转守卫漏看边缘目标（已修）
`flushCdnPurge` 的 `if (!cids.length && !paths.length && !routes.length) return` 不看 `edgePaths`/`edgeDirectories` → 「只传 edgePaths」的变更整段跳过。已把边缘目标纳入判断。

### P7 TTL 档位两套判定逻辑（已修）
`nuxt.config.ts` 用 `LIST_PAGE_ROUTES.includes(path)`（**精确相等**），运行时用 `isListPageRoute()`（**模式匹配**）→ 今天一致，改着改着就分叉成同一页面两个 TTL。已把整套路由判定提到 **`shared/cache-routes.ts`**（app/nitro/nuxt.config 共用），并加 `routeSamplePath()`（`/category/**` → `/category`）让「具体路径」与「路由匹配串」两种入参走同一份清单。**shared 内部要用相对导入**（`./constants`）：`#shared` 别名在 nuxt.config 的 jiti 加载阶段不可解析。

### P8 related-contents 刷新 URL 少了 `?limit=3`（已修）
边缘缓存键含查询串 → 文章页实际请求 `/api/related-contents/{cid}?limit=3`，刷的是裸 URL → 刷中的不是实际那条（当前 `/api/*` 在 EdgeOne 控制台是 DefaultCache:off 暂无害，规则一改就中招）。

### P9 `metaContentPaths` 返回得太宽（**故意不改**）
分类/标签改名时它返回「文章页 + 该文章所有分类/标签页」的并集，一次改名可能刷 200 条 URL。收窄要做「精确到文章所在的那一页」，而位次计算有 create_time 并列差 1 的风险 → **宁多刷不漏刷**，保持现状。

### P10 刷新来源默认值不一致（已修）
`purgeCdnUrls` 默认「手动」、`purgeCdnRoutes` 默认「自动」→ 新增调用点容易把自动刷新记成手动、额度无法归因。统一为「自动」。

### 安全侧三条
- **S1 `RATE_LIMIT_LINKS_APPLY` 可放大公开写接口额度**：E2E 的 playwright.config 把它设成 100；抄进生产 .env 就等于放开 `/api/links` 垃圾申请 + 邮件轰炸，负值还会让接口永久 429。已改成**生产恒 3**，非生产才放宽且上限 100。
- **S2 `cdn-purge` 的 action=urls 无条数上限**：超额部分按额度截断后仍串行分批提交（每批 15s 超时）→ 接口长时间挂着 + 白烧额度。已加 500 条上限。**不构成 SSRF**（服务端只把 URL 放进 body 转给腾讯云，从不对它发请求；EdgeOne 只收本 zone 目标）。
- **S3 查询串白名单漏登记 = 串页**（本仓库生产真实发生过：/map 的 place 漏登记 → 全站标题变成「中街」）。已加守卫单测 `test/unit/app/ssr-user-independent-invariant.test.ts`：「边缘缓存页读到的 query 参数必须都已登记在 SIGNIFICANT_QUERY_PARAMS」。**新增 SSR 参数时必须同时登记**。

### 遗留（不阻塞，供后续）
- **列表页的源站缓存仍是粗粒度清**：一次评论会清掉首页+全部分类页+全部标签页+归档+关于+站点地图的源站缓存（→ 各自下一次访问重渲染一次，约 22 次）。文章页已改精确，但列表页要精确就得把「文章所在的那一页」的位次计算提到写库那一刻，与内容类变更（页码会位移、必须整组清）语义不同，故没动。
- **`/map?place=N` 的标题**：`place` 登记在 SIGNIFICANT_QUERY_PARAMS ✓，但 `/map` 是 15 秒短 TTL 档 → 改名后地图页标题最多滞后 15 秒（可接受）。

---

## 2026-11-06 列表页源站缓存的精确失效（把遗留项做掉）

**为什么原来只能粗粒度清**：Nitro 的源站缓存键 = `<frag>.<hash>.json`，`frag` = 路径去非词字符后**截 16 字符**（`/category/**` → `category`）→ **所有分类页的所有分页变体共用一个 frag**，按路由清只能整组清。而 `hash` 部分当时算不出来 ⇒ 没法只删「第 2 页」那一条。

**关键突破：hash 可以自己算**。Nitro 的 `hash(url)` = `digest(url).replace(/[-_]/g,"").slice(0,10)`，`digest` 来自 **ohash**（nitropack 的传递依赖）。⇒ 加上 `ohash` 直接依赖（锁 2.0.12）就能逐字符复现缓存键，**精确失效不需要改 nitro 配置、不需要 getKey 活到运行时**。

**实测验证（生产构建 + 真库，2026-11-06）**：
- 生产服务器请求 `/category/note?page=2` → 生成键 `categorynote.0S8nTpq2pW.json`；`exactKeySuffix("/category/note?page=2")` 算出**逐字符相同**的键 ✓
- 带 `?utm_source=weibo` 的请求 → **301 规范化**，不产生第二条键（`cache-key.ts` 生产生效）⇒ 精确删除能覆盖带推广参数的访问 ✓
- 用生产同源的 `clearSourceCache({routes:[], exactPaths:["/category/note?page=2"]})` → 真实键被精确删掉 ✓
- 键后缀匹配（`key.endsWith(suffix)`）对 Redis（`nitro:routes:_:`）与文件（`nitro/routes/_/`）两种驱动通用 ✓

**实现**：
- `server/utils/source-cache.ts` 的 `clearSourceCache` 新增 `exactPaths`（完整 URL 含查询串）→ 构造精确键；`exactKeySuffix` 已导出。
- `server/utils/content-cache.ts`：`countOnly: true`（计数类变更）⇒ 源站缓存**只清「文章所在的那一页」**（`contentListPagePaths` 算出的精确 URL），不再清 `/category/**` `/tag/**` 整组；固定页（/、/about、/sitemap）仍按路由清。
- **精确清要连邻页 ±1**：位次按 create_time 算，同秒创建的两篇并列 → 位次可能差 1（实测真库确实有）⇒ 只清算出的那一页会漏掉并列那篇所在的页（评论数挂满 6h）。`expandNeighborPages()` 展开 N-1/N/N+1（**第 1 页是裸路径**，`?page=1` 被规范化掉了）。
- 路由集合按变更类型拆开（查过各页实际渲染了什么）：`COMMENT_CACHE_ROUTES` = /、/category/**、/tag/**、/about、/sitemap（**去掉 /archiving**：它渲染 like_num 不是评论数）；`LIKES_CACHE_ROUTES` = /、/category/**、/tag/**、/archiving（**去掉 /about、/sitemap**：统计项无点赞、站点地图只列最近评论）。
- 源站的「精确失效」与边缘的「精确刷新」现在共用同一次查库（`loadContentRows` + `contentListPagePaths` 一次算完，flush 不再重查）。

**效果**：一次评论的源站缓存失效从 ≈46 条（16 分类页变体 + 26 标签页变体 + 4 固定页）降到 ≈9 条（分类/标签各 3 页 ±1 + 3 固定页），无关分类页的缓存不再被废掉。

**页码计算的正确性已实测**（dev server + 真库 26 篇抽样）：正向 29/29 全中（算出的页一定含该文章）；反向的少数例外是同秒并列 ⇒ 用 ±1 邻页兜住。

⚠️ **golden vector 测试是这套方案的安全网**：`test/unit/server/utils/source-cache.test.ts` 用真实存在的键锁定算法（`/category/note?page=2` → `categorynote.0S8nTpq2pW.json`）。ohash/nitro 升级导致算法漂移时**这条测试会先红**，而不是让精确失效静默失效（旧评论数挂 6 小时）。

⚠️ **内容类变更仍必须整组清**：新增/删除文章、改分类归属、改发布状态 → 后续页码整体位移 ⇒ 分类/标签目录要整组清（走 `edgeDirectories` + 源站的 `/category/**` 路由）。精确化只适用于「只改数字、列表结构不变」的计数类变更。

---

## 2026-11-06 边缘刷新按「展示面」精确展开（额度从 18 → 2）

**问题**：所有文章变更都刷同一套页面（首页/归档/关于/协议/留言板/站点地图 + 5 个接口 + 平均 8.5 个「相关文章」页 ≈ **18~30 个 URL**），但**只改正文时那些页面一个字节都没变** → 白刷 ~87% 的额度。而额度只有 1000/天：一天改 3 篇文章（每篇 2 遍）+ 200 条评论 ≈ **940** → 卡在边缘，改两篇长文就爆 → 爆了当天不再刷新 → 内容页挂 6 小时。

**做法：按「展示面」（scope）声明影响面**（`server/types/utils/content-cache.d.ts` 的 `ContentScope`）：

| scope | 含义 | 刷什么 |
|---|---|---|
| `article` | 文章详情页（含改 slug 后的旧地址） | 精确文章页 URL |
| `card` | 显示文章卡片的页 | 文章所在的分类/标签页（精确）+ 首页/归档/站点地图 + /api/home-data |
| `related` | 引用了这篇文章的「相关文章」卡片 | 按同一套排序规则反查出来的页（平均 8.5） |
| `listDir` | 文章进出列表 → 后续页码位移 | 2 条路径前缀刷新目标 |
| `fixed` | 与文章无关的固定页与接口 | 关于/协议/留言板 + travels/blog-network/categories/tags |

**实测（真库 + 真代码路径）**：改正文 **18 → 2 个 URL**；改标题 18 → 9~11；新建文章 11 + 2 目录；评论 2（不变）。

**只改正文不用刷列表页的理由**：卡片上的日期是**相对时间**（`formatDate`，hydration 后客户端自纠正），正文也不出现在任何卡片上 → SSR HTML 的差异只有几秒的相对时间偏差，用户看不到。

**⚠️ 差点踩的坑（已修）**：scopes 精确化后 `/content/**` 不再进源站清理范围 → **边缘刷了文章页、源站却是旧 HTML → 回源发 If-None-Match → 源站回 304 → 旧正文复活**。
⇒ 铁律不变：**边缘刷了哪条，源站就得清哪条**。现在源站清理 = `scopeRoutes` + `sourcePaths` + `contentPaths` + 由 cids 展开的文章页/分类标签页（页面级 frag 前缀匹配，比边缘粗但绝不漏）。`test/unit/server/utils/content-cache-purge.test.ts` 有专门用例锁这条不变式。

**防抖 5 秒 → 2 秒**（与自动保存的 2 秒空闲间隔对齐）：改完 **2~4 秒可见**（原 5~10 秒）。额度因 ① 降了 ~87%，完全撑得住。`PURGE_DEBOUNCE_MS` 改 2 秒时，测试里的 `wait()` 也要从 5300 改 2300。

**没改 scopes 的调用点 = 保守全刷**（不传 scopes 时 `scopesHas()` 视为包含所有族）→ 没改造的调用点行为不变。已改的：文章增删改/批量删/定时发布（article+card+related+listDir）、改分类归属（article+card+listDir）、改标签归属（同上）、附件增删改（只 article——封面角标来自 `contents.covers`，不受附件增删影响）。**保留老行为的**：分类/标签改名（`/content/**` 整组——slug 在文章 URL 里）、用户资料（作者名进每篇文章的 SEO meta）、类 4 的独立页面。

**新增守卫** `test/unit/app/cache-scope-coverage.test.ts`：扫描 `app/pages/**` 里渲染了文章卡片字段（`commentsNum`/`likesCount`/`like_num`/`content.title`/`content.desc`/`content.covers`）的页面，断言它们都落在已登记的展示面里 → **将来新增页面忘了登记，CI 就红**（漏登记 = 那一处挂 6 小时）。它当场抓出了 `/subscribes`（显示的是订阅源自己的文章，不归 contents 的卡片展示面管）。页面文件→路由的映射抽到 `test/helpers/page-route.ts`。

---

## 2026-11-07 上线实测 + 额度轮转修复

**上线实测（生产，EdgeOne + 真库）**：
- 新版本生效：首页/分类页 `s-maxage=15`、内容页 `s-maxage=21600`（三档 TTL 全对）
- 边缘命中：首页 `EO-Cache-Status: RefreshHit`、`Age` 持续增长（7→13）
- **刷新链端到端**：MCP `clear_cache target=cdn`（任务 3x3pyw1y46w7）→ +10 秒 `EO-Cache-Status: MISS`（边缘被清）→ +20 秒 `RefreshHit`、Age 复位重涨 ⇒ **EdgeOne 刷新真的生效，提交→边缘失效 ≤10 秒**
- 生产进程环境变量有 `EDGEONE_SECRET_ID/KEY/ZONE_ID` ✓；日志有部署后的自动整站刷新（buildHash 变化检测）✓；**零条「未启用 CDN 刷新」错误** ✓
- 源站渲染成本实测（本地生产构建）：**内容页冷渲染 411ms / 缓存命中 1ms**（411 倍）；列表页 253ms / 1ms
  ⇒ 源站 TTL 6h→1h = 每天多烧 **21 分钟 CPU**（624→3744 次渲染）⇒ **撤回「源站 TTL 分档」这条建议**（411ms 是同步阻塞渲染，Node 单线程，高峰期抖动更明显；且额度耗尽是低频异常，用量一天才 350/1000）

**额度轮转 bug（已修）**：`edgeone.ts` 额度不足时 `submitTargets = targets.slice(0, dailyAvailable)` ⇒ **每次都提交同一批目标的前 N 个**，后面的目标**永远刷不到**（内容挂满 6h TTL，而提交是成功的 → 零告警，最难排查）。
修法：模块级 `purgeCursor` 累计游标 → 部分提交时从断点轮转，保证每个目标都有机会刷到；单测锁住（连续两次部分提交的目标不同）。

**额度预警（已加）**：剩余 <20% 时每天告警一次（`warnLowQuota`）—— 额度用尽后当天内容变更不再即时生效，等用尽才发现太晚。

**note 进日志（已修）**：`runCdnPurge` 的日志原来不含 `note` ⇒ 「额度不足，N 个目标未提交」这类关键信息只存在于返回值里，日志看不到 ⇒ 现在日志带 `备注` 字段。

**「额度耗尽时内容页挂 6 小时」的准确口径**：受影响的是**文章详情页**（边缘 TTL 6h）；列表页 TTL 15s 照常更新。源站缓存**已经被清了**（新数据在那儿），问题只在「边缘手里那份旧 HTML 还在」⇒ 任何兜底都必须在边缘侧动手：整站刷新走**独立的额度池**（`purge_all` 10 次/天），URL 池耗尽时仍可用 ⇒ 人工一次整站刷新即可立刻恢复（代价：全站回源重渲染一次 ≈ 156×411ms ≈ 64s）。

---

## 2026-11-07 生产日志排查（MCP 端点的偶发错误）

**用 MCP 读生产日志**（令牌在服务器进程环境里，别在本地 .env；MCP 端点 `https://imqi1.com/mcp` 需带 `Accept: application/json, text/event-stream`，否则 406）：
```bash
# 在服务器上取令牌 → 直连 MCP 端点，令牌不回显
TOKEN=$(ssh ... 'tr "\0" "\n" < /proc/<pid>/environ | grep "^MCP_OPS_TOKEN=" | cut -d= -f2-')
curl -sS -X POST https://imqi1.com/mcp -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_recent_logs","arguments":{"token":"'"$TOKEN"'","category":"monitor"}}}' | sed -n 's/^data: //p'
```

**排查到的三类东西**：
1. **结构化日志（logs/<类别>/<日期>.log）近 4 天 ERROR/WARN 全是 0** —— 「报的错」不在这里。真正的错误在 **nginx 访问日志 `/www/wwwlogs/132.log`**（130 万行、**不轮转**）与 **`/www/wwwlogs/132.error.log`**（nginx 的 upstream 错误）+ **`/www/wwwlogs/nodejs/132.log`**（Node 的 stdout/stderr，宝塔 Node 项目的 nohup 输出）。
2. **11-05 的 41 条 monitor 错误全是已修的旧问题**：Nuxt payload 缓存的 `EISDIR`/`ENOTDIR`（unstorage 在 `?` 处截断 → 空键 → fs 驱动 open 目录；已用 `cache:nuxt:payload → memory` 驱动修掉）、`SASL ... client password must be a string`（DB_PASSWORD 没注入）、`EADDRINUSE :3000`（重复启动）、以及重启窗口连带的 `获取首页数据失败`/`生成 RSS 失败`。
3. **11-06/11-07 剩下的唯一错误**：`/mcp` 端点报 `Cannot set headers after they are sent to the client`（ERR_HTTP_HEADERS_SENT）—— **响应本身是成功的**（客户端拿到正常结果），错误发生在**响应发出之后** ⇒ 某个环节在 `res.headersSent` 之后又调 setHeader。**低频偶发**（两天 3 次），本地生产构建复现不了（直连 Node、无论成功/失败路径、加不加 nginx 的 `Connection: upgrade` 头都复现不了）⇒ 根因未定位。
   处置：`server/routes/mcp.post.ts` 的 `writeWebResponse` 加 `headersSent` 保护（跳过并 `console.warn` + 栈，不再让整个请求变 500、不再触发错误通知邮件）。
   ⚠️ 顺带发现 **错误日志没有堆栈**（`reportError` 拿到了 `stack` 但 `log.monitor` 没写）⇒ 排查这类问题毫无线索，已补上（截断 6 行、单行）。

**nginx 的 `proxy_set_header Connection "upgrade"` + `Upgrade $http_upgrade`（空）对所有请求生效**（含 /mcp）—— Node 收到「声明 upgrade 却无 Upgrade 头」的畸形头。目前没造成问题，但值得知道。

**⚠️ 安全**：`/www/wwwroot/glass/132_start.sh` 里**明文写了全部生产密钥**（MCP_OPS_TOKEN、EDGEONE_SECRET_ID/KEY、微信 AppID/Secret、LOGIN_SECRET…），且权限是 `-rwxrwxrwx`（**任何用户可读**）。任何能 SSH 进来的人都能拿到全部生产凭据。建议：① `chmod 600` + owner 改 root；② 密钥迁到 root-only 的环境文件；③ **本次排查中这些值已出现在对话记录里 → 建议轮换**。

**EdgeOne 默认缓存会缓存 `/mcp`**（它不在 `/api/*` 的 no-store 规则下）⇒ 实测 `EO-Cache-Status: MISS`（因 SSE 响应不被缓存），但若将来 /mcp 返回可缓存的 JSON，就会被缓存 30 分钟。建议给 `/mcp` 显式加 no-store。

---

## 2026-11-07 MCP 端点「总是报错」的根因（gzip 请求体）

**症状**：每次 MCP 连接先发一个 `POST /mcp` → **400**，然后才有 200/202；每次都产生一条 monitor 错误 + 一封错误通知邮件。

**根因链**（本地生产构建复现 + 堆栈佐证）：
1. **AI 客户端（Claude Code 等）用 gzip/br 压缩 JSON-RPC 请求体**；
2. Node 只自动解压**响应**体，**不解压请求体** ⇒ `readRawBody` 拿到的是压缩字节；
3. `eventToWebRequest` 把 `Content-Encoding: gzip` 原样复制给 SDK 的 `Request`，body 却是压缩字节 ⇒
   SDK `JSON.parse` 失败 ⇒ **400「Parse error: Invalid JSON」**；
4. 该 400 响应被 `writeWebResponse` 用 `res.end()` 写出 ⇒ **headersSent = true**；
5. `server/plugins/cache-control.ts` 的 **beforeResponse 钩子在 handler 之后跑** ⇒ 看到状态码 ≥ 400 ⇒
   `setResponseHeader(event,"cache-control","no-store")` ⇒ **ERR_HTTP_HEADERS_SENT**
   （"Cannot set headers after they are sent to the client"）⇒ 请求变 500 + 错误通知邮件。

**修法**：
- `server/routes/mcp.post.ts`：按 `content-encoding` 解压请求体（gzip/deflate/br，`node:zlib`）后再交给 SDK；
  转发给 SDK 的头剔除 `content-length` / `content-encoding` / `transfer-encoding` / `connection`
  （长度由 fetch 自算，别把描述原始请求体的头带过去）。
- `server/plugins/cache-control.ts`：beforeResponse 开头 `if (event.node.res.headersSent) return;`
  ⇒ **通用修复**：任何「handler 主动写出的 ≥400 响应」都不会再炸（不止 MCP）。

**验证**：本地 gzip body 400→200；生产 gzip initialize 200；Node 日志 `Cannot set headers` 计数 0。

⚠️ **教训（两条通用）**：
- **Nitro 的 `nitroApp.hooks.hook("beforeResponse")` 是在 handler 之后跑的**，不是 middleware ⇒
  handler 自己 `res.end()` 写出的响应，`headersSent` 已是 true ⇒ 任何在里面设 header 的代码都会抛。
  ⇒ 在 beforeResponse 类钩子里设 header 前，**必须先判 `headersSent`**。
- **转发请求体给 fetch/SDK 时要剔掉 body 相关的头**（content-length / content-encoding / transfer-encoding），
  否则长度或编码语义对不上 ⇒ 解析失败。Node 不解压**请求**体（只解响应体）。

---

## 2026-11-07 Redis 开关的无缝性（开启 Redis 会不会破坏边缘缓存方案）

**结论：不会。** 边缘刷新（EdgeOne）走 HTTP API，**完全不碰存储** ⇒ 与 Redis 开关正交。
真正会变的是**源站缓存的键形态**与**短期缓存的后端**：

| 路径 | Redis 开 | Redis 关 | 影响边缘方案？ |
|---|---|---|---|
| 源站页面/API 缓存（routeRules `cache.base`） | redis 驱动 `nitro:routes:_:<frag>.<hash>.json` | fs 驱动 `nitro/routes/_/<frag>.<hash>.json` | ❌ 不影响 |
| 启动清缓存（`cache-reset.ts`） | `redis.flushdb()`（**清整库**） | `useStorage("cache").clear()` | ⚠️ flushdb 会连带清限流/登录锁计数（无害） |
| 短期缓存（搜索/足迹） | Redis | 进程内内存 | ⚠️ 多副本下不同（Redis 更正确） |
| 限流 / 登录锁定 | Redis（共享） | 进程内内存（每副本一份） | ⚠️ 同上 |

⇒ **精确失效刻意不依赖「完整键名」**：只用「路径片段（前缀）+ 键后缀（`endsWith`）」两种与形态无关的匹配
⇒ 两种驱动的键形态都被 `test/unit/server/utils/source-cache-drivers.test.ts` 锁住。
⚠️ **`redis.enabled` 是构建期常量**（`site.config.ts` → `shared/redis-config.ts` → 烘进 runtimeConfig）⇒
**开 Redis 必须重新构建 + 重新部署**，不是运行时开关。但因为失效逻辑驱动无关，这次「开关切换」对
「边缘缓存 + 时效性」**没有任何行为变化**，只是短期缓存与限流从进程内存换成了 Redis（多副本下更正确）。

**顺带**：`/mcp` 显式下发 `Cache-Control: no-store`（不依赖 SDK 顺带发的 `no-cache`）——
边缘策略是「跟随源站」，源站说不缓存边缘就不缓存；SDK 换实现、将来返回 JSON、控制台改成「强制 TTL」
这三种情况下这个头是最后一道保险。

---

## ⚠️ 部署重启窗口的可用性（2026-11-07 实测发现，与 Redis 无关）

生产 nginx 访问日志 `/www/wwwlogs/132.log` 里 11-07 00:12~00:17 有 **9 个 502**
（`connect() failed (111: Connection refused)` ⇒ Node 进程不在监听 3000），**持续约 5 分钟**。
时间点正好落在「部署完成 → 边缘整站刷新 → 全站回源」之后 ⇒ 疑似**渲染风暴**：
`cache-reset.ts` 启动时清空源站缓存 + `cache-reset.ts` 因 buildHash 变化提交**整站刷新**
⇒ 边缘全站标记过期 + 源站缓存空 ⇒ 156 篇文章同时渲染 ⇒ 内存峰值 ⇒ 进程被杀 ⇒ 守护拉起。
⚠️ 内存总量只有 3.9GB。

⇒ **这条路径正是我之前建议的「额度耗尽时用整站刷新兜底」** ⇒ 该建议有风险，需要复核。
⇒ 可考虑：① 启动时**不清**源站缓存（旧 HTML 引用旧 buildHash 的静态资源，只要 COS 上旧目录还在就没事）；
② 部署后的整站刷新改成**手动**或**延后**；③ 回源加并发限制。

---

## 2026-11-07 部署期的 5 分钟 502（与 Redis / 边缘缓存方案均无关）

**事实**（nginx 访问日志 `/www/wwwlogs/132.log`，用 `awk '$9 ~ /^5/'` 按状态码判定才准；
**注意字段位置**：$4=时间、$7=路径、**$9=状态码**、$10=bytes、$12=UA —— 用 grep 匹配 " 5xx " 再按 $9 统计是错的）：
- 11-07 全天 5xx **只有 9 个**，全在 **00:12:36~00:17:04**，全是 **502**（`connect() failed (111: Connection refused)` ⇒ Node 没在监听 3000）
- 11-07 14:00~14:35 **0 个 5xx**（当天另外两次部署都正常）
- 历史累计：500×984、502×543

**排除的假设**：
- ❌ "宝塔 restart 有 6 分钟延迟" —— **我读错了**。三次部署 restart 返回与新进程启动日志的差都是 **1 秒**
  （00:06:51→00:06:52、14:15:28→14:15:29、14:29:51→14:29:52）。
- ❌ "整站刷新本身会打死进程" —— 14:15/14:29 两次部署**同样**因 buildHash 变化提交了整站刷新（日志有
  「来源=启动（构建变化）」），**没有 502**。

**剩下的解释**：00:09 我用 MCP 提交了**整站刷新** → 边缘全站标记过期；同一次部署的启动又**清空了源站缓存**
⇒ 接下来的每个回源都是**全量渲染**（实测单页 411ms，RSS 会涨）⇒ 有访问量时内存冲顶 ⇒ **进程被杀**
⇒ 宝塔守护约 5 分钟后才拉起 ⇒ **5 分钟 502**。14 点那两次因为访问量低，没把进程顶死。

⚠️ **Node 单线程 ⇒ SSR 渲染天然串行 ⇒ "限并发"没用**；内存冲顶更像是**渲染过程的 RSS 单调增长**
（GC 滞后 / Shiki 缓存累积），156 篇连续渲染 ⇒ 3.9GB 内存下触顶。**死因未确证**（`dmesg` 读不到、
Node stdout 无 uncaught 记录）⇒ 需要在部署时记录 RSS 曲线才能定位。

⚠️ **这条路径正是我之前建议的「额度耗尽时用整站刷新兜底」** ⇒ 该建议有风险（整站刷新 + 清空源站缓存
⇒ 回源全量渲染 ⇒ 可能打死进程）。**在定位死因之前，不要用整站刷新做兜底。**

⇒ 与「Redis 开关」「边缘缓存方案」「额度/时效/TTL 三者平衡」**都无关**，是独立的可用性问题。

**排查生产日志时的坑**（下次别再踩）：
1. 结构化日志 `logs/<类别>/<日期>.log` 里 **ERROR/WARN 全是 0** —— 真实错误在
   `/www/wwwlogs/132.log`（访问日志，**130 万行不轮转**）、`/www/wwwlogs/132.error.log`（nginx upstream 错误）、
   **`/www/wwwlogs/nodejs/132.log`**（Node 的 stdout/stderr，宝塔 Node 项目的 nohup 输出，**进程重启会清空**）。
2. nginx 访问日志的**状态码在第 9 列**；用 `grep " 5[0-9][0-9] "` 过滤后再 `awk '{print $9}'` 是**错的**
   （过滤的是整行，$9 未必是状态码）⇒ 直接 `awk '$9 ~ /^5/'` 才准。
3. 错误通知邮件**去重按「消息哈希」**（5 分钟窗口）⇒ 同一错误 5 分钟只发一封，但 monitor 日志每次都记。
4. 排查「谁在响应发出后又设 header」这类问题**必须有堆栈** —— `reportError` 拿到了 `stack` 但
   `log.monitor` 原来不写 ⇒ 已补（否则完全无从下手）。
