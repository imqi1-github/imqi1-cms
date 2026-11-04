import { redis } from "#server/utils/redis";
import { log } from "#server/utils/log";
import { isAutoPurgeEnabled, purgeCdnRoutes } from "#server/utils/cdn";

// SCAN 游标遍历 + UNLINK 非阻塞删除，避免大 key 阻塞 Redis（与 admin/cache/clear.post.ts 一致）。
// 导出给 MCP 运维工具 clear_cache 复用（search/footprint/keyword 清理与 admin 端同模式）。
export async function scanAndUnlink(pattern: string): Promise<number> {
  if (!redis) return 0;
  let cursor = "0";
  let removed = 0;
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
    cursor = next;
    if (keys.length > 0) {
      await redis.unlink(...keys);
      removed += keys.length;
    }
  } while (cursor !== "0");
  return removed;
}

/** 只计数不删除：SCAN 遍历匹配键数（MCP get_cache_info 按前缀统计用）。 */
export async function countKeysByPattern(pattern: string): Promise<number> {
  if (!redis) return 0;
  let cursor = "0";
  let count = 0;
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
    cursor = next;
    count += keys.length;
  } while (cursor !== "0");
  return count;
}

/**
 * 内容变更后立即失效相关缓存 —— 可复用的基建。
 *
 * 任何「改动数据库内容」的后端接口（文章/分类/标签/评论/友链/订阅/更新日志/旅行…）在写库成功后调用一次，
 * 使受影响页面的缓存即时过期，不必再等 TTL（当前 30 分钟）。
 *
 * 【精确到页】调用方按"本次改了什么 → 影响哪些页面"传 routes，取值一律用 shared/constants.ts
 * 里那组具名常量（LINKS_CACHE_ROUTES / SUBSCRIBE_CACHE_ROUTES / CONTENT_CACHE_ROUTES…），
 * 别就地手写数组 —— 同一组原先在几十个接口里各抄一份，改一处漏一处前台就一直看到旧数据。
 * 即"数据只在某几个页面有缓存，就只清这几个"，避免清空整组。
 *
 * 【两层缓存】页面缓存在 CDN 边缘（见 server/utils/cdn/），源站若还挂着 Redis ISR 则另有源站缓存：
 *   - 源站缓存：键在 Nitro 缓存组 `nitro/routes`，但经 unstorage 落库时 `normalizeKey` 会把 `/`、`\`
 *     归一成 `:`，故**真实 Redis 键是 `nitro:routes:_:<pathFrag>.<hash>.json`（冒号，`_` 为 name 段）**
 *     ——模式必须用冒号。（曾误写成斜杠 `nitro/routes`，导致本函数对页面缓存全程永远 0 命中，
 *     已在生产 Redis 实锤，表现为"改了内容但 ISR 页不刷新"；本次已改为冒号。）
 *     这里不猜单页键，而是把路由化作该页键里必含的「路径片段」，用前缀匹配
 *     `*nitro:routes*:<frag>*` —— 既支持精确路由(/map → frag `map`)，也支持 `/<prefix>/**` 通配路由
 *     （/content/** → frag `content`，命中所有 /content/... 页）。
 *   - CDN 边缘缓存：路由转成 URL/目录前缀交给 EdgeOne 刷新（不支持通配符 URL，故 `/**` 路由走目录刷新）。
 * 两层都要清，否则会出现"CDN 已刷新但源站还是旧的"（或反之）导致前台忽旧忽新。
 *
 * 注意：invalidation 是 best-effort，调用方应自行 `.catch()`，不要让缓存层抖动影响写库本身。
 *
 * @param opts.routes 受影响路由（精确失效；留空退化为清空整组，慎用）。
 */
export async function invalidateContentCaches(opts: { routes?: string[] } = {}): Promise<void> {
  const cleared = await clearSourceCache(opts.routes);
  log.cache("invalidate", {
    routes: opts.routes?.length ? opts.routes.join(",") : "(all)",
    cleared,
  });

  // CDN 边缘缓存：自动刷新默认关闭（CDN_AUTO_PURGE=1 才开）。
  // 日常内容更新靠「边缘缓存预刷新 + 源站 ETag」在 TTL 内自动收敛，不消耗刷新额度。
  if (isAutoPurgeEnabled()) {
    await purgeCdnRoutes(opts.routes);
  }
}

/**
 * 清掉源站缓存层里受影响路由的缓存键。
 *
 * 走 Nitro storage API（`cache` mount：配了 Redis 是 redis 驱动，没配就是文件驱动 ./.nitro/cache），
 * **驱动无关**——Redis 关掉后源站这层照样能被精确失效。这是边缘缓存能实时生效的前提：
 * 不清源站副本的话，边缘回源验证拿到的还是旧副本，变化传不上去。
 */
async function clearSourceCache(routes?: string[]): Promise<number> {
  const storage = useStorage("cache");
  // 文件驱动的 getKeys 会无视 base 返回全部键（Redis 驱动才按 base 过滤），所以自己再筛一遍缓存组
  const keys = (await storage.getKeys("nitro:routes")).filter(isRouteCacheKey);
  if (!keys.length) return 0;

  const frags = routes?.length ? routes.map(routeFrag) : null;
  const targets = frags ? keys.filter(key => frags.some(frag => keyFrag(key).startsWith(frag))) : keys;

  for (const key of targets) {
    await storage.removeItem(key);
  }
  return targets.length;
}

/** 是否是页面缓存组的键（排除图标缓存等其他缓存组） */
function isRouteCacheKey(key: string): boolean {
  return key.startsWith("nitro:routes") || key.startsWith("nitro/routes");
}

/**
 * 从缓存键里取出路由片段。
 *
 * 键形：Redis 驱动 `nitro:routes:_:<frag>.<hash>.json`、文件驱动 `nitro/routes/_/<frag>.<hash>.json`
 * （同一把键，两种驱动只是分隔符不同）。
 */
function keyFrag(key: string): string {
  const segment = key.split(/[:/]/).pop() ?? "";
  return segment.replace(/\.[^.]+\.json$/, "");
}

// 与 Nitro 内部 cachedEventHandler 的 getKey/escapeKey 对齐：去掉非词字符、截取前 16 个字符；
// 空则回退 "index"（根路径 "/" 的页面缓存键片段即为 index）。
// 注意：键里的片段是**路径**的转义（/content/cat/slug → contentcatslug），路由片段只是它的前缀。
function routeFrag(route: string): string {
  return String(route).replace(/\W/g, "").slice(0, 16) || "index";
}
