// 边缘刷新目标解析：列表/统计页（短 TTL）不刷边缘，内容页才刷；
// 查询串变体是独立边缘条目，必须逐个刷。
// 关键约束：200 条评论/天若每次都刷列表页那 6 个固定 URL，光这一项就超额度。
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

const purgedUrls: string[][] = [];
const purgedRoutes: string[][] = [];
const deletedCacheKeys: string[] = [];

mock.module("#server/utils/cdn", () => ({
  isAutoPurgeEnabled: () => true,
  isCdnEnabled: () => true,
  isCdnQuotaExhausted: () => false,
  warnCdnNotConfigured: () => undefined,
  purgeCdnUrls: async (urls: string[]) => {
    purgedUrls.push(urls);
    return { provider: "edgeone", success: true, requested: urls.length };
  },
  purgeCdnRoutes: async (routes: string[]) => {
    purgedRoutes.push(routes);
    return { provider: "edgeone", success: true, requested: routes.length };
  },
}));

// 访客分布聚合缓存：评论变更时要清掉（它的 TTL 是读者地图的新鲜度硬上限）
mock.module("#server/utils/cache/store", () => ({
  cacheDel: async (key: string) => {
    deletedCacheKeys.push(key);
  },
}));

// 源站缓存层：记录被删掉的键，用来验证「精确路径失效」
const storageKeys: string[] = [];
const removedKeys: string[] = [];
const g = globalThis as unknown as { useStorage?: unknown };
g.useStorage = () => ({
  getKeys: async () => [...storageKeys],
  removeItem: async (key: string) => {
    removedKeys.push(key);
  },
});

// 文章 URL 展开要查 DB：给 cid 1024 一条带分类/标签的记录
mock.module("#server/utils/prisma", () => ({
  prisma: {
    contents: {
      // 位次计算：假设「比它新的文章」有 20 篇 → 每页 12 条 → 第 2 页
      count: async () => 20,
      findMany: async () => [
        {
          cid: 1024,
          slug: "hello",
          type: 0,
          create_time: new Date("2026-01-01T00:00:00Z"),
          contentrelations: [
            { metas: { mid: 1, slug: "note", type: "category" } },
            { metas: { mid: 9, slug: "js", type: "tag" } },
          ],
        },
      ],
    },
    travels: {
      findMany: async () => [{ id: 5 }, { id: 7 }],
    },
    subscribes: {
      findMany: async () => [{ id: 1 }, { id: 2 }],
    },
    informations: {
      findUnique: async () => ({ value: "12" }),
    },
  },
}));

const { invalidateContentCaches } = await import("#server/utils/content-cache");
const { exactKeySuffix } = await import("#server/utils/source-cache");

/** 用生产实现构造源站缓存键（测试与生产同源，避免各写一套） */
const keyOf = (url: string) => `nitro:routes:_:${exactKeySuffix(url)}`;

/** 防抖 2 秒；测试里等它过去（留出余量） */
const wait = () => new Promise(resolve => setTimeout(resolve, 2_300));

beforeEach(() => {
  purgedUrls.length = 0;
  purgedRoutes.length = 0;
  deletedCacheKeys.length = 0;
  removedKeys.length = 0;
  storageKeys.length = 0;
});

describe("边缘刷新目标", () => {
  test("评论变更（纯计数）→ 只刷文章所在的那一页，不刷固定页", async () => {
    await invalidateContentCaches({
      routes: ["/", "/category/**", "/tag/**", "/archiving", "/about", "/sitemap"],
      contentCids: [1024],
      countOnly: true,
    });
    await wait();
    const urls = purgedUrls.flat();
    // 位次 21 / 每页 12 → 第 2 页；评论数就在那一页的卡片上
    expect(urls.some(u => u.endsWith("/category/note?page=2"))).toBe(true);
    expect(urls.some(u => u.endsWith("/tag/js?page=2"))).toBe(true);
    // 固定页（首页/关于…）不乱刷，省额度
    expect(urls.some(u => /^https:\/\/imqi1\.com\/$/.test(u))).toBe(false);
    expect(urls.some(u => u.includes("/api/home-data"))).toBe(false);
    expect(purgedRoutes).toEqual([]);
  }, 15_000);

  test("文章变更（内容）→ 提交精确 URL 刷新", async () => {
    await invalidateContentCaches({
      routes: ["/", "/category/**", "/tag/**", "/archiving", "/content/**", "/sitemap", "/about"],
      contentCids: [1024],
    });
    await wait();
    expect(purgedUrls.length).toBe(1);
    const urls = purgedUrls[0]!;
    expect(urls.some(u => u.includes("/content/"))).toBe(true);
    // 列表页也被刷新（内容变更要秒级可见）
    expect(urls.some(u => u.endsWith("/"))).toBe(true);
  }, 15_000);

  test("地图页：短 TTL 档，不展开查询串变体（15 秒内自然收敛）", async () => {
    await invalidateContentCaches({ routes: ["/map"] });
    await wait();
    const urls = purgedUrls.flat();
    expect(urls.some(u => u.endsWith("/map"))).toBe(true);
    expect(urls.some(u => u.includes("/map?view="))).toBe(false);
  }, 15_000);

  test("订阅页：source 变体逐个刷新", async () => {
    await invalidateContentCaches({ routes: ["/subscribes"] });
    await wait();
    const urls = purgedUrls.flat();
    expect(urls.some(u => u.includes("/subscribes?source=1"))).toBe(true);
    expect(urls.some(u => u.includes("/subscribes?source=2"))).toBe(true);
  }, 15_000);

  test("更新日志页：type 变体逐个刷新", async () => {
    await invalidateContentCaches({ routes: ["/changelogs"] });
    await wait();
    const urls = purgedUrls.flat();
    expect(urls.some(u => u.includes("/changelogs?type="))).toBe(true);
  }, 15_000);

  test("点赞：只刷文章页（列表页靠短 TTL 收敛，省额度）", async () => {
    await invalidateContentCaches({
      routes: ["/", "/category/**", "/tag/**", "/archiving", "/about", "/sitemap"],
      edgeRoutes: [],
      edgePaths: ["/content/note/hello"],
    });
    await wait();
    const urls = purgedUrls.flat();
    expect(urls).toEqual(["https://imqi1.com/content/note/hello"]);
  }, 15_000);
});

describe("源站缓存失效粒度", () => {
  test("点赞只清被赞那一篇的源站缓存，不按 /content/** 通配清全站文章页", async () => {
    storageKeys.push(
      "nitro:routes:_:contentnotehello.aaaa.json",
      "nitro:routes:_:contentlifeworld.bbbb.json",
      "nitro:routes:_:index.cccc.json",
    );
    await invalidateContentCaches({
      routes: ["/", "/category/**", "/tag/**", "/archiving", "/about", "/sitemap"],
      sourcePaths: ["/content/note/hello"],
      edgeRoutes: [],
      edgePaths: ["/content/note/hello"],
    });
    await wait();
    // 列表页源站缓存照旧清（角标靠 15 秒短 TTL 收敛），但另一篇文章页不能被牵连
    expect(removedKeys).toContain("nitro:routes:_:index.cccc.json");
    expect(removedKeys).toContain("nitro:routes:_:contentnotehello.aaaa.json");
    expect(removedKeys).not.toContain("nitro:routes:_:contentlifeworld.bbbb.json");
  }, 15_000);

  test("内容变更仍按路由清（含 /content/** 整组），保证旧路径/列表页一起失效", async () => {
    storageKeys.push(
      "nitro:routes:_:contentnotehello.aaaa.json",
      "nitro:routes:_:contentlifeworld.bbbb.json",
    );
    await invalidateContentCaches({
      routes: ["/", "/category/**", "/content/**"],
      contentCids: [1024],
    });
    await wait();
    expect(removedKeys.sort()).toEqual([
      "nitro:routes:_:contentlifeworld.bbbb.json",
      "nitro:routes:_:contentnotehello.aaaa.json",
    ]);
  }, 15_000);

  test("边缘刷了哪条，源站就清了哪条（否则回源 304 → 旧内容复活）", async () => {
    storageKeys.push(
      keyOf("/content/note/hello"),
      keyOf("/category/tech"),
    );
    await invalidateContentCaches({
      scopes: ["article", "card"],
      contentCids: [1024],
      contentPaths: ["/content/note/hello"],
    });
    await wait();
    // 文章页的源站键必须被清（边缘刷了它）
    expect(removedKeys).toContain(keyOf("/content/note/hello"));
    // 无关分类页不该被牵连
    expect(removedKeys).not.toContain(keyOf("/category/tech"));
  }, 15_000);

  test("计数类变更只清「文章所在的那一页」±1，其它分类页的缓存不动", async () => {
    storageKeys.push(
      // 文章所在的那一页（位次 21 / 每页 12 → 第 2 页）及其邻页
      keyOf("/category/note?page=2"),
      // 第 1 页在源站缓存里的形态是**裸路径**（?page=1 被 cache-key.ts 规范化掉了）
      keyOf("/category/note"),
      keyOf("/category/note?page=3"),
      // 标签页所在的那一页
      keyOf("/tag/js?page=2"),
      // 无关的分类页
      keyOf("/category/tech?page=2"),
      keyOf("/category/tech"),
      // 首页（固定页）
      keyOf("/"),
    );
    await invalidateContentCaches({
      routes: ["/", "/category/**", "/tag/**", "/about", "/sitemap"],
      contentCids: [1024],
      countOnly: true,
    });
    await wait();
    // 所在的那一页 ±1（覆盖同秒并列导致的位次差 1）+ 首页
    expect(removedKeys).toContain(keyOf("/category/note?page=2"));
    expect(removedKeys).toContain(keyOf("/category/note"));
    expect(removedKeys).toContain(keyOf("/category/note?page=3"));
    expect(removedKeys).toContain(keyOf("/tag/js?page=2"));
    expect(removedKeys).toContain(keyOf("/"));
    // 别的分类页一个都不该动
    expect(removedKeys).not.toContain(keyOf("/category/tech?page=2"));
    expect(removedKeys).not.toContain(keyOf("/category/tech"));
  }, 15_000);
});

describe("防抖窗口内的变更合并", () => {
  test("评论（纯计数）与文章保存同窗 → 文章页 URL 不能被跳过", async () => {
    await invalidateContentCaches({
      routes: ["/", "/category/**", "/tag/**", "/archiving", "/about", "/sitemap"],
      contentCids: [1024],
      countOnly: true,
    });
    await invalidateContentCaches({
      routes: ["/", "/category/**", "/tag/**", "/archiving", "/content/**", "/sitemap", "/about"],
      contentCids: [1024],
    });
    await wait();
    const urls = purgedUrls.flat();
    // 内容类变更的文章页必须在刷新列表里（countOnly 不能把整窗降级）
    expect(urls.some(u => u.endsWith("/content/note/hello"))).toBe(true);
    expect(urls.some(u => /^https:\/\/imqi1\.com\/$/.test(u))).toBe(true);
  }, 15_000);

  test("整窗只有评论变更 → 固定页仍不刷（省额度）", async () => {
    await invalidateContentCaches({
      routes: ["/", "/category/**", "/tag/**", "/archiving", "/about", "/sitemap"],
      contentCids: [1024],
      countOnly: true,
    });
    await wait();
    const urls = purgedUrls.flat();
    expect(urls.some(u => /^https:\/\/imqi1\.com\/$/.test(u))).toBe(false);
  }, 15_000);
});

describe("访客分布聚合缓存", () => {
  test("评论变更（countOnly）清掉 custom:footprint（读者地图的新鲜度硬上限）", async () => {
    await invalidateContentCaches({
      routes: ["/", "/category/**"],
      contentCids: [1024],
      countOnly: true,
    });
    await wait();
    expect(deletedCacheKeys).toContain("custom:footprint");
  }, 15_000);

  test("内容类变更不碰访客分布缓存", async () => {
    await invalidateContentCaches({
      routes: ["/", "/content/**"],
      contentCids: [1024],
    });
    await wait();
    expect(deletedCacheKeys).not.toContain("custom:footprint");
  }, 15_000);
});
