// 边缘刷新目标解析：列表/统计页（短 TTL）不刷边缘，内容页才刷；
// 查询串变体是独立边缘条目，必须逐个刷。
// 关键约束：200 条评论/天若每次都刷列表页那 6 个固定 URL，光这一项就超额度。
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

const purgedUrls: string[][] = [];
const purgedRoutes: string[][] = [];

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

const g = globalThis as unknown as { useStorage?: unknown };
g.useStorage = () => ({
  getKeys: async () => [],
  removeItem: async () => undefined,
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

/** 防抖 5 秒；测试里等它过去（留出余量但不超 bun 默认 5s 超时） */
const wait = () => new Promise(resolve => setTimeout(resolve, 5_300));

beforeEach(() => {
  purgedUrls.length = 0;
  purgedRoutes.length = 0;
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
      routes: ["/", "/category/**", "/tag/**", "/archiving", "/about", "/sitemap", "/content/**"],
      edgeRoutes: [],
      edgePaths: ["/content/note/hello"],
    });
    await wait();
    const urls = purgedUrls.flat();
    expect(urls).toEqual(["https://imqi1.com/content/note/hello"]);
  }, 15_000);
});
