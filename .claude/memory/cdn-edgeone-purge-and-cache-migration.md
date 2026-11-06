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
