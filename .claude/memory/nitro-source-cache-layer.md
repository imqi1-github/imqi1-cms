---
name: nitro-source-cache-layer
description: Nitro 源站缓存层（routeRules.cache）：node-server 预设只认 cache 对象、裸 isr 是死键；缓存键形态按驱动不同（Redis 冒号 / 文件斜杠），精确失效靠「路径片段前缀 + 键后缀」两种驱动无关的匹配；缓存器的挂载条件、缓存处理器会盖掉 Cache-Control、文件驱动无 TTL（键空间无界的路由只能用 Redis）
metadata:
  type: project
---

# Nitro 源站缓存层：routeRules、键形态、精确失效

## 一、routeRules：只有 `cache` 对象有效

- **node-server 预设（裸机与 Docker 同）只消费 `routeRules.cache`**（`nitropack/dist/runtime/internal/app.mjs` 的 `if (routeRules.cache)` 才包装处理器）。**裸 `isr: N` 是死键** —— 只有 Vercel/Netlify/Zeabur 等 serverless preset 消费它。
- ⇒ 新增要缓存的路由时写 `cache: { maxAge, base }`（`base` 省略 = 默认 `/cache` 挂载 → 文件驱动），**不要写裸 `isr`**。`swr: N` 会被 `normalizeRouteRules` 转成 cache 对象，也可用。
- 当前配置（`nuxt.config.ts` 的 `pageCacheRules`）：**Redis 开 → `{ isr, cache: { maxAge, base: "redis" } }`；Redis 关 → `{ cache: { maxAge, base: "cache" } }`**。两种驱动都挂页面缓存 ⇒ **Redis 开关不影响页面缓存这一层**。
- `isr: false`（`/admin/**`）与 `ssr: false`（`/login`）是另一回事，仍生效。

## 二、缓存键形态（**两种驱动不同**）

| 驱动 | 键 |
|---|---|
| Redis | `nitro:routes:_:<pathFrag>.<hash>.json`（**冒号**） |
| 文件 | `.nitro/cache/nitro/routes/_/<pathFrag>.<hash>.json`（**斜杠**） |

- 源码里 group 是 `group:"nitro/routes"`（斜杠），键 = `[base, group, name, key + ".json"].join(":")`；落库时 unstorage 的 `normalizeKey` 把 `/`、`\` **全部换成 `:`** ⇒ **在失效 pattern 里写斜杠 `nitro/routes` 会 0 命中且完全静默**（曾导致 `invalidateContentCaches` 全程空转：改了内容但页面不刷新，且 `void ....catch()` 吞掉错误）。⇒ 扫键一律用 `nitro:routes`。
- `base:"redis"` 经 mount 路由被摘掉，故 Redis 键**无 `redis:` 前缀**。
- **文件驱动的 `getKeys` 无视 base、返回全部键**（Redis 驱动才按 base 过滤）⇒ 取键后必须自己再筛缓存组（`isRouteCacheKey`）。

### 键的组成

- `pathFrag` = `decodeURI(路径)` → 剥非词字符 `\W` → **截前 16 字符**（空则 `index`）。中文 slug **必须先 decodeURI**，否则 `%` 转义片段对不上。路由片段（如 `/category/**` → `category`）只是路径片段的**前缀**。
- `hash` = `digest(完整URL)` 去掉 `-_` 后取前 10 位（`digest` 来自 **ohash**，与 nitro 内部同一实现）⇒ 可自行复现：`exactKeySuffix(url)` = `<pathFrag>.<hash>.json`。
- 源站缓存键含**完整 URL**（含查询串）⇒ 爬虫推广参数会各生成一份缓存文件 + 一次整页渲染（`server/middleware/cache-key.ts` 归一化查询串修掉）。
- 片段只取 16 字符 ⇒ **所有分类页的所有分页变体共用一个 frag** → 按路由清只能整组清；`hash` 部分能自己算出来 ⇒ 可用 `exactPaths` 精确删到某一条。

## 三、精确失效（`server/utils/source-cache.ts`）

`clearSourceCache({ routes, paths, exactPaths })`：

- 走 **`useStorage("cache")`**（不是裸 Redis SCAN）⇒ **驱动无关**：Redis 与文件驱动都能精确失效。
- 三种匹配并存：
  1. `frag.startsWith(路由片段)` —— 按路由清（粗，可能多清一条，可接受；**漏清会让旧内容挂满 TTL**）；
  2. `frag.startsWith(路径片段)` —— 按具体路径清（文章页）；
  3. `key.endsWith(exactKeySuffix(完整URL))` —— **精确到某一条**（如 `/category/note?page=2`）。
- **任何情况下都清 `api*` 键**（接口缓存随写库一起失效，否则边缘回源拿到旧 JSON）。
- `routes` 与 `paths`/`exactPaths` 都不给 = 清整组；`routes: []` = 不按路由清。
- 计数类变更（评论）用 `exactPaths` 精确删「文章所在的那一页」+ **邻页 ±1**（位次按 `create_time` 算，同秒并列会差 1）。

### 安全网测试（改算法先看它红）

- `test/unit/server/utils/source-cache.test.ts`：**golden vector** —— `/category/note?page=2` → `categorynote.0S8nTpq2pW.json`（取自真实缓存文件）。ohash/nitro 升级导致算法漂移时这条测试先红，而不是让精确失效静默失效。
- `test/unit/server/utils/source-cache-drivers.test.ts`：文件驱动 vs Redis 驱动下**精确键 / 按路由清 / 接口键 / 关键词清**四种命中结果一致。

## 四、缓存器的挂载条件与「Cache-Control 被覆盖」

- **`routeRules.cache` 不是给路径加个键就行**：nitro 构建期靠 `extendMiddlewareWithRuleOverlaps`（`nitropack/dist/rollup/index.mjs`）为每条带 `cache` 的规则**额外插一个该路径的处理器**，运行时 `app.mjs` 才用 `getRouteRulesForPath(h.route)` 找到规则并包 `cachedEventHandler`。
  - 规则路径**必须与请求路径匹配**（`/search` 匹配 `/search`，不匹配 `/search/`）；没有对应规则 ⇒ 处理器不会被包装 ⇒ 该路径零源站缓存（响应里也不会有 `Last-Modified`）。
  - 规则带 `cache` 而**嵌套在别的带 cache 的通配规则下**（如 `/x/**` 已缓存 ⇒ `/x/y` 也被包）也会被插进去。
- **Nitro 的缓存处理器会写死 `cache-control: max-age=<源站 TTL>`，盖掉 routeRules 里的 `headers`** ⇒ 想让边缘 TTL 生效，必须在响应发出前改回来（`server/plugins/cache-control.ts` 的 `beforeResponse`；304 路径另由 `server/middleware/cache-304.ts` 修）。
  - ⇒ **「规则里写了 `no-store` 就一定不进边缘」是错的**：一旦该路径挂了 `cache`，`no-store` 会被缓存处理器覆盖，边缘反而会缓存它。
- **文件驱动没有 TTL**（`node_modules/unstorage/drivers/fs.mjs` 不处理 `ttl`）⇒ 落盘的文件**永不过期**，只靠同键覆盖。
  - ⇒ **键空间无界的路由（如 `/search?q=…`）绝不能用文件驱动**（磁盘无限增长 + 一个可被刷的 DoS 面），只能用有原生 TTL 的 Redis。

## 五、搜索页这一档（键空间无界的典型）

- `/search` 的缓存键含完整 URL（`q` 进键）⇒ 每个关键词一份，写库后**无法枚举 q 精确失效** ⇒ 只能靠 TTL 收敛：边缘 `build.searchCacheSeconds`（60s），源站缓存**只在 Redis 开启时挂**。
- 查询串归一化（`server/middleware/cache-key.ts` / `cache-canonical.ts`）只保留 `SIGNIFICANT_QUERY_PARAMS` 登记的参数 ⇒ **`/search` 必须登记 `q` 与 `type`**，漏登记会把 q 剥掉 ⇒ 所有查询共用一个缓存键 ⇒ 搜索结果串页（与 `/map` 的 `place` 同类事故）。
- **结果仍由 SSR 渲染进 HTML**（不要改成客户端拉）：边缘缓存键含 `q` ⇒ 客户端再拉一次 `/api/search` 就是第二次往返，比「首字节就带结果」慢。`/api/search` 本身进边缘缓存（浏览器每次回源验证），只在用户改关键词时才用到。
- 结果的源站缓存走 `server/utils/cache/store.ts` 的进程内 store（Redis 未启用时的兜底，TTL 10 分钟 + 上限 1 万条 + 淘汰），**不是** Nitro 的路由缓存层。

## 六、排查要点

- 验证真实键：服务器上 `redis-cli -n <db> --scan --pattern '*nitro:routes*'`（**先实扫 Redis 再改代码**，别只看 nitro 源码：源码斜杠、落库冒号）。
- 无 Redis 时看文件：`.nitro/cache/nitro/routes/_/`。
- 「改了内容但页面不刷新」的排查顺序：① 源站缓存键是否被删（`log.cache("invalidate", { cleared })` 的 cleared 数量）→ ② 边缘是否刷新成功（`log.cache("CDN 刷新", { 结果 })`）→ ③ 是否命中了错误的键形态。

相关：[[cdn-edgeone-purge-and-cache-migration]]、[[redis-build-baked-docker-ondemand]]
