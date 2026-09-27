import { describe, expect, test } from "bun:test";

import { callAdmin } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/sitemap.get")).default;

describe("sitemap.get(站点地图导航)", () => {
  test("无页面无分类 → 返回空 pages/categories", async () => {
    sharedFake.on("contents", "findMany", async () => []);
    sharedFake.on("metas", "findMany", async () => []);
    sharedFake.on("contentrelations", "findMany", async () => []);
    const r = await callAdmin(handler, { method: "GET", url: "/api/sitemap" }) as { data: { pages: unknown[]; categories: Array<{ contents: unknown[] }> } };
    expect(r.data.pages).toEqual([]);
    expect(r.data.categories).toEqual([]);
  });

  test("页面 + 分类 + 每个分类最多 5 篇", async () => {
    sharedFake.on("contents", "findMany", async () => [
      { cid: 10, title: "关于", slug: "about" },
      { cid: 11, title: "友链", slug: "links" },
    ]);
    sharedFake.on("metas", "findMany", async () => [
      { mid: 1, name: "技术", slug: "tech" },
      { mid: 2, name: "生活", slug: "life" },
    ]);
    sharedFake.on("contentrelations", "findMany", async () => [
      { mid: 1, content: { cid: 100, title: "a1", slug: "a1", create_time: new Date() } },
      { mid: 1, content: { cid: 101, title: "a2", slug: "a2", create_time: new Date() } },
      { mid: 2, content: { cid: 200, title: "b1", slug: "b1", create_time: new Date() } },
    ]);
    const r = await callAdmin(handler, { method: "GET", url: "/api/sitemap" }) as { data: { pages: Array<{ slug: string }>; categories: Array<{ name: string; slug: string; contents: Array<{ slug: string }> }> } };
    expect(r.data.pages).toHaveLength(2);
    expect(r.data.pages[0]!.slug).toBe("about");
    expect(r.data.categories).toHaveLength(2);
    const tech = r.data.categories.find(c => c.slug === "tech")!;
    expect(tech.contents).toHaveLength(2);
    const life = r.data.categories.find(c => c.slug === "life")!;
    expect(life.contents).toHaveLength(1);
  });

  test("单分类超过 5 篇 → 截断到 5", async () => {
    sharedFake.on("contents", "findMany", async () => []);
    sharedFake.on("metas", "findMany", async () => [{ mid: 1, name: "技", slug: "tech" }]);
    const relations = Array.from({ length: 8 }, (_, i) => ({
      mid: 1,
      content: { cid: 100 + i, title: `a${i}`, slug: `a${i}`, create_time: new Date() },
    }));
    sharedFake.on("contentrelations", "findMany", async () => relations);
    const r = await callAdmin(handler, { method: "GET", url: "/api/sitemap" }) as { data: { categories: Array<{ contents: unknown[] }> } };
    expect(r.data.categories[0]!.contents).toHaveLength(5);
  });
});