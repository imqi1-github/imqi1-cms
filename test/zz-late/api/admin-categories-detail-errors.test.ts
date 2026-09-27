import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie, registerMetasFakes } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const createHandler = (await import("#server/api/admin/categories/create.post")).default;
const putHandler = (await import("#server/api/admin/categories/[id].put")).default;

describe("admin/categories/create.post 错误路径", () => {
  test("重名 → 400", async () => {
    registerMetasFakes();
    const cookie = await loginSessionCookie();
    await expect(callAdmin(createHandler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, name: "分类甲", slug: "cat-a" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("slug 已被 tag 占用 → 400(metas 全表唯一)", async () => {
    registerMetasFakes();
    const cookie = await loginSessionCookie();
    await expect(callAdmin(createHandler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, name: "新分类", slug: "tag-a" }, // tag-a 是标签
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("admin/categories/[id].put 错误路径", () => {
  test("id 不存在 → 404", async () => {
    registerMetasFakes();
    sharedFake.on("metas", "findUnique", async () => null);
    const cookie = await loginSessionCookie();
    await expect(callAdmin(putHandler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "999" },
      body: { csrfToken: CSRF_TOKEN, name: "改名", slug: "new-slug" },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("并发抢注(update 阶段 P2002)→ 400", async () => {
    // 预检都通过(无重名),但 update 阶段被并发抢注触发唯一约束
    let findFirstCalls = 0;
    sharedFake.on("metas", "findFirst", async () => {
      findFirstCalls++;
      if (findFirstCalls === 1) return { mid: 2, name: "分类甲", slug: "cat-a", desc: null, type: "category" };
      return null; // 预检 existingByName 返回 null(无重名)
    });
    sharedFake.on("metas", "update", async () => { throw Object.assign(new Error("unique"), { code: "P2002" }); });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(putHandler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "2" },
      body: { csrfToken: CSRF_TOKEN, name: "新名", slug: "new-slug" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});