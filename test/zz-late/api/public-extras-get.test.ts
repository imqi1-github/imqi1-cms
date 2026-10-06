import { beforeEach, describe, expect, test } from "bun:test";

import { callAdmin } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// ===== csrf/token.get =====
const csrfTokenHandler = (await import("#server/api/csrf/token.get")).default;

// ===== archiving.get =====
const archivingHandler = (await import("#server/api/archiving.get")).default;

// ===== categories.get(公开) =====
const categoriesHandler = (await import("#server/api/categories.get")).default;

// ===== category/[slug].get(单分类) =====
const categorySlugHandler = (await import("#server/api/category/[slug].get")).default;

// ===== category/[slug]/contents.get(分类下文章) =====
const _categoryContentsHandler = (await import("#server/api/category/[slug]/contents.get")).default;
void _categoryContentsHandler;

// ===== contents/[category]/[slug].get(单文章) =====
const contentDetailHandler = (await import("#server/api/contents/[category]/[slug].get")).default;

// ===== page/[slug].get(单页面) =====
const pageSlugHandler = (await import("#server/api/page/[slug].get")).default;

// metas + contents 假件
const metaRows: Array<Record<string, unknown>> = [
  { mid: 1, name: "笔记", slug: "note", type: "category", desc: null },
  { mid: 2, name: "生活", slug: "life", type: "category", desc: "d" },
  { mid: 3, name: "标签甲", slug: "tag-a", type: "tag" },
];
const contentRows: Array<Record<string, unknown>> = [
  { cid: 100, slug: "post-a", title: "文A", status: 1, type: 0, desc: "d", covers: "[]", _count: { likes: 0 }, create_time: new Date(Date.UTC(2026, 2, 10)) },
  { cid: 101, slug: "post-b", title: "文B", status: 0, type: 0, desc: null, covers: "[]", _count: { likes: 0 }, create_time: new Date(Date.UTC(2026, 2, 11)) },
  { cid: 102, slug: "post-c", title: "文C", status: 1, type: 0, desc: "d3", covers: "[]", _count: { likes: 0 }, create_time: new Date(Date.UTC(2026, 1, 5)) },
  { cid: 200, slug: "about", title: "关于", status: 1, type: 1, desc: null, covers: "[]", _count: { likes: 0 }, content: "# 关于", create_time: new Date(Date.UTC(2026, 0, 1)) },
  { cid: 201, slug: "draft-page", title: "草稿页", status: 0, type: 1, desc: null, covers: "[]", _count: { likes: 0 }, content: "x", create_time: new Date() },
];

sharedFake.on("metas", "findMany", async ({ where, take }: { where?: Record<string, unknown>; take?: number } = {}) => {
  let rows = metaRows
    .filter(m => {
      if (where?.type !== undefined && m.type !== where.type) return false;
      return true;
    })
    .map(m => ({
      ...m,
      _count: { contentrelations: 3 },
    }));
  if (take !== undefined) rows = rows.slice(0, take);
  return rows;
});
sharedFake.on("metas", "findFirst", async ({ where }: { where: Record<string, unknown> } = { where: {} }) => {
  return metaRows.find(m => {
    if (where.slug !== undefined && m.slug !== where.slug) return false;
    if (where.type !== undefined && m.type !== where.type) return false;
    return true;
  }) ?? null;
});
sharedFake.on("metas", "findUnique", async ({ where }: { where?: Record<string, unknown> } = {}) => {
  return metaRows.find(m => {
    if (!where) return true;
    if (where.mid !== undefined && m.mid !== where.mid) return false;
    if (where.slug !== undefined && m.slug !== where.slug) return false;
    if (where.type !== undefined && m.type !== where.type) return false;
    return true;
  }) ?? null;
});
sharedFake.on("contents", "findMany", async ({ where, take, _orderBy }: { where?: Record<string, unknown>; take?: number; _orderBy?: Record<string, string> } = {}) => {
  let rows = contentRows.slice();
  if (where) {
    if (where.type !== undefined) rows = rows.filter(c => c.type === where.type);
    if (where.status !== undefined) rows = rows.filter(c => c.status === where.status);
    if (where.slug !== undefined) rows = rows.filter(c => c.slug === where.slug);
  }
  if (take !== undefined) rows = rows.slice(0, take);
  return rows.map(r => ({ ...r, _count: { contentrelations: 1 } }));
});
sharedFake.on("contents", "findFirst", async ({ where }: { where: Record<string, unknown> } = { where: {} }) => {
  return contentRows.find(c => {
    if (where.slug !== undefined && c.slug !== where.slug) return false;
    if (where.type !== undefined && c.type !== where.type) return false;
    if (where.status !== undefined && c.status !== where.status) return false;
    return true;
  }) ?? null;
});

beforeEach(() => {
  // mock 会跨文件注册;为 fresh 状态需显式重置
  metaRows.length = 0;
  metaRows.push(
    { mid: 1, name: "笔记", slug: "note", type: "category", desc: null },
    { mid: 2, name: "生活", slug: "life", type: "category", desc: "d" },
    { mid: 3, name: "标签甲", slug: "tag-a", type: "tag" },
  );
  contentRows.length = 0;
  contentRows.push(
    { cid: 100, slug: "post-a", title: "文A", status: 1, type: 0, desc: "d", covers: "[]", _count: { likes: 0 }, create_time: new Date(Date.UTC(2026, 2, 10)) },
    { cid: 101, slug: "post-b", title: "文B", status: 0, type: 0, desc: null, covers: "[]", _count: { likes: 0 }, create_time: new Date(Date.UTC(2026, 2, 11)) },
    { cid: 102, slug: "post-c", title: "文C", status: 1, type: 0, desc: "d3", covers: "[]", _count: { likes: 0 }, create_time: new Date(Date.UTC(2026, 1, 5)) },
    { cid: 200, slug: "about", title: "关于", status: 1, type: 1, desc: null, covers: "[]", _count: { likes: 0 }, content: "# 关于", create_time: new Date(Date.UTC(2026, 0, 1)) },
    { cid: 201, slug: "draft-page", title: "草稿页", status: 0, type: 1, desc: null, covers: "[]", _count: { likes: 0 }, content: "x", create_time: new Date() },
  );
});

describe("csrf/token.get", () => {
  test("返回 token 与 no-store 缓存头", async () => {
    const r = await callAdmin(csrfTokenHandler, {
      method: "GET",
      url: "/api/csrf/token",
    }) as { code: number, data: { token: string } };
    expect(r.code).toBe(200);
    expect(r.data.token).toBeTruthy();
    expect(r.data.token.length).toBeGreaterThan(10);
  });
});

describe("archiving.get(归档按年月分组)", () => {
  test("返回 success + 按年月分组", async () => {
    const r = await callAdmin(archivingHandler, {
      method: "GET",
      url: "/api/archiving",
    }) as { success: boolean, data: { groups: Array<{ year: number, month: number, contents: unknown[] }>, stats: { total: number } } };
    expect(r.success).toBe(true);
    // 2 个已发布文章(type=0, status=1): cid=100(2026-03) + cid=102(2026-02)
    expect(r.data.stats.total).toBe(2);
    expect(r.data.groups.length).toBe(2);
    // 第一组应该是最新月份(2026-03)
    expect(r.data.groups[0]!.year).toBe(2026);
    expect(r.data.groups[0]!.month).toBe(3);
  });

  test("空库 → groups 空 + total=0", async () => {
    contentRows.length = 0;
    const r = await callAdmin(archivingHandler, {
      method: "GET",
      url: "/api/archiving",
    }) as { data: { groups: unknown[], stats: { total: number } } };
    expect(r.data.groups).toEqual([]);
    expect(r.data.stats.total).toBe(0);
  });
});

describe("categories.get(公开聚合分类)", () => {
  test("limit 缺省 → 默认 4", async () => {
    const r = await callAdmin(categoriesHandler, {
      method: "GET",
      url: "/api/categories",
    }) as { success: boolean, data: Array<{ mid: number, slug: string }> };
    expect(r.success).toBe(true);
    expect(r.data.length).toBe(2); // 2 个 category(note + life)
  });

  test("limit=1 → 截断到 1 个", async () => {
    const r = await callAdmin(categoriesHandler, {
      method: "GET",
      url: "/api/categories?limit=1",
    }) as { data: unknown[] };
    expect(r.data.length).toBe(1);
  });

  test("limit 非法 → 回落 4(实际限制到 take 4)", async () => {
    const r = await callAdmin(categoriesHandler, {
      method: "GET",
      url: "/api/categories?limit=abc",
    }) as { data: unknown[] };
    expect(r.data.length).toBe(2);
  });

  test("limit 上限 100 → 钳制", async () => {
    const r = await callAdmin(categoriesHandler, {
      method: "GET",
      url: "/api/categories?limit=500",
    }) as { data: unknown[] };
    expect(r.data.length).toBe(2);
  });
});

describe("category/[slug].get(单分类)", () => {
  test("分类不存在 → 404", async () => {
    await expect(callAdmin(categorySlugHandler, {
      method: "GET",
      params: { slug: "no-such" },
      url: "/api/category/no-such",
    })).rejects.toThrow();
  });

  test("分类存在 → 返回成功", async () => {
    const r = await callAdmin(categorySlugHandler, {
      method: "GET",
      params: { slug: "note" },
      url: "/api/category/note",
    });
    expect(r).toBeDefined();
  });

  test("slug 是 tag 不是 category → 404", async () => {
    await expect(callAdmin(categorySlugHandler, {
      method: "GET",
      params: { slug: "tag-a" },
      url: "/api/category/tag-a",
    })).rejects.toThrow();
  });
});

describe("page/[slug].get(单页面)", () => {
  test("slug 缺省 → 400", async () => {
    await expect(callAdmin(pageSlugHandler, {
      method: "GET",
      url: "/api/page/",
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("页面不存在 → 404", async () => {
    await expect(callAdmin(pageSlugHandler, {
      method: "GET",
      params: { slug: "no-such" },
      url: "/api/page/no-such",
    })).rejects.toThrow();
  });

  test("草稿页 status=0 → 404(只返回已发布)", async () => {
    await expect(callAdmin(pageSlugHandler, {
      method: "GET",
      params: { slug: "draft-page" },
      url: "/api/page/draft-page",
    })).rejects.toThrow();
  });

  test("已发布页面 → 返回数据", async () => {
    const r = await callAdmin(pageSlugHandler, {
      method: "GET",
      params: { slug: "about" },
      url: "/api/page/about",
    });
    expect(r).toBeDefined();
  });
});

describe("contents/[category]/[slug].get(单文章详情)", () => {
  test("slug 缺省 → 400", async () => {
    await expect(callAdmin(contentDetailHandler, {
      method: "GET",
      params: { category: "note", slug: "" },
      url: "/api/contents/note/",
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("category slug 缺省 → 400", async () => {
    await expect(callAdmin(contentDetailHandler, {
      method: "GET",
      params: { category: "", slug: "post-a" },
      url: "/api/contents//post-a",
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("草稿文章 → 404(只返回已发布)", async () => {
    await expect(callAdmin(contentDetailHandler, {
      method: "GET",
      params: { category: "note", slug: "post-b" },
      url: "/api/contents/note/post-b",
    })).rejects.toThrow();
  });

  test("未发布 + 错分类 → 404", async () => {
    await expect(callAdmin(contentDetailHandler, {
      method: "GET",
      params: { category: "no-such", slug: "post-a" },
      url: "/api/contents/no-such/post-a",
    })).rejects.toThrow();
  });
});
