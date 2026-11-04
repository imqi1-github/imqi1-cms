// 源站缓存层的精确失效：走 Nitro storage API（Redis / 文件驱动通用）。
// 键形：Redis 驱动 nitro:routes:_:<frag>.<hash>.json、文件驱动 nitro/routes/_/<frag>.<hash>.json
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

const store = new Map<string, string>();
const removed: string[] = [];

const g = globalThis as unknown as { useStorage?: unknown };
g.useStorage = () => ({
  // 文件驱动的 getKeys 无视 base 返回全部键，这里照它模拟（实现自己要再筛缓存组）
  getKeys: async () => [...store.keys()],
  removeItem: async (key: string) => {
    removed.push(key);
    store.delete(key);
  },
});

const { invalidateContentCaches } = await import("#server/utils/content-cache");

beforeEach(() => {
  store.clear();
  removed.length = 0;
  // 造一批页面缓存键（键片段是路径的转义，路由片段是它的前缀）
  store.set("nitro:routes:_:index.abc123.json", "{}");
  store.set("nitro:routes:_:contentcatslug.def456.json", "{}");
  store.set("nitro:routes:_:contenttechpost.ghi789.json", "{}");
  store.set("nitro:routes:_:categorytech.jkl012.json", "{}");
  store.set("nitro:routes:_:tagtech.mno345.json", "{}");
  store.set("nitro:routes:_:archiving.pqr678.json", "{}");
  // 别的缓存组（图标缓存等）不该被动到
  store.set("nuxt:icon:lucide_bug.xyz.json", "{}");
});

describe("invalidateContentCaches", () => {
  test("按路由失效：只删该路由前缀的键", async () => {
    await invalidateContentCaches({ routes: ["/content/**"] });
    expect(removed.sort()).toEqual(["nitro:routes:_:contentcatslug.def456.json", "nitro:routes:_:contenttechpost.ghi789.json"]);
  });

  test("根路由 → 只删 index 键（/sitemap 不误伤）", async () => {
    await invalidateContentCaches({ routes: ["/"] });
    expect(removed).toEqual(["nitro:routes:_:index.abc123.json"]);
  });

  test("无 routes 时清空整组页面缓存，但不碰别的缓存组", async () => {
    await invalidateContentCaches();
    expect(removed.length).toBe(6);
    expect(removed.some(k => k.startsWith("nuxt:"))).toBe(false);
  });

  test("文件驱动的键形（斜杠分隔）同样能命中", async () => {
    store.clear();
    store.set("nitro/routes/_/contentcatslug.def456.json", "{}");
    store.set("nitro/routes/_/index.abc123.json", "{}");
    await invalidateContentCaches({ routes: ["/content/**"] });
    expect(removed).toEqual(["nitro/routes/_/contentcatslug.def456.json"]);
  });
});
