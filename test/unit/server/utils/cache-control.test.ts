// 边缘缓存头的计算：304 走不到 beforeResponse，必须按路径给出该路径真正的 TTL，
// 否则会把边缘 TTL 顶回源站的长 TTL。
import { describe, expect, test } from "bun:test";

import { siteConfig } from "~~/site.config";
import { apiCacheControl, cacheControlFor304, pageCacheControl } from "#server/utils/cache-control";

describe("边缘缓存头", () => {
  test("页面：列表页短 TTL、搜索页中档、内容页长 TTL", () => {
    expect(pageCacheControl("/")).toContain(`s-maxage=${siteConfig.build.listPageCacheSeconds}`);
    expect(pageCacheControl("/category/note")).toContain(`s-maxage=${siteConfig.build.listPageCacheSeconds}`);
    expect(pageCacheControl("/content/note/1024")).toContain(`s-maxage=${siteConfig.build.edgeCacheSeconds}`);
    // /map 内嵌访客分布等易变聚合 → 与列表页同档（短 TTL）
    expect(pageCacheControl("/map")).toContain(`s-maxage=${siteConfig.build.listPageCacheSeconds}`);
    // 搜索页：结果随 q 变化且无法按 q 枚举失效 → 单独一档，比内容页短得多
    expect(pageCacheControl("/search")).toContain(`s-maxage=${siteConfig.build.searchCacheSeconds}`);
  });

  test("页面：浏览器不缓存（max-age=0），只让边缘缓存", () => {
    expect(pageCacheControl("/")).toContain("max-age=0");
    expect(pageCacheControl("/content/note/1024")).toContain("max-age=0");
    expect(pageCacheControl("/search")).toContain("max-age=0");
  });

  test("304：按路径给 TTL（列表页短、内容页长）", () => {
    expect(cacheControlFor304("/")).toContain(`s-maxage=${siteConfig.build.listPageCacheSeconds}`);
    expect(cacheControlFor304("/content/note/1024")).toContain(`s-maxage=${siteConfig.build.edgeCacheSeconds}`);
    expect(cacheControlFor304("/search")).toContain(`s-maxage=${siteConfig.build.searchCacheSeconds}`);
    expect(cacheControlFor304("/api/home-data")).toBe(apiCacheControl());
  });

  test("304：不在缓存范围内的路径不干预（返回 null）", () => {
    expect(cacheControlFor304("/admin/contents")).toBeNull();
    expect(cacheControlFor304("/login")).toBeNull();
  });
});
