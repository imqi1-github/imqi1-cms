import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie, registerMetasFakes } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const tagsPost = (await import("#server/api/admin/tags.post")).default;
const tagsPut = (await import("#server/api/admin/tags/[id].put")).default;
const tagsDelete = (await import("#server/api/admin/tags/[id].delete")).default;

describe("admin/tags.post 错误路径", () => {
  test("重名 → P2002 → 400", async () => {
    registerMetasFakes();
    const cookie = await loginSessionCookie();
    await expect(callAdmin(tagsPost, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, name: "标签甲", slug: "tag-a" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("slug 含 type=category 已被用 → P2002 → 400", async () => {
    registerMetasFakes();
    const cookie = await loginSessionCookie();
    await expect(callAdmin(tagsPost, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, name: "新标签", slug: "cat-a" }, // cat-a 是分类
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("admin/tags/[id].put 错误路径", () => {
  test("id 不存在 → 404", async () => {
    registerMetasFakes();
    sharedFake.on("metas", "findUnique", async () => null);
    const cookie = await loginSessionCookie();
    await expect(callAdmin(tagsPut, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "999" },
      body: { csrfToken: CSRF_TOKEN, name: "改名", slug: "new-slug" },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("改成与另一个 tag 重名 → P2002 → 400", async () => {
    registerMetasFakes();
    sharedFake.on("metas", "findUnique", async () => ({ mid: 1, name: "标签甲", slug: "tag-a", desc: null, type: "tag" }));
    sharedFake.on("metas", "updateMany", async () => { throw Object.assign(new Error("unique"), { code: "P2002" }); });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(tagsPut, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, name: "标签乙", slug: "tag-b" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("admin/tags/[id].delete 错误路径", () => {
  test("标签不存在 → 404", async () => {
    registerMetasFakes();
    sharedFake.on("metas", "findUnique", async () => null);
    const cookie = await loginSessionCookie();
    await expect(callAdmin(tagsDelete, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "999" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("id 非正整数 → 400", async () => {
    registerMetasFakes();
    const cookie = await loginSessionCookie();
    await expect(callAdmin(tagsDelete, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "abc" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("删除的是 type=category 不是 tag → 400", async () => {
    registerMetasFakes();
    sharedFake.on("metas", "findUnique", async () => ({ mid: 2, name: "分类甲", slug: "cat-a", desc: null, type: "category" }));
    const cookie = await loginSessionCookie();
    await expect(callAdmin(tagsDelete, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "2" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});