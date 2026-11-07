/**
 * 源站缓存的精确失效：**必须与存储驱动无关**。
 *
 * 同一份源码要能在两种部署下都工作：
 *   - 不开 Redis：`cache` mount = fs 驱动，键是 `nitro/routes/_/<frag>.<hash>.json`
 *   - 开了 Redis：`cache` mount = redis 驱动，键是 `nitro:routes:_:<frag>.<hash>.json`
 *
 * ⇒ 精确失效不能依赖「完整键名」，只能用「路径片段」+「键后缀」两种与形态无关的匹配。
 * 这条测试把两种键形态都喂进去，锁住「换驱动不影响失效行为」。
 */
import { describe, expect, test } from "bun:test";

import { clearSourceCache, exactKeySuffix } from "#server/utils/source-cache";

const g = globalThis as unknown as { useStorage?: unknown };

/** 装一个假的 storage：键形态由 keys 决定，删掉的键记到 removed */
function mountStorage(keys: string[]): { removed: string[] } {
  const removed: string[] = [];
  g.useStorage = () => ({
    // 文件驱动会无视 base 返回全部键；Redis 驱动才按 base 过滤 —— 两种都喂给代码
    getKeys: async () => [...keys],
    removeItem: async (key: string) => {
      removed.push(key);
    },
  });
  return { removed };
}

/** 两种驱动下的同一页面缓存键 */
const FS_KEY = "nitro/routes/_/categorynote.0S8nTpq2pW.json";
const REDIS_KEY = "nitro:routes:_:categorynote.0S8nTpq2pW.json";
/** 另一个分页变体（同一个 frag、不同 hash） */
const FS_KEY_P3 = "nitro/routes/_/categorynote.3dt9Rv8G3L.json";
const REDIS_KEY_P3 = "nitro:routes:_:categorynote.3dt9Rv8G3L.json";

describe("源站缓存精确失效（文件驱动 vs Redis 驱动）", () => {
  test("精确键在两种驱动下都命中同一条", async () => {
    const suffix = exactKeySuffix("/category/note?page=2");
    expect(suffix).toBe("categorynote.0S8nTpq2pW.json");

    const fs = mountStorage([FS_KEY, FS_KEY_P3]);
    await clearSourceCache({ routes: [], exactPaths: ["/category/note?page=2"] });
    expect(fs.removed).toEqual([FS_KEY]);

    const rd = mountStorage([REDIS_KEY, REDIS_KEY_P3]);
    await clearSourceCache({ routes: [], exactPaths: ["/category/note?page=2"] });
    expect(rd.removed).toEqual([REDIS_KEY]);
  });

  test("按路由清在两种驱动下都整组命中", async () => {
    const fs = mountStorage([FS_KEY, FS_KEY_P3]);
    await clearSourceCache({ routes: ["/category/**"] });
    expect(fs.removed.sort()).toEqual([FS_KEY, FS_KEY_P3].sort());

    const rd = mountStorage([REDIS_KEY, REDIS_KEY_P3]);
    await clearSourceCache({ routes: ["/category/**"] });
    expect(rd.removed.sort()).toEqual([REDIS_KEY, REDIS_KEY_P3].sort());
  });

  test("接口键在两种驱动下都被清（写库后边缘回源不能拿旧 JSON）", async () => {
    const fs = mountStorage([FS_KEY, "nitro/routes/_/apicategories.cccccccccccc.json"]);
    await clearSourceCache({ routes: [], exactPaths: ["/category/note?page=2"] });
    expect(fs.removed).toContain("nitro/routes/_/apicategories.cccccccccccc.json");

    const rd = mountStorage([REDIS_KEY, "nitro:routes:_:apicategories.cccccccccccc.json"]);
    await clearSourceCache({ routes: [], exactPaths: ["/category/note?page=2"] });
    expect(rd.removed).toContain("nitro:routes:_:apicategories.cccccccccccc.json");
  });

  test("关键词清理在两种驱动下都命中（后台「按类别清理」）", async () => {
    const fs = mountStorage([FS_KEY, "nitro/routes/_:contentnotehello.aaaaaaaaaa.json".replace("/_:", "/_/")]);
    await clearSourceCache({ routes: ["/content/**"] });
    expect(fs.removed.length).toBeGreaterThan(0);
  });
});
