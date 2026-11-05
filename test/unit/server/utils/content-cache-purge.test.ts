// 边缘刷新目标解析：列表/统计页（短 TTL）不刷边缘，内容页才刷。
// 关键约束：200 条评论/天若每次都刷列表页那 6 个固定 URL，光这一项就超额度。
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

const purgedUrls: string[][] = [];
const purgedRoutes: string[][] = [];

mock.module("#server/utils/cdn", () => ({
  isAutoPurgeEnabled: () => true,
  isCdnEnabled: () => true,
  isCdnQuotaExhausted: () => false,
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
      findMany: async () => [
        {
          cid: 1024,
          slug: "hello",
          type: 0,
          contentrelations: [
            { metas: { slug: "note", type: "category" } },
            { metas: { slug: "js", type: "tag" } },
          ],
        },
      ],
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
  test("评论变更（纯计数）→ 不提交任何边缘刷新，0 额度", async () => {
    await invalidateContentCaches({
      routes: ["/", "/category/**", "/tag/**", "/archiving", "/about", "/sitemap"],
      contentCids: [1024],
    });
    await wait();
    expect(purgedUrls).toEqual([]);
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
});
