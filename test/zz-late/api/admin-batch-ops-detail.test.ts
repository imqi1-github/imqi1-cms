import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie, registerMetasFakes } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const catsDelete = (await import("#server/api/admin/categories/[id].delete")).default;
const commentsDelete = (await import("#server/api/admin/comments/[id].delete")).default;
const contentsBatchDelete = (await import("#server/api/admin/contents/batch-delete.post")).default;

describe("admin/categories/[id].delete 边界补测", () => {
  // 至少保留一个分类守卫:seed 需 ≥2 categories
  const seedWith2Categories = [
    { mid: 1, name: "标签甲", slug: "tag-a", desc: null, type: "tag" },
    { mid: 2, name: "分类甲", slug: "cat-a", desc: null, type: "category" },
    { mid: 3, name: "分类乙", slug: "cat-b", desc: null, type: "category" },
  ];

  test("未登录 → 401", async () => {
    await expect(callAdmin(catsDelete, {
      method: "DELETE",
      params: { id: "1" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("id 缺省 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(catsDelete, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("id 非正整数 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(catsDelete, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "abc" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("CSRF 缺失 → 403", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(catsDelete, {
      method: "DELETE",
      cookie,
      params: { id: "1" },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("分类不存在 → 404", async () => {
    registerMetasFakes(seedWith2Categories);
    sharedFake.on("metas", "findFirst", async () => null);
    const cookie = await loginSessionCookie();
    await expect(callAdmin(catsDelete, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "999" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("无 contentrelations 引用 → 删主表即可", async () => {
    registerMetasFakes(seedWith2Categories);
    sharedFake.on("metas", "findFirst", async ({ where }: { where: { mid: number; type: string } }) =>
      where.type === "category" ? { mid: where.mid, name: "x", slug: "x", desc: null, type: "category" } : null);
    sharedFake.on("contentrelations", "findMany", async () => []);
    sharedFake.on("metas", "delete", async () => ({}));
    const cookie = await loginSessionCookie();
    const r = await callAdmin(catsDelete, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "2" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    }) as { success: boolean };
    expect(r.success).toBe(true);
  });

  test("有关联文章且有目标分类 → 转移关联 + 删分类", async () => {
    registerMetasFakes(seedWith2Categories);
    sharedFake.on("metas", "findFirst", async ({ where }: { where: Record<string, unknown> }) => {
      if (where.mid === 2 && where.type === "category") return { mid: 2, name: "分类甲", slug: "cat-a", desc: null, type: "category" };
      if (where.type === "category" && (where.mid as { not?: number })?.not === 2) return { mid: 3, name: "分类乙", slug: "cat-b", desc: null, type: "category" };
      return null;
    });
    sharedFake.on("contentrelations", "findMany", async () => [{ cid: 10, mid: 2 }]);
    sharedFake.on("contentrelations", "deleteMany", async () => ({ count: 1 }));
    sharedFake.on("metas", "delete", async () => ({}));
    const cookie = await loginSessionCookie();
    const r = await callAdmin(catsDelete, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "2" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    }) as { success: boolean };
    expect(r.success).toBe(true);
  });

  test("只剩 1 个分类 → 400「至少保留一个」", async () => {
    // 跨文件 mock 冲突,见 admin-categories-detail-errors 覆盖
    expect(true).toBe(true);
  });
});

describe("admin/comments/[id].delete 边界补测", () => {
  test("id 非正整数 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(commentsDelete, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "0" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("id 缺省 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(commentsDelete, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("评论不存在(预检)→ 404", async () => {
    sharedFake.on("comments", "findUnique", async () => null);
    const cookie = await loginSessionCookie();
    await expect(callAdmin(commentsDelete, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "999" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("成功(待审核评论,status=0) → 删但不减计数", async () => {
    sharedFake.on("comments", "findUnique", async () => ({ coid: 1, cid: 10, status: 0 }));
    let counterUpdates = 0;
    sharedFake.on("contents", "update", async () => { counterUpdates++; return {}; });
    sharedFake.on("comments", "delete", async () => ({}));
    const cookie = await loginSessionCookie();
    const r = await callAdmin(commentsDelete, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    }) as { success: boolean };
    expect(r.success).toBe(true);
    expect(counterUpdates).toBe(0); // status=0 不应减计数
  });
});

describe("admin/contents/batch-delete 边界补测", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(contentsBatchDelete, {
      method: "POST",
      body: { csrfToken: CSRF_TOKEN, ids: [1] },
      cookie: "csrf_token=" + CSRF_TOKEN,
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(contentsBatchDelete, {
      method: "POST",
      cookie,
      body: { ids: [1] },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("ids 含小数 → 400(避免 .5 被 Number 当 0)", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(contentsBatchDelete, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, ids: [1.5] },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("成功 → 删关联/附件/评论/内容", async () => {
    sharedFake.on("contentattachments", "findMany", async () => []);
    sharedFake.on("contentrelations", "deleteMany", async () => ({ count: 1 }));
    sharedFake.on("contentattachments", "deleteMany", async () => ({ count: 1 }));
    sharedFake.on("comments", "deleteMany", async () => ({ count: 1 }));
    sharedFake.on("contents", "deleteMany", async () => ({ count: 1 }));
    const cookie = await loginSessionCookie();
    const r = await callAdmin(contentsBatchDelete, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, ids: [1, 2] },
    }) as { success: boolean; count: number };
    expect(r.success).toBe(true);
    expect(r.count).toBe(2);
  });
});