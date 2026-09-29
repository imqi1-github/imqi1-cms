import { beforeEach, describe, expect, test } from "bun:test";

import { callAdmin } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const categoryContentsHandler = (await import("#server/api/mini/category/[slug]/contents.get")).default;

// metas.findUnique(cat by slug) + contentrelations.findMany/count + contents+attachments include
const metaRows: Array<Record<string, unknown>> = [];
metaRows.push({ mid: 1, name: "笔记", slug: "note", type: "category", desc: "d" });

const contentRelationRows: Array<Record<string, unknown>> = [];
contentRelationRows.push({
  cid: 100, mid: 1, content: {
    cid: 100, title: "文A", covers: JSON.stringify([{ url: "/uploads/a.jpg", desc: "cover" }]),
    create_time: new Date(),
    attachments: [],
  },
});

sharedFake.on("metas", "findUnique", async ({ where }: { where: { slug?: string; mid?: number; type?: string } } = { where: {} }) => {
  return metaRows.find(m => {
    if (where.slug !== undefined && m.slug !== where.slug) return false;
    if (where.type !== undefined && m.type !== where.type) return false;
    if (where.mid !== undefined && m.mid !== where.mid) return false;
    return true;
  }) ?? null;
});
sharedFake.on("contentrelations", "count", async () => contentRelationRows.length);
sharedFake.on("contentrelations", "findMany", async () => contentRelationRows.map(r => ({ ...r })));

beforeEach(() => {
  metaRows.length = 0;
  metaRows.push({ mid: 1, name: "笔记", slug: "note", type: "category", desc: "d" });
  contentRelationRows.length = 0;
  contentRelationRows.push({
    cid: 100, mid: 1, content: {
      cid: 100, title: "文A", covers: JSON.stringify([{ url: "/uploads/a.jpg", desc: "cover" }]),
      create_time: new Date(), attachments: [],
    },
  });
});

describe("mini/category/[slug]/contents.get(小程序分类下文章)", () => {
  test("slug 缺省 → 400", async () => {
    await expect(callAdmin(categoryContentsHandler, {
      method: "GET",
      url: "/api/mini/category//contents",
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("分类不存在 → 404", async () => {
    await expect(callAdmin(categoryContentsHandler, {
      method: "GET",
      params: { slug: "no-such" },
      url: "/api/mini/category/no-such/contents",
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("slug 是 tag(非 category)→ 404", async () => {
    metaRows.push({ mid: 2, name: "tag甲", slug: "tag-a", type: "tag", desc: null });
    await expect(callAdmin(categoryContentsHandler, {
      method: "GET",
      params: { slug: "tag-a" },
      url: "/api/mini/category/tag-a/contents",
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("成功 → 返回 category + contents + pagination", async () => {
    const r = await callAdmin(categoryContentsHandler, {
      method: "GET",
      params: { slug: "note" },
      url: "/api/mini/category/note/contents",
    }) as { success: boolean, data: { category: { slug: string }, contents: Array<{ id: number, title: string }>, pagination: { page: number, pageSize: number, total: number } } };
    expect(r.success).toBe(true);
    expect(r.data.category.slug).toBe("note");
    expect(r.data.contents.length).toBeGreaterThan(0);
    expect(r.data.contents[0]!.title).toBe("文A");
    expect(r.data.pagination.total).toBe(1);
  });

  test("page/pageSize 钳制", async () => {
    const r = await callAdmin(categoryContentsHandler, {
      method: "GET",
      params: { slug: "note" },
      url: "/api/mini/category/note/contents?page=1&pageSize=999",
    }) as { success: boolean, data: { pagination: { pageSize: number } } };
    expect(r.data.pagination.pageSize).toBeLessThanOrEqual(50);
  });
});
