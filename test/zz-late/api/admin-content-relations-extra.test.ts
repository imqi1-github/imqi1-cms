import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie, registerMetasFakes } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const catsPut = (await import("#server/api/admin/content-categories/[id].put")).default;
const tagsPut = (await import("#server/api/admin/content-tags/[id].put")).default;

describe("admin/content-categories/[id].put P2003 → 400", () => {
  test("createMany 撞外键 → 400(预检通过但并发删除导致)", async () => {
    registerMetasFakes();
    sharedFake.on("contents", "findUnique", async () => ({ cid: 1 }));
    sharedFake.on("metas", "findMany", async () => [{ mid: 2 }]); // 预检通过
    sharedFake.on("contentrelations", "deleteMany", async () => ({ count: 0 }));
    sharedFake.on("contentrelations", "createMany", async () => {
      throw Object.assign(new Error("FK"), { code: "P2003" });
    });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(catsPut, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, categoryIds: [2] },
    })).rejects.toMatchObject({ statusCode: 400, message: "存在无效的分类" });
  });
});

describe("admin/content-tags/[id].put P2003 → 400", () => {
  test("createMany 撞外键 → 400", async () => {
    registerMetasFakes();
    sharedFake.on("contents", "findUnique", async () => ({ cid: 1 }));
    sharedFake.on("metas", "findMany", async () => [{ mid: 1 }]); // 预检通过
    sharedFake.on("contentrelations", "deleteMany", async () => ({ count: 0 }));
    sharedFake.on("contentrelations", "createMany", async () => {
      throw Object.assign(new Error("FK"), { code: "P2003" });
    });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(tagsPut, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, tagIds: [1] },
    })).rejects.toMatchObject({ statusCode: 400, message: "存在无效的标签" });
  });
});

describe("admin/content-tags/[id].put 未知异常 → 500", () => {
  test("createMany 抛非 P2003 → 500", async () => {
    registerMetasFakes();
    sharedFake.on("contents", "findUnique", async () => ({ cid: 1 }));
    sharedFake.on("metas", "findMany", async () => [{ mid: 1 }]);
    sharedFake.on("contentrelations", "deleteMany", async () => ({ count: 0 }));
    sharedFake.on("contentrelations", "createMany", async () => { throw new Error("db boom"); });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(tagsPut, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, tagIds: [1] },
    })).rejects.toMatchObject({ statusCode: 500 });
  });
});