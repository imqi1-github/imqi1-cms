import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/admin/contents/[cid].put")).default;

describe("admin/contents/[cid].put 边界补测", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(handler, {
      method: "PUT",
      params: { cid: "1" },
      body: { csrfToken: CSRF_TOKEN, title: "x" },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie,
      params: { cid: "1" },
      body: { title: "x" },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("cid 非正整数 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { cid: "0" },
      body: { csrfToken: CSRF_TOKEN, title: "x" },
    })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { cid: "abc" },
      body: { csrfToken: CSRF_TOKEN, title: "x" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("title 缺省 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { cid: "1" },
      body: { csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("title 非字符串 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { cid: "1" },
      body: { csrfToken: CSRF_TOKEN, title: 123 },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("desc/content/slug 非字符串 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { cid: "1" },
      body: { csrfToken: CSRF_TOKEN, title: "x", desc: 123 },
    })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { cid: "1" },
      body: { csrfToken: CSRF_TOKEN, title: "x", content: {} },
    })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { cid: "1" },
      body: { csrfToken: CSRF_TOKEN, title: "x", slug: [] },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("status 非 0/1 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { cid: "1" },
      body: { csrfToken: CSRF_TOKEN, title: "x", status: 5 },
    })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { cid: "1" },
      body: { csrfToken: CSRF_TOKEN, title: "x", status: "abc" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("type 非 0/1 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { cid: "1" },
      body: { csrfToken: CSRF_TOKEN, title: "x", type: 2 },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("文章不存在 → 404", async () => {
    sharedFake.on("contents", "findUnique", async () => null);
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { cid: "999" },
      body: { csrfToken: CSRF_TOKEN, title: "x" },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("publishDate 非法格式 → 400", async () => {
    sharedFake.on("contents", "findUnique", async () => ({ cid: 1, slug: "x", type: 0 }));
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { cid: "1" },
      body: { csrfToken: CSRF_TOKEN, title: "x", publishDate: "not-a-date" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("slug 已被占用 → 400", async () => {
    sharedFake.on("contents", "findUnique", async () => ({ cid: 1, slug: "old-slug", type: 0 }));
    sharedFake.on("contents", "findFirst", async () => ({ cid: 2, slug: "taken" }));
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { cid: "1" },
      body: { csrfToken: CSRF_TOKEN, title: "x", slug: "taken" },
    })).rejects.toThrow(/已被其他文章使用/);
  });

  test("成功 → 更新", async () => {
    sharedFake.on("contents", "findUnique", async () => ({ cid: 1, slug: "x", type: 0 }));
    sharedFake.on("contents", "update", async () => ({}));
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { cid: "1" },
      body: { csrfToken: CSRF_TOKEN, title: "改名" },
    }) as { success: boolean; data: { cid: number } };
    expect(r.success).toBe(true);
    expect(r.data.cid).toBe(1);
  });

  test("update P2002(并发抢注 slug) → 400", async () => {
    sharedFake.on("contents", "findUnique", async () => ({ cid: 1, slug: "old", type: 0 }));
    sharedFake.on("contents", "findFirst", async () => null);
    sharedFake.on("contents", "update", async () => {
      throw Object.assign(new Error("unique"), { code: "P2002" });
    });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { cid: "1" },
      body: { csrfToken: CSRF_TOKEN, title: "x", slug: "new" },
    })).rejects.toThrow(/已被其他文章使用/);
  });
});