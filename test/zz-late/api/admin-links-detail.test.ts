import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const deleteHandler = (await import("#server/api/admin/links/[id].delete")).default;
const patchHandler = (await import("#server/api/admin/links/[id].patch")).default;
const toggleHandler = (await import("#server/api/admin/links/[id]/toggle.patch")).default;

describe("admin/links/[id].delete 边界补测", () => {
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
      params: { id: "0" },
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

  test("成功 → 删除友链 + 失效缓存", async () => {
    sharedFake.on("links", "delete", async () => ({}));
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

describe("admin/links/[id].patch 边界补测", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(patchHandler, {
      method: "PATCH",
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, name: "改名" },
      cookie: "csrf_token=" + CSRF_TOKEN,
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(patchHandler, {
      method: "PATCH",
      cookie,
      params: { id: "1" },
      body: { name: "改名" },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("id 非正整数 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(patchHandler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "abc" },
      body: { csrfToken: CSRF_TOKEN, name: "改名" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("javascript: 协议 → 400(防 XSS)", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(patchHandler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, name: "甲", link: "javascript:alert(1)" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("link 非字符串 → 400", async () => {
    sharedFake.on("links", "findUnique", async () => ({ id: 1, name: "x", link: "https://x.com", enabled: true }));
    const cookie = await loginSessionCookie();
    await expect(callAdmin(patchHandler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, link: 12345 },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("enabled 非布尔 → 400", async () => {
    sharedFake.on("links", "findUnique", async () => ({ id: 1, name: "x", link: "https://x.com", enabled: true }));
    const cookie = await loginSessionCookie();
    await expect(callAdmin(patchHandler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, enabled: "true" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("成功 → 更新友链", async () => {
    sharedFake.on("links", "findUnique", async () => ({ id: 1, name: "旧名", link: "https://x.com", enabled: true }));
    sharedFake.on("links", "update", async () => ({ id: 1, name: "新名", link: "https://x.com", enabled: false }));
    const cookie = await loginSessionCookie();
    const r = await callAdmin(patchHandler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, name: "新名", enabled: false },
    }) as { id: number; name: string; enabled: boolean };
    expect(r.id).toBe(1);
    expect(r.name).toBe("新名");
    expect(r.enabled).toBe(false);
  });
});

describe("admin/links/[id]/toggle.patch 边界补测", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(toggleHandler, {
      method: "PATCH",
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(toggleHandler, {
      method: "PATCH",
      cookie,
      params: { id: "1" },
      body: {},
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("id 非正整数 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(toggleHandler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "0" },
      body: { csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("成功 → enabled 翻转 + 失效缓存", async () => {
    sharedFake.on("links", "findUnique", async () => ({ id: 1, enabled: true }));
    sharedFake.on("links", "updateMany", async () => ({ count: 1 }));
    const cookie = await loginSessionCookie();
    const r = await callAdmin(toggleHandler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN },
    }) as { id: number; enabled: boolean };
    expect(r.id).toBe(1);
    expect(r.enabled).toBe(false);
  });

  test("从 enabled=false 翻转 → 变 true", async () => {
    sharedFake.on("links", "findUnique", async () => ({ id: 1, enabled: false }));
    sharedFake.on("links", "updateMany", async () => ({ count: 1 }));
    const cookie = await loginSessionCookie();
    const r = await callAdmin(toggleHandler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN },
    }) as { enabled: boolean };
    expect(r.enabled).toBe(true);
  });
});