import { redis } from "#server/utils/redis";
import { log } from "#server/utils/log";
import { prisma } from "#server/utils/prisma";
import {
  isAutoPurgeEnabled,
  isCdnEnabled,
  isCdnQuotaExhausted,
  purgeCdnRoutes,
  purgeCdnUrls,
} from "#server/utils/cdn";
import { siteConfig } from "~~/site.config";
import { contentUrlPaths, PURGE_CONTENT_URL_LIMIT } from "#server/utils/content-urls";
import { isListPageRoute } from "#server/utils/cache-routes";
import type { InvalidateContentCachesOptions } from "#server/types/utils/content-cache";

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
 * 任何「改动数据库内容」的后端接口（文章/分类/标签/评论/友链/订阅/更新日志/旅行…）在写库成功后调用一次。
 *
 * 【两层缓存】
 *   - 源站缓存：键在 Nitro 缓存组 `nitro/routes`，经 unstorage 落库时 `/` 归一成 `:`，
 *     真实 Redis 键是 `nitro:routes:_:<pathFrag>.<hash>.json`（见 [[nitro-route-cache-key-colon]]）。
 *     页面键与公开 API 键都在这一组，写库时一起删掉。
 *   - 边缘缓存：按路由展开成**精确 URL** 后刷新（URL 池 1000/天）；只有 `/content/**` 等
 *     通配无法展开时才退回目录刷新（目录池仅 50/天）。提交前做 5 秒防抖，
 *     编辑器自动保存的连续写库只会合并成一次刷新。
 *
 * 注意：invalidation 是 best-effort，调用方应自行 `.catch()`，不要让缓存层抖动影响写库本身。
 */
export async function invalidateContentCaches(opts: InvalidateContentCachesOptions = {}): Promise<void> {
  const cleared = await clearSourceCache(opts.routes);
  log.cache("invalidate", {
    routes: opts.routes?.length ? opts.routes.join(",") : "(all)",
    cleared,
  });

  scheduleCdnPurge(opts);
}

/**
 * 清掉源站缓存层里受影响路由的缓存键。
 *
 * 走 Nitro storage API（`cache` mount：配了 Redis 是 redis 驱动，没配就是文件驱动 ./.nitro/cache），
 * **驱动无关**。公开 API 的源站缓存也在这组里，写库时必须一起清，否则边缘回源拿到的仍是旧 JSON。
 */
async function clearSourceCache(routes?: string[]): Promise<number> {
  const storage = useStorage("cache");
  // 文件驱动的 getKeys 会无视 base 返回全部键（Redis 驱动才按 base 过滤），所以自己再筛一遍缓存组
  const keys = (await storage.getKeys("nitro:routes")).filter(isRouteCacheKey);
  if (!keys.length) return 0;

  const frags = routes?.length ? routes.map(routeFrag) : null;
  const targets = keys.filter((key) => {
    const frag = keyFrag(key);
    // API 缓存键（apisite / apicategories…）变化快，任何写库都一并清掉
    if (frag.startsWith("api")) return true;
    return frags ? frags.some(fragPrefix => frag.startsWith(fragPrefix)) : true;
  });

  for (const key of targets) {
    await storage.removeItem(key);
  }
  return targets.length;
}

/** 是否是页面/接口缓存组的键（排除图标缓存等其他缓存组） */
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

/**
 * 路由 → 受影响的公开 API（这些接口也在边缘缓存，页面刷新后接口不能还是旧 JSON）。
 *
 * 这些接口的边缘 TTL 已是 60 秒（API_S_MAXAGE），本身就会自然收敛；
 * 显式刷新只是让「改完立刻看到」更快，不是正确性必需。
 */
const API_URLS_BY_ROUTE: Record<string, string[]> = {
  "/": ["/api/home-data"],
  "/category/**": ["/api/categories"],
  "/tag/**": ["/api/tags"],
  "/subscribes": ["/api/subscribes"],
  "/changelogs": ["/api/changelogs"],
  "/about": ["/api/travels"],
  "/map": ["/api/travels", "/api/blog-network"],
  "/links": ["/api/blog-network"],
};

/** 边缘刷新防抖：编辑器 2 秒自动保存会连续写库，合并成一次提交 */
const PURGE_DEBOUNCE_MS = 5_000;
/** 单次最多提交的 URL 数（免费版单次 500） */
const PURGE_URL_LIMIT = 500;

let purgeTimer: ReturnType<typeof setTimeout> | null = null;
const pendingCids = new Set<number>();
const pendingPaths = new Set<string>();
const pendingRoutes = new Set<string>();

/** 累积本次变更并重置防抖计时器（不 await：刷新异步执行，失败不影响写库） */
function scheduleCdnPurge(opts: InvalidateContentCachesOptions): void {
  if (!isAutoPurgeEnabled() || !isCdnEnabled()) return;

  for (const cid of opts.contentCids ?? []) {
    if (Number.isInteger(cid) && cid > 0) pendingCids.add(cid);
  }
  for (const path of opts.contentPaths ?? []) pendingPaths.add(path);
  if (opts.routes?.length) {
    for (const route of opts.routes) pendingRoutes.add(route);
  } else {
    // 没传路由 = 全站失效（站点设置 / 数据导入）
    pendingRoutes.add("/**");
  }

  if (purgeTimer) clearTimeout(purgeTimer);
  purgeTimer = setTimeout(() => {
    purgeTimer = null;
    void flushCdnPurge();
  }, PURGE_DEBOUNCE_MS);
  purgeTimer.unref?.();
}

/** 防抖到点后执行一次刷新：精确 URL 走 URL 池，展开不了的才退回目录 */
async function flushCdnPurge(): Promise<void> {
  const cids = [...pendingCids];
  const paths = [...pendingPaths];
  const routes = [...pendingRoutes];
  pendingCids.clear();
  pendingPaths.clear();
  pendingRoutes.clear();

  if ((!cids.length && !paths.length && !routes.length) || isCdnQuotaExhausted()) return;

  try {
    const { urls, directories } = await resolvePurgeTargets(cids, paths, routes);
    if (urls.length) {
      await purgeCdnUrls(urls.slice(0, PURGE_URL_LIMIT));
    }
    if (directories.length) {
      await purgeCdnRoutes(directories);
    }
  } catch (error) {
    log.error("[cdn] 自动刷新失败", { error });
  }
}

/**
 * 把路由 + cid / 已确定路径展开成边缘刷新目标。
 *
 * 优先用**具体 URL**（URL 池 1000/天）；只有展开不了或超过阈值（一次分类重命名可能
 * 涉及上千篇文章）时才退回目录刷新（目录池 50/天）。
 *
 * **列表/统计页按变更类型区别对待**：
 *   - 纯计数类变更（评论增删/审核）：不刷。它们边缘 TTL 短（build.listPageCacheSeconds），
 *     写库时源站缓存键已删掉，下次回源渲染出的就是新数据 → 60 秒内自然收敛。
 *     200 条评论/天若每次都刷这 6 个固定 URL，光这一项就吃掉 1200 个 URL 额度。
 *   - 内容类变更（文章增删改等）：连带刷新。首页/分类页的卡片也展示该文章，
 *     用户改完期望秒级看到。
 */
async function resolvePurgeTargets(
  cids: number[],
  contentPaths: string[],
  routes: string[],
): Promise<{ urls: string[]; directories: string[] }> {
  const base = (process.env.CDN_PURGE_BASE_URL || siteConfig.site.url).replace(/\/+$/, "");
  const urls = new Set<string>();
  const directories = new Set<string>();
  const toUrl = (path: string) => `${base}${path.startsWith("/") ? path : `/${path}`}`;

  // 本次变更是否影响内容页 → 是则连带刷新列表页（否则只靠短 TTL 收敛）
  const purgeListPages = routes.some(route => !isListPageRoute(route));
  const keep = (path: string) => purgeListPages || !isListPageRoute(path);
  // 纯计数类变更（评论）：列表页靠短 TTL 收敛，文章页的评论列表由客户端实时拉（/api/comments 无缓存头）
  // → 完全不提交边缘刷新，200 条评论/天 = 0 个额度
  const countOnly = !purgeListPages;

  // 超过阈值不展开，交给目录刷新兜底（避免一次分类重命名吃掉上千 URL 额度）
  const usablePaths = countOnly ? [] : contentPaths.length <= PURGE_CONTENT_URL_LIMIT ? contentPaths : [];
  for (const path of usablePaths) {
    if (keep(path)) urls.add(toUrl(path));
  }

  let unresolved = false;
  if (cids.length && !countOnly) {
    const rows = await prisma.contents.findMany({
      where: { cid: { in: cids } },
      select: {
        cid: true,
        slug: true,
        type: true,
        contentrelations: { select: { metas: { select: { slug: true, type: true } } } },
      },
    });
    const found = new Set(rows.map(row => row.cid));
    unresolved = cids.some(cid => !found.has(cid));
    for (const row of rows) {
      for (const path of contentUrlPaths(row)) {
        if (keep(path)) urls.add(toUrl(path));
      }
    }
  }

  // 有具体内容路径/cid 时，`/content/**` 等通配不再刷目录
  const hasContentResolution = usablePaths.length > 0 || (cids.length > 0 && !unresolved);

  for (const route of routes) {
    if (route === "/**") {
      directories.add("/**");
      continue;
    }
    // 纯计数变更（评论）：列表页与其数据源接口都靠 60 秒 TTL 自然收敛，不刷边缘
    if (countOnly) continue;
    if (route.endsWith("/**")) {
      if (!hasContentResolution) directories.add(route);
    } else {
      urls.add(toUrl(route));
      // /sitemap 页面与 /sitemap.xml 是两个路径，但属于同一份数据
      if (route === "/sitemap") urls.add(toUrl("/sitemap.xml"));
    }
    for (const apiPath of API_URLS_BY_ROUTE[route] ?? []) urls.add(toUrl(apiPath));
  }

  // 相关文章按 cid 单独缓存，文章/评论/附件变更时一并刷新
  if (!countOnly) {
    for (const cid of cids) urls.add(toUrl(`/api/related-contents/${cid}`));
  }

  return { urls: [...urls], directories: [...directories] };
}
