import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const linksPost = (await import("#server/api/admin/links.post")).default;
const linksDelete = (await import("#server/api/admin/links/[id].delete")).default;
const linksPatch = (await import("#server/api/admin/links/[id].patch")).default;
const linksToggle = (await import("#server/api/admin/links/[id]/toggle.patch")).default;

describe("admin/links.post 错误路径", () => {
  test("创建时 links.create 抛 P2002(slug 唯一) → 500(未单独映射为 4xx)", async () => {
    sharedFake.on("links", "create", async () => {
      throw Object.assign(new Error("unique"), { code: "P2002" });
    });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(linksPost, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, name: "甲", link: "https://a.com" },
    })).rejects.toMatchObject({ statusCode: 500 });
  });

  test("创建时未知异常 → 500", async () => {
    sharedFake.on("links", "create", async () => { throw new Error("db down"); });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(linksPost, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, name: "甲", link: "https://a.com" },
    })).rejects.toMatchObject({ statusCode: 500 });
  });
});

describe("admin/links/[id].delete 错误路径", () => {
  test("id 不存在 → 404(P2025 → 404)", async () => {
    sharedFake.on("links", "delete", async () => {
      throw Object.assign(new Error("not found"), { code: "P2025" });
    });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(linksDelete, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "999" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("admin/links/[id].patch 错误路径", () => {
  test("id 不存在 → 404", async () => {
    sharedFake.on("links", "findUnique", async () => null);
    const cookie = await loginSessionCookie();
    await expect(callAdmin(linksPatch, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "999" },
      body: { csrfToken: CSRF_TOKEN, name: "改名" },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("update P2002 → 500(未单独映射)", async () => {
    sharedFake.on("links", "findUnique", async () => ({ id: 1, name: "x", link: "https://x.com", enabled: true }));
    sharedFake.on("links", "update", async () => {
      throw Object.assign(new Error("unique"), { code: "P2002" });
    });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(linksPatch, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, link: "https://duplicate.com" },
    })).rejects.toMatchObject({ statusCode: 500 });
  });
});

describe("admin/links/[id]/toggle.patch 错误路径", () => {
  test("id 不存在 → 404", async () => {
    sharedFake.on("links", "findUnique", async () => null);
    const cookie = await loginSessionCookie();
    await expect(callAdmin(linksToggle, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "999" },
      body: { csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("并发切换竞态(updateMany count=0 + 行仍存在) → 409", async () => {
    sharedFake.on("links", "findUnique", async () => ({ id: 1, enabled: true }));
    sharedFake.on("links", "updateMany", async () => ({ count: 0 }));
    const cookie = await loginSessionCookie();
    await expect(callAdmin(linksToggle, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 409 });
  });

  test("并发切换竞态且行已被删 → 404", async () => {
    sharedFake.on("links", "findUnique", async ({ where }: { where: { id: number } }) =>
      where.id === 1 ? { id: 1, enabled: true } : null); // 第一次返回,第二次仍要被 delete 时返回 null
    let calls = 0;
    sharedFake.on("links", "updateMany", async () => ({ count: 0 }));
    sharedFake.on("links", "findUnique", async () => {
      calls++;
      if (calls >= 2) return null;
      return { id: 1, enabled: true };
    });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(linksToggle, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 404 });
  });
});