import { log } from "#server/utils/log";
import { prisma } from "#server/utils/prisma";
import {
  isAutoPurgeEnabled,
  isCdnEnabled,
  isCdnQuotaExhausted,
  purgeCdnRoutes,
  purgeCdnUrls,
  warnCdnNotConfigured,
} from "#server/utils/cdn";
import { siteConfig } from "~~/site.config";
import { contentListPagePaths, contentUrlPaths, PURGE_CONTENT_URL_LIMIT } from "#server/utils/content-urls";
import { CONTENT_PAGE_SIZE_DEFAULT, FOOTPRINT_CACHE_KEY } from "#shared/constants";
import { cacheDel } from "#server/utils/cache/store";
import { isListPageRoute } from "#shared/cache-routes";
import { clearSourceCache } from "#server/utils/source-cache";
import { CHANGELOG_TYPES } from "#shared/changelog";
import type { InvalidateContentCachesOptions } from "#server/types/utils/content-cache";

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
  const cleared = await clearSourceCache({ routes: opts.routes, paths: opts.sourcePaths });
  log.cache("invalidate", {
    routes: opts.routes?.length ? opts.routes.join(",") : (opts.sourcePaths?.length ? "(精确路径)" : "(all)"),
    cleared,
  });

  // 访客分布是「已发布评论」的派生聚合，聚合缓存 TTL 10 分钟是它的新鲜度硬上限；
  // countOnly 目前唯一的来源就是评论写接口（增删/审核），故在这里一并清掉。
  if (opts.countOnly) await clearFootprintCache();

  scheduleCdnPurge(opts);
}

/** 清访客分布聚合缓存（custom:footprint）；失败不影响写库 */
async function clearFootprintCache(): Promise<void> {
  try {
    await cacheDel(FOOTPRINT_CACHE_KEY);
  } catch (error) {
    log.error("[footprint] 缓存清理失败", { error });
  }
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

let purgeTimer: ReturnType<typeof setTimeout> | null = null;
const pendingCids = new Set<number>();
const pendingPaths = new Set<string>();
const pendingRoutes = new Set<string>();
const pendingEdgeRoutes = new Set<string>();
const pendingEdgePaths = new Set<string>();
const pendingEdgeDirectories = new Set<string>();
let pendingEdgeRoutesGiven = false;
// 「本窗口内到目前为止全是纯计数变更」：初始 true（空窗口），出现任意内容类变更即置 false。
// 不能只置 true 不置 false —— 评论和文章保存落在同一个 5 秒窗口时，文章页 URL 会被误跳过。
let pendingCountOnly = true;

/** 累积本次变更并重置防抖计时器（不 await：刷新异步执行，失败不影响写库） */
function scheduleCdnPurge(opts: InvalidateContentCachesOptions): void {
  if (!isAutoPurgeEnabled()) return;
  if (!isCdnEnabled()) {
    // 忘配密钥时内容不会即时更新，必须留痕（否则全程静默）
    warnCdnNotConfigured();
    return;
  }

  for (const cid of opts.contentCids ?? []) {
    if (Number.isInteger(cid) && cid > 0) pendingCids.add(cid);
  }
  for (const path of opts.contentPaths ?? []) pendingPaths.add(path);
  for (const path of opts.edgePaths ?? []) pendingEdgePaths.add(path);
  for (const dir of opts.edgeDirectories ?? []) pendingEdgeDirectories.add(dir);
  if (opts.edgeRoutes) {
    // 显式指定（含空数组）= 调用方自己决定刷哪些边缘路由
    pendingEdgeRoutesGiven = true;
    for (const route of opts.edgeRoutes) pendingEdgeRoutes.add(route);
  }
  if (opts.routes?.length) {
    for (const route of opts.routes) pendingRoutes.add(route);
  } else if (opts.routes === undefined) {
    // 完全不传路由 = 全站失效（站点设置 / 数据导入）；显式传 [] = 不按路由刷
    pendingRoutes.add("/**");
  }
  // 只有整窗全是纯计数变更才按计数类处理（调用方最清楚自己的变更性质）
  if (!opts.countOnly) pendingCountOnly = false;

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
  const edgeRoutes = [...pendingEdgeRoutes];
  const edgePaths = [...pendingEdgePaths];
  const edgeDirectories = [...pendingEdgeDirectories];
  const edgeRoutesGiven = pendingEdgeRoutesGiven;
  const countOnly = pendingCountOnly;
  pendingCids.clear();
  pendingPaths.clear();
  pendingRoutes.clear();
  pendingEdgeRoutes.clear();
  pendingEdgePaths.clear();
  pendingEdgeDirectories.clear();
  pendingEdgeRoutesGiven = false;
  pendingCountOnly = true;

  // 任何一类目标存在就要提交：只看 cids/paths/routes 会让「只传 edgePaths」的变更（点赞）整段跳过
  const hasTargets = cids.length || paths.length || routes.length || edgePaths.length || edgeDirectories.length;
  if (!hasTargets || isCdnQuotaExhausted()) return;

  try {
    const { urls, directories } = await resolvePurgeTargets(cids, paths, routes, edgeRoutes, edgePaths, edgeDirectories, countOnly, edgeRoutesGiven);
    if (urls.length) {
      await purgeCdnUrls(urls, "自动");
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
 * **列表页的刷新粒度**：分类/标签列表按分页拆成无限多变体（?page=N），
 * 逐个刷不可行、刷目录又太贵（目录池 50/天）→ 改为**精确刷「这篇文章所在的那一页」**
 * （页码可枚举：按 create_time 排序的位次 ÷ 每页条数），一次变更 1~3 个 URL。
 * 列表页因此不再出现「第 1 页已更新、第 2 页还是旧的」的不一致。
 *
 * **纯计数类变更**（评论增删/审核）：只刷「文章所在的那一页」（评论数在那一页的卡片上），
 * 不刷路由派生的固定页（/、/about…）→ 200 条评论/天 ≈ 200~600 个 URL，仍在预算内。
 */
async function resolvePurgeTargets(
  cids: number[],
  contentPaths: string[],
  routes: string[],
  edgeRoutes: string[],
  edgePaths: string[],
  edgeDirectories: string[],
  countOnly: boolean,
  edgeRoutesGiven: boolean,
): Promise<{ urls: string[]; directories: string[] }> {
  const base = (process.env.CDN_PURGE_BASE_URL || siteConfig.site.url).replace(/\/+$/, "");
  const urls = new Set<string>();
  const directories = new Set<string>();
  const toUrl = (path: string) => `${base}${path.startsWith("/") ? path : `/${path}`}`;

  // 边缘刷新的路由集合：显式指定优先（edgeRoutes），否则沿用 routes
  const purgeRoutes = edgeRoutesGiven ? edgeRoutes : routes;
  // 本次变更是否影响内容页 → 是则连带刷新列表页（否则只靠短 TTL 收敛）
  const purgeListPages = purgeRoutes.some(route => !isListPageRoute(route));
  const keep = (path: string) => purgeListPages || !isListPageRoute(path);
  // 纯计数类变更（评论）：不刷路由派生的固定页，只刷「文章所在的那一页」
  const skipRouteTargets = countOnly;

  // 超过阈值不展开，交给目录刷新兜底（避免一次分类重命名吃掉上千 URL 额度）
  const usablePaths = contentPaths.length <= PURGE_CONTENT_URL_LIMIT ? contentPaths : [];
  for (const path of usablePaths) {
    if (keep(path)) urls.add(toUrl(path));
  }
  // 显式指定的边缘路径（如点赞只刷文章页）
  for (const path of edgePaths) {
    if (keep(path)) urls.add(toUrl(path));
  }

  let unresolved = false;
  let pagePaths: string[] = [];
  if (cids.length) {
    const rows = await prisma.contents.findMany({
      where: { cid: { in: cids } },
      select: {
        cid: true,
        slug: true,
        type: true,
        create_time: true,
        contentrelations: { select: { metas: { select: { mid: true, slug: true, type: true } } } },
      },
    });
    const found = new Set(rows.map(row => row.cid));
    unresolved = cids.some(cid => !found.has(cid));
    for (const row of rows) {
      // 纯计数变更不刷文章页/分类页裸 URL（评论列表是客户端拉的，文章页没有计数徽章）
      if (!skipRouteTargets) {
        for (const path of contentUrlPaths(row)) {
          if (keep(path)) urls.add(toUrl(path));
        }
      }
    }
    // 列表页：这篇文章所在的分类/标签页（第几页）→ 评论数、更新时间都在那一张卡片上
    pagePaths = await contentListPagePaths(rows, await listPageSize());
  }
  for (const path of pagePaths) urls.add(toUrl(path));

  // 有具体内容路径/cid 时，`/content/**` 等通配不再刷目录
  const hasContentResolution = usablePaths.length > 0 || edgePaths.length > 0 || (cids.length > 0 && !unresolved);

  for (const route of purgeRoutes) {
    if (route === "/**") {
      directories.add("/**");
      continue;
    }
    // 纯计数变更（评论）：固定页与其数据源接口靠短 TTL 自然收敛，不刷边缘
    if (skipRouteTargets) continue;
    if (route.endsWith("/**")) {
      if (!hasContentResolution) directories.add(route);
    } else {
      urls.add(toUrl(route));
      // /sitemap 页面与 /sitemap.xml 是两个路径，但属于同一份数据
      if (route === "/sitemap") urls.add(toUrl("/sitemap.xml"));
      // 边缘缓存键含查询串：/subscribes?source=…、/changelogs?type=… 等变体是独立条目，必须逐个刷
      for (const variant of await queryVariants(route)) urls.add(toUrl(variant));
    }
    for (const apiPath of API_URLS_BY_ROUTE[route] ?? []) urls.add(toUrl(apiPath));
  }

  // 显式指定的目录前缀（结构性变更：文章增删会让后续页码整体位移 → 刷整个列表目录）
  for (const dir of edgeDirectories) directories.add(dir);

  // 相关文章按 cid 单独缓存，文章/评论/附件变更时一并刷新。
  // 边缘缓存键含查询串：文章页实际请求的是 `?limit=3`，裸 URL 刷的是另一条条目。
  if (!skipRouteTargets) {
    for (const cid of cids) {
      urls.add(toUrl(`/api/related-contents/${cid}`));
      urls.add(toUrl(`/api/related-contents/${cid}?limit=3`));
    }
  }

  return { urls: [...urls], directories: [...directories] };
}

/**
 * 列表页每页条数（站点设置，与前台分页用同一个值，否则算出的页码会错）。
 *
 * 直接读 informations 行、不走 getSiteSettings：后者会拉进 #shared/html → isomorphic-dompurify，
 * 把 jsdom 拖进缓存模块的依赖链（单测里 jsdom 加载失败会连带打挂无关用例）。
 */
async function listPageSize(): Promise<number> {
  try {
    const row = await prisma.informations.findUnique({
      where: { key: "contentPageSize" },
      select: { value: true },
    });
    const size = Number(row?.value);
    return Number.isInteger(size) && size > 0 ? size : CONTENT_PAGE_SIZE_DEFAULT;
  } catch (error) {
    log.error("[cdn] 读取每页条数失败，按默认值算", { error });
    return CONTENT_PAGE_SIZE_DEFAULT;
  }
}

/**
 * 内容页的查询串变体（边缘缓存键含查询串，变体是独立条目）。
 *
 * 只处理**可枚举**的变体：/subscribes 的 source、/changelogs 的 type。
 * /map 的变体（view/place）不用展开——它已归入短 TTL 档（列表页档），15 秒内自然收敛。
 * 分页参数（/category/x?page=N）数量不可枚举，同样靠列表页短 TTL 收敛。
 */
async function queryVariants(route: string): Promise<string[]> {
  try {
    if (route === "/subscribes") {
      const subscribes = await prisma.subscribes.findMany({
        select: { id: true },
        take: PURGE_CONTENT_URL_LIMIT,
      });
      return subscribes.map(sub => `/subscribes?source=${sub.id}`);
    }
    if (route === "/changelogs") {
      return CHANGELOG_TYPES.map(type => `/changelogs?type=${encodeURIComponent(type)}`);
    }
    return [];
  } catch (error) {
    log.error("[cdn] 查询变体失败", { error });
    return [];
  }
}
