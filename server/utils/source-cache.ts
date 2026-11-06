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

// 与 Nitro 内部 cachedEventHandler 的 getKey/escapeKey 对齐：去掉非词字符、截取前 16 个字符；
// 空则回退 "index"（根路径 "/" 的页面缓存键片段即为 index）。
// 注意：键里的片段是**路径**的转义（/content/cat/slug → contentcatslug），路由片段只是它的前缀。
function routeFrag(route: string): string {
  return String(route).replace(/\W/g, "").slice(0, 16) || "index";
}

/** 清掉源站缓存层里受影响路由的缓存键（routes 省略 = 清整组） */
export async function clearSourceCache(routes?: string[]): Promise<number> {
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
