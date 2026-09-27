import { describe, expect, test } from "bun:test";

import { callAdmin } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/random-content.get")).default;

describe("random-content.get(随机文章)", () => {
  test("无文章 → success:false data:null", async () => {
    sharedFake.on("contents", "count", async () => 0);
    const r = await callAdmin(handler, { method: "GET", url: "/api/random-content" }) as { success: boolean; data: null };
    expect(r.success).toBe(false);
    expect(r.data).toBeNull();
  });

  test("count>0 但 findMany skip 越界 → success:false data:null", async () => {
    sharedFake.on("contents", "count", async () => 5);
    sharedFake.on("contents", "findMany", async () => []);
    const r = await callAdmin(handler, { method: "GET", url: "/api/random-content" }) as { success: boolean; data: null };
    expect(r.success).toBe(false);
    expect(r.data).toBeNull();
  });

  test("命中一篇文章 → success:true 含 category/covers/travelCount", async () => {
    sharedFake.on("contents", "count", async () => 10);
    sharedFake.on("contents", "findMany", async () => [{
      cid: 1,
      title: "测试文章",
      slug: "test-article",
      desc: "描述",
      covers: '["https://example.com/cover.jpg"]',
      contentrelations: [{
        cid: 1, mid: 2,
        metas: { mid: 2, name: "技术", slug: "tech" },
      }],
      travels: [{ travel_id: 1 }, { travel_id: 2 }],
    }]);
    const r = await callAdmin(handler, { method: "GET", url: "/api/random-content" }) as { success: boolean; data: { cid: number; title: string; category: { slug: string }; travelCount: number } };
    expect(r.success).toBe(true);
    expect(r.data.cid).toBe(1);
    expect(r.data.title).toBe("测试文章");
    expect(r.data.category?.slug).toBe("tech");
    expect(r.data.travelCount).toBe(2);
  });

  test("无分类关联 → category=null,不抛错", async () => {
    sharedFake.on("contents", "count", async () => 1);
    sharedFake.on("contents", "findMany", async () => [{
      cid: 2,
      title: "无分类",
      slug: "no-cat",
      desc: null,
      covers: null,
      contentrelations: [],
      travels: [],
    }]);
    const r = await callAdmin(handler, { method: "GET", url: "/api/random-content" }) as { success: boolean; data: { category: null } };
    expect(r.data.category).toBeNull();
  });
});