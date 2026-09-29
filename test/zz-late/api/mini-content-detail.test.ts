import { beforeEach, describe, expect, test } from "bun:test";

import { callAdmin } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const contentDetailHandler = (await import("#server/api/mini/content/[id].get")).default;

// contents.findFirst with select + contentrelations include
const contentRows: Array<Record<string, unknown>> = [];
contentRows.push({
  cid: 1, title: "文A", desc: "d", content: "# 正文", type: 0, status: 1,
  cover: JSON.stringify([{ url: "/uploads/a.jpg", desc: "cover1" }]),
  create_time: new Date(),
  contentrelations: [],
});
contentRows.push({
  cid: 2, title: "文B(草稿)", desc: null, content: "x", type: 0, status: 0,
  cover: "[]", create_time: new Date(), contentrelations: [],
});

sharedFake.on("contents", "findFirst", async ({ where }: { where?: Record<string, unknown> } = {}) => {
  return contentRows.find(c => {
    if (where?.cid !== undefined && c.cid !== where.cid) return false;
    if (where?.type !== undefined && c.type !== where.type) return false;
    if (where?.status !== undefined && c.status !== where.status) return false;
    return true;
  }) ?? null;
});

beforeEach(() => {
  contentRows.length = 0;
  contentRows.push({
    cid: 1, title: "文A", desc: "d", content: "# 正文", type: 0, status: 1,
    cover: JSON.stringify([{ url: "/uploads/a.jpg", desc: "cover1" }]),
    create_time: new Date(), contentrelations: [],
  });
  contentRows.push({
    cid: 2, title: "文B(草稿)", desc: null, content: "x", type: 0, status: 0,
    cover: "[]", create_time: new Date(), contentrelations: [],
  });
});

describe("mini/content/[id].get(小程序文章详情)", () => {
  test("id 缺省 → 400", async () => {
    await expect(callAdmin(contentDetailHandler, {
      method: "GET",
      url: "/api/mini/content/",
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("非法 id → 400", async () => {
    await expect(callAdmin(contentDetailHandler, {
      method: "GET",
      params: { id: "abc" },
      url: "/api/mini/content/abc",
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("id 不存在 → 404", async () => {
    await expect(callAdmin(contentDetailHandler, {
      method: "GET",
      params: { id: "999" },
      url: "/api/mini/content/999",
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("草稿 → 404(只返回已发布)", async () => {
    await expect(callAdmin(contentDetailHandler, {
      method: "GET",
      params: { id: "2" },
      url: "/api/mini/content/2",
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("成功 → 返回 {id, title, description, content, cover, covers, categories}", async () => {
    const r = await callAdmin(contentDetailHandler, {
      method: "GET",
      params: { id: "1" },
      url: "/api/mini/content/1",
    }) as { success: boolean, data: { id: number, title: string, description: string, content: string, cover: string, categories: unknown[] } };
    expect(r.success).toBe(true);
    expect(r.data.id).toBe(1);
    expect(r.data.title).toBe("文A");
    expect(r.data.description).toBe("d");
    expect(r.data.content).toBe("# 正文");
    expect(typeof r.data.cover).toBe("string");
    expect(Array.isArray(r.data.categories)).toBe(true);
  });
});
