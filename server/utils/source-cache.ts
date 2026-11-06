import { digest } from "ohash";

import { log } from "#server/utils/log";

/**
 * 源站缓存层（Nitro 路由缓存组）的精确失效。
 *
 * 走 Nitro storage API（`cache` mount：配了 Redis 是 redis 驱动，没配就是文件驱动 ./.nitro/cache），
 * **驱动无关**。公开 API 的源站缓存也在这组里，写库时必须一起清，否则边缘回源拿到的仍是旧 JSON。
 */

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

// 与 Nitro 内部 cachedEventHandler 的 getKey/escapeKey 对齐：先 decodeURI 再剥非词字符、
// 截取前 16 个字符；空则回退 "index"（根路径 "/" 的页面缓存键片段即为 index）。
// decodeURI 不能省：中文 slug 未解码时 `\W` 只留下百分号转义片段，与实际键对不上。
// 注意：片段是**路径**的转义（/content/cat/slug → contentcatslug），路由片段只是它的前缀。
function pathFrag(path: string): string {
  let decoded = path;
  try {
    decoded = decodeURI(path);
  } catch {
    // 非法百分号转义：保持原样，退化成前缀匹配（宁可多清，不漏清）
  }
  return decoded.replace(/\W/g, "").slice(0, 16) || "index";
}

export interface ClearSourceCacheOptions {
  /** 按路由匹配串清（`/content/**` 这种前缀语义）；**不传** = 清整组 */
  routes?: string[];
  /** 精确到具体页面路径（与 routes 取并集）；用于「只影响某几篇文章页」的变更 */
  paths?: string[];
  /**
   * 精确到**完整 URL**（含查询串）的缓存键，如 `/category/note?page=2`。
   *
   * 列表页的分页变体共用同一个路径片段（frag 只有 16 字符且是前缀语义），
   * 按路由清只能整组清；这里直接构造出那一条的确切键 → 只清「文章所在的那一页」。
   */
  exactPaths?: string[];
}

/**
 * 构造精确缓存键的后缀 `<frag>.<hash>.json`（与 Nitro cachedEventHandler 的 getKey 对齐）。
 *
 * frag = escapeKey(decodeURI(pathname)).slice(0,16)、hash = digest(完整URL) 去 -_ 取 10 位。
 * 两种存储驱动的键前缀不同（Redis `nitro:routes:_:` / 文件 `nitro/routes/_/`），
 * 故按「后缀」匹配，两种驱动通用。
 */
export function exactKeySuffix(url: string): string {
  const pathname = url.split("?")[0] || "/";
  const hash = digest(url).replace(/[-_]/g, "").slice(0, 10);
  return `${pathFrag(pathname)}.${hash}.json`;
}

/**
 * 清掉源站缓存层里受影响的缓存键。
 *
 * - `routes` 不传且 `paths`/`exactPaths` 为空 → 清整组（站点设置 / 数据导入这类全局变更）。
 * - `routes` 传空数组 → 不按路由清（配合 `paths`/`exactPaths` 精确清）。
 * - 任何情况下都清 `api*` 键：接口缓存随写库一起失效，否则边缘回源拿到旧 JSON。
 */
export async function clearSourceCache(opts: ClearSourceCacheOptions = {}): Promise<number> {
  const storage = useStorage("cache");
  // 文件驱动的 getKeys 会无视 base 返回全部键（Redis 驱动才按 base 过滤），所以自己再筛一遍缓存组
  const keys = (await storage.getKeys("nitro:routes")).filter(isRouteCacheKey);
  if (!keys.length) return 0;

  const routeFrags = opts.routes?.map(pathFrag) ?? null;
  const pathFrags = opts.paths?.length ? opts.paths.map(pathFrag) : null;
  const exactSuffixes = opts.exactPaths?.length ? opts.exactPaths.map(exactKeySuffix) : null;
  // routes 与精确路径都没给 = 全站失效
  const clearAll = routeFrags === null && !pathFrags && !exactSuffixes;

  const targets = keys.filter((key) => {
    const frag = keyFrag(key);
    if (frag.startsWith("api")) return true;
    if (clearAll) return true;
    // 精确键：后缀完全一致才算命中（frag 截断导致的歧义不影响这一层）
    if (exactSuffixes?.some(suffix => key.endsWith(suffix))) return true;
    // 片段最多 16 字符：超长路径会截断，两条长路径可能共用一个片段 → 多清一个页面，
    // 代价是多渲染一次，可接受；漏清会让旧内容挂满整个 TTL。
    if (pathFrags?.some(prefix => frag.startsWith(prefix))) return true;
    return routeFrags?.some(prefix => frag.startsWith(prefix)) ?? false;
  });

  for (const key of targets) {
    await storage.removeItem(key);
  }
  return targets.length;
}

/**
 * 按键名片段清源站页面缓存（后台「缓存管理」的预设/关键词清理走这里）。
 * 驱动无关：Redis 与文件驱动都读同一组 nitro:routes 键。
 */
export async function clearSourceCacheByKeyword(keyword: string): Promise<number> {
  const needle = keyword.trim().replace(/^\/+/, "");
  if (!needle) return 0;
  const storage = useStorage("cache");
  const keys = (await storage.getKeys("nitro:routes")).filter(isRouteCacheKey);
  const targets = keys.filter(key => keyFrag(key).includes(needle));
  for (const key of targets) {
    await storage.removeItem(key);
  }
  log.cache("invalidate", { 关键词: needle, cleared: targets.length });
  return targets.length;
}
