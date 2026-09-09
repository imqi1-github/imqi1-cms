import { redis } from "#server/utils/redis";

// SCAN 游标遍历 + UNLINK 非阻塞删除，避免大 key 阻塞 Redis（与 admin/cache/clear.post.ts 一致）。
async function scanAndUnlink(pattern: string): Promise<number> {
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

/**
 * 内容变更后立即失效相关缓存 —— 可复用的基建。
 *
 * 任何「改动数据库内容」的后端接口（文章/分类/标签/评论/友链/订阅/更新日志/旅行…）在写库成功后调用一次，
 * 使受影响页面的整页 ISR 缓存即时过期，不必再等 revalidate（当前 30 分钟）。
 *
 * 【精确到页】调用方按"本次改了什么 → 影响哪些页面"传 routes，例如：
 *   - 友链变更   → { routes: ["/links"] }            （博客网络地图 /map 也含友链 → 需一起传）
 *   - 订阅变更   → { routes: ["/", "/subscribes", "/map"] }
 *   - 文章变更   → { routes: ["/", "/category/**", "/tag/**", "/archiving", "/content/**"] }
 *   即"数据只在某几个页面有缓存，就只清这几个"，避免清空整组。
 *
 * 【键匹配】本仓库内容页走整页 ISR，渲染结果按 Nitro 缓存组 `nitro/routes` 落 Redis；
 * 但经 unstorage 落库时 `normalizeKey` 会把 `/`、`\` 归一成 `:`，故**真实 Redis 键是
 * `nitro:routes:_:<pathFrag>.<hash>.json`（冒号，`_` 为 name 段）**——模式必须用冒号。
 *（曾误写成斜杠 `nitro/routes`，导致本函数对页面缓存全程永远 0 命中，已在生产 Redis 实锤，
 *  表现为"改了内容但 ISR 页不刷新"；本次已改为冒号。若日后键前缀变化需实测 Redis 键再调。）
 * 这里不猜单页键，而是把路由化作该页键里必含的「路径片段」，用前缀匹配
 * `*nitro:routes*:<frag>*` —— 既支持精确路由(/map → frag `map`)，也支持 `/<prefix>/**` 通配路由
 *（/content/** → frag `content`，命中所有 /content/... 页）。前缀按 `:` 定位，故 `/sitemap`
 *（片段 sitemap）不会被误当 `/map`(片段 map)。frag 与 Nitro 内部 escapeKey/getKey 对齐
 *（非词字符去掉、取前16字符、空则 "index"），跨版本兼容。
 *
 * 注意：invalidation 是 best-effort，调用方应自行 `.catch()`，不要让 Redis 抖动影响写库本身。
 *
 * @param opts.routes 受影响路由（精确失效；留空退化为清空整组，慎用）。
 */
export async function invalidateContentCaches(opts: { routes?: string[] } = {}): Promise<void> {
  if (!redis) return;

  const patterns = opts.routes?.length
    ? opts.routes.map(r => `*nitro:routes*:${escapeGlob(routeFrag(r))}*`)
    : ["*nitro:routes*"];

  for (const pattern of patterns) {
    await scanAndUnlink(pattern);
  }
}

// 与 Nitro 内部 cachedEventHandler 的 getKey/escapeKey 对齐：去掉非词字符、截取前 16 个字符；
// 空则回退 "index"（根路径 "/" 的页面缓存键片段即为 index）。
function routeFrag(route: string): string {
  return String(route).replace(/\W/g, "").slice(0, 16) || "index";
}

// Redis SCAN MATCH 通配符转义（键片段里的 * ? [ ] 会被当作通配符）。
function escapeGlob(s: string): string {
  return s.replace(/([*?[\\\]])/g, "\\$1");
}
