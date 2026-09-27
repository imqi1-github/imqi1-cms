import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie, registerMetasFakes } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/admin/content-tags/[id].put")).default;

describe("admin/content-tags/[id].put(设置文章标签)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(handler, {
      method: "PUT",
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, tagIds: [1] },
      cookie: "csrf_token=" + CSRF_TOKEN,
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie,
      params: { id: "1" },
      body: { tagIds: [1] },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("id 非正整数 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "-1" },
      body: { csrfToken: CSRF_TOKEN, tagIds: [1] },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("tagIds 非数组 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, tagIds: 1 },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("文章不存在 → 404", async () => {
    sharedFake.on("contents", "findUnique", async () => null);
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "999" },
      body: { csrfToken: CSRF_TOKEN, tagIds: [1] },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("误传分类 mid → 400「存在无效的标签」", async () => {
    registerMetasFakes();
    sharedFake.on("contents", "findUnique", async () => ({ cid: 1 }));
    const cookie = await loginSessionCookie();
    // mid=2 是 category → type=tag 过滤后只剩 [1],长度 1 < 期望 2 → 400
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, tagIds: [1, 2] },
    })).rejects.toMatchObject({ statusCode: 400, message: "存在无效的标签" });
  });

  test("合法标签数组 → 删旧 + 建新", async () => {
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
      body: { csrfToken: CSRF_TOKEN, tagIds: [1, 3] },
    }) as { success: boolean };
    expect(r.success).toBe(true);
    expect(deletedWhere).toMatchObject({ cid: 1, metas: { type: "tag" } });
    expect(createdData).toEqual([{ cid: 1, mid: 1 }, { cid: 1, mid: 3 }]);
  });
});