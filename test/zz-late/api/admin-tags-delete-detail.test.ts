import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie, registerMetasFakes } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const deleteHandler = (await import("#server/api/admin/tags/[id].delete")).default;

// seed: 2 tags + 1 category
const seedWith2Tags = [
  { mid: 1, name: "标签甲", slug: "tag-a", desc: null, type: "tag" },
  { mid: 2, name: "标签乙", slug: "tag-b", desc: null, type: "tag" },
  { mid: 3, name: "分类甲", slug: "cat-a", desc: null, type: "category" },
];

describe("admin/tags/[id].delete 边界补测", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(deleteHandler, {
      method: "DELETE",
      params: { id: "1" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(deleteHandler, {
      method: "DELETE",
      cookie,
      params: { id: "1" },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("id 非正整数 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(deleteHandler, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "abc" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("id 缺省 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(deleteHandler, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("标签不存在 → 404", async () => {
    registerMetasFakes(seedWith2Tags);
    sharedFake.on("metas", "findUnique", async () => null);
    const cookie = await loginSessionCookie();
    await expect(callAdmin(deleteHandler, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "999" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("删除的是 category 不是 tag → 400(类型守卫)", async () => {
    registerMetasFakes(seedWith2Tags);
    sharedFake.on("metas", "findUnique", async () => ({ mid: 3, name: "分类甲", slug: "cat-a", desc: null, type: "category" }));
    const cookie = await loginSessionCookie();
    await expect(callAdmin(deleteHandler, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "3" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toThrow(/只能删除标签类型/);
  });

  test("成功 → 删关系 + 删主表 + 失效缓存", async () => {
    registerMetasFakes(seedWith2Tags);
    sharedFake.on("metas", "findUnique", async () => ({ mid: 1, name: "标签甲", slug: "tag-a", desc: null, type: "tag" }));
    sharedFake.on("metas", "delete", async () => ({}));
    sharedFake.on("contentrelations", "deleteMany", async () => ({ count: 1 }));
    sharedFake.on("$transaction", async (opsOrFn: unknown) => {
      if (Array.isArray(opsOrFn)) {
        return opsOrFn.map(() => ({}));
      }
      return await (opsOrFn as (tx: unknown) => Promise<unknown>)(sharedFake.prisma);
    });
    const cookie = await loginSessionCookie();
    const r = await callAdmin(deleteHandler, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    }) as { success: boolean };
    expect(r.success).toBe(true);
  });
});