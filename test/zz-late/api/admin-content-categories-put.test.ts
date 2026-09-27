import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie, registerMetasFakes } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/admin/content-categories/[id].put")).default;

describe("admin/content-categories/[id].put(设置文章分类)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(handler, {
      method: "PUT",
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, categoryIds: [2] },
      cookie: "csrf_token=" + CSRF_TOKEN,
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie,
      params: { id: "1" },
      body: { categoryIds: [2] },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("id 非正整数 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "abc" },
      body: { csrfToken: CSRF_TOKEN, categoryIds: [2] },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("categoryIds 非数组 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, categoryIds: "1,2" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("文章不存在 → 404", async () => {
    sharedFake.on("contents", "findUnique", async () => null);
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "999" },
      body: { csrfToken: CSRF_TOKEN, categoryIds: [2] },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("误传标签 mid(metas.type=tag) → 400「存在无效的分类」", async () => {
    registerMetasFakes();
    sharedFake.on("contents", "findUnique", async () => ({ cid: 1 }));
    const cookie = await loginSessionCookie();
    // mid=1 是 tag,mid=2 是 category → type=category 过滤后只剩 [2],长度 1 < 期望 2 → 400
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, categoryIds: [1, 2] },
    })).rejects.toMatchObject({ statusCode: 400, message: "存在无效的分类" });
  });

  test("合法分类数组 → 删旧 + 建新关系", async () => {
    registerMetasFakes();
    sharedFake.on("contents", "findUnique", async () => ({ cid: 1 }));
    let deletedWhere: unknown = null;
    let createdData: unknown = null;
    sharedFake.on("contentrelations", "deleteMany", async ({ where }: { where: unknown }) => {
      deletedWhere = where;
      return { count: 1 };
    });
    sharedFake.on("contentrelations", "createMany", async ({ data }: { data: unknown }) => {
      createdData = data;
      return { count: 1 };
    });
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, categoryIds: [2] },
    }) as { success: boolean };
    expect(r.success).toBe(true);
    expect(deletedWhere).toMatchObject({ cid: 1 });
    expect(createdData).toEqual([{ cid: 1, mid: 2 }]);
  });

  test("空数组 → 仅删旧关系,新建 0 条", async () => {
    registerMetasFakes();
    sharedFake.on("contents", "findUnique", async () => ({ cid: 1 }));
    let createdCalled = false;
    sharedFake.on("contentrelations", "createMany", async () => { createdCalled = true; return { count: 0 }; });
    sharedFake.on("contentrelations", "deleteMany", async () => ({ count: 0 }));
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, categoryIds: [] },
    }) as { success: boolean };
    expect(r.success).toBe(true);
    expect(createdCalled).toBe(false);
  });
});