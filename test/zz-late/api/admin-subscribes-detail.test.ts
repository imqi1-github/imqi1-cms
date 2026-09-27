import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const postHandler = (await import("#server/api/admin/subscribes.post")).default;
const putHandler = (await import("#server/api/admin/subscribes/[id].put")).default;
const deleteHandler = (await import("#server/api/admin/subscribes/[id].delete")).default;
const statsHandler = (await import("#server/api/admin/subscribes/stats.get")).default;

describe("admin/subscribes.post 边界补测", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(postHandler, {
      method: "POST",
      body: { csrfToken: CSRF_TOKEN, name: "博客", url: "https://blog.com" },
      cookie: "csrf_token=" + CSRF_TOKEN,
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(postHandler, {
      method: "POST",
      cookie,
      body: { name: "博客", url: "https://blog.com" },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("name/url 缺省 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(postHandler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("name 非字符串(数字) → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(postHandler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, name: 12345, url: "https://x.com" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("成功 → 创建订阅源", async () => {
    let created: Record<string, unknown> | undefined;
    sharedFake.on("subscribes", "create", async ({ data }: { data: Record<string, unknown> }) => {
      created = data;
      return { id: 100, url: data.url as string, name: data.name as string, avatar: data.avatar as string | null, lastUpdated: null };
    });
    const cookie = await loginSessionCookie();
    const r = await callAdmin(postHandler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, name: "博客", url: "https://blog.com" },
    }) as { id: number; url: string };
    expect(r.id).toBe(100);
    expect(r.url).toBe("https://blog.com");
    expect(created!.url).toBe("https://blog.com");
  });

  test("create 抛未知异常 → 500", async () => {
    sharedFake.on("subscribes", "create", async () => { throw new Error("db boom"); });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(postHandler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, name: "博客", url: "https://blog.com" },
    })).rejects.toMatchObject({ statusCode: 500 });
  });
});

describe("admin/subscribes/[id].put 边界补测", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(putHandler, {
      method: "PUT",
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, name: "改名", url: "https://x.com" },
      cookie: "csrf_token=" + CSRF_TOKEN,
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(putHandler, {
      method: "PUT",
      cookie,
      params: { id: "1" },
      body: { name: "改名", url: "https://x.com" },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("id 非正整数 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(putHandler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "abc" },
      body: { csrfToken: CSRF_TOKEN, name: "改名", url: "https://x.com" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("成功 → 更新订阅源", async () => {
    sharedFake.on("subscribes", "update", async () => ({ id: 1, name: "改名", url: "https://x.com", avatar: null, lastUpdated: new Date() }));
    const cookie = await loginSessionCookie();
    const r = await callAdmin(putHandler, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, name: "改名", url: "https://x.com" },
    }) as { id: number; name: string };
    expect(r.id).toBe(1);
    expect(r.name).toBe("改名");
  });
});

describe("admin/subscribes/[id].delete 边界补测", () => {
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

  test("成功 → 删除订阅源", async () => {
    sharedFake.on("subscribes", "delete", async () => ({}));
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

describe("admin/subscribes/stats.get", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(statsHandler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("成功 → 返回统计字段", async () => {
    sharedFake.on("subscribes", "findMany", async () => [{ id: 1 }, { id: 2 }, { id: 3 }]);
    sharedFake.on("contents", "count", async () => 10);
    const cookie = await loginSessionCookie();
    const r = await callAdmin(statsHandler, { method: "GET", cookie }) as Record<string, unknown>;
    expect(r).toBeDefined();
  });
});