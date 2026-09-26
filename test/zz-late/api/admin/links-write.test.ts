import { beforeEach, describe, expect, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { CSRF_HEADER } from "#shared/constants";

const fakePrisma = await import("#test/helpers/fake-prisma");

// links 表假件
const linkRows: Array<Record<string, unknown>> = [];
const linkUpdates: Array<{ id: number, data: Record<string, unknown> }> = [];
const linkDeletes: number[] = [];

linkRows.push({ id: 1, name: "甲", link: "https://a.com", enabled: true });
linkRows.push({ id: 2, name: "乙", link: "https://b.com", enabled: false });
linkRows.push({ id: 3, name: "丙", link: "https://c.com", enabled: true });

fakePrisma.sharedFake.on("links", "findUnique", async ({ where }: { where: { id: number } }) => {
  // 返回 clone 防止后续 update 改 row 时影响 source 的 link.enabled 视图
  const r = linkRows.find(l => l.id === where.id);
  return r ? { ...r } : null;
});
fakePrisma.sharedFake.on("links", "update", async ({ where, data }: { where: { id: number }, data: Record<string, unknown> }) => {
  const row = linkRows.find(l => l.id === where.id);
  if (!row) throw Object.assign(new Error("P2025"), { code: "P2025" });
  linkUpdates.push({ id: where.id, data });
  Object.assign(row, data);
  return { ...row };
});
fakePrisma.sharedFake.on("links", "updateMany", async ({ where, data }: { where: { id: number }, data: Record<string, unknown> }) => {
  const row = linkRows.find(l => l.id === where.id);
  if (!row) throw Object.assign(new Error("P2025"), { code: "P2025" });
  linkUpdates.push({ id: where.id, data });
  Object.assign(row, data);
  return { count: 1 };
});
fakePrisma.sharedFake.on("links", "delete", async ({ where }: { where: { id: number } }) => {
  const i = linkRows.findIndex(l => l.id === where.id);
  if (i === -1) throw Object.assign(new Error("P2025"), { code: "P2025" });
  linkDeletes.push(where.id);
  linkRows.splice(i, 1);
  return {};
});

const deleteHandler = (await import("#server/api/admin/links/[id].delete")).default;
const patchHandler = (await import("#server/api/admin/links/[id].patch")).default;
const toggleHandler = (await import("#server/api/admin/links/[id]/toggle.patch")).default;

async function cookie() {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

beforeEach(() => {
  linkRows.length = 0;
  linkRows.push({ id: 1, name: "甲", link: "https://a.com", enabled: true });
  linkRows.push({ id: 2, name: "乙", link: "https://b.com", enabled: false });
  linkRows.push({ id: 3, name: "丙", link: "https://c.com", enabled: true });
  linkUpdates.length = 0;
  linkDeletes.length = 0;
});

describe("links/[id].delete(删除友链)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(deleteHandler, {
      method: "DELETE",
      params: { id: "1" },
      cookie: CSRF_COOKIE,
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF header 缺失 → 403", async () => {
    await expect(callAdmin(deleteHandler, {
      method: "DELETE",
      params: { id: "1" },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("非法 id → 400", async () => {
    await expect(callAdmin(deleteHandler, {
      method: "DELETE",
      params: { id: "abc" },
      cookie: await cookie(),
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("id 不存在 → 404", async () => {
    await expect(callAdmin(deleteHandler, {
      method: "DELETE",
      params: { id: "999" },
      cookie: await cookie(),
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    })).rejects.toThrow();
  });

  test("成功删除", async () => {
    const r = await callAdmin(deleteHandler, {
      method: "DELETE",
      params: { id: "1" },
      cookie: await cookie(),
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    }) as { success: boolean };
    expect(r.success).toBe(true);
    expect(linkDeletes).toEqual([1]);
  });
});

describe("links/[id].patch(修改友链)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(patchHandler, {
      method: "PATCH",
      params: { id: "1" },
      cookie: CSRF_COOKIE,
      body: { name: "x", csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    await expect(callAdmin(patchHandler, {
      method: "PATCH",
      params: { id: "1" },
      body: { name: "x" },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("非法 id → 400", async () => {
    await expect(callAdmin(patchHandler, {
      method: "PATCH",
      params: { id: "abc" },
      body: { name: "x", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("id 不存在 → 404", async () => {
    await expect(callAdmin(patchHandler, {
      method: "PATCH",
      params: { id: "999" },
      body: { name: "x", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow();
  });

  test("name 非字符串 → 400", async () => {
    await expect(callAdmin(patchHandler, {
      method: "PATCH",
      params: { id: "1" },
      body: { name: 123, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/name/);
  });

  test("link 非字符串 → 400", async () => {
    await expect(callAdmin(patchHandler, {
      method: "PATCH",
      params: { id: "1" },
      body: { link: 123, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/link/);
  });

  test("enabled 非布尔 → 400", async () => {
    await expect(callAdmin(patchHandler, {
      method: "PATCH",
      params: { id: "1" },
      body: { enabled: "yes", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/enabled/);
  });

  test("link 协议 javascript: → 400(XSS 拦截)", async () => {
    await expect(callAdmin(patchHandler, {
      method: "PATCH",
      params: { id: "1" },
      body: { link: "javascript:alert(1)", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/http/);
  });

  test("link 协议 data: → 400(XSS 拦截)", async () => {
    await expect(callAdmin(patchHandler, {
      method: "PATCH",
      params: { id: "1" },
      body: { link: "data:text/html,<script>alert(1)</script>", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/http/);
  });

  test("成功更新 name/link/enabled", async () => {
    await callAdmin(patchHandler, {
      method: "PATCH",
      params: { id: "1" },
      body: { name: "新甲", link: "https://new.com", enabled: false, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    });
    expect(linkUpdates).toHaveLength(1);
    expect(linkUpdates[0]!.data.name).toBe("新甲");
    expect(linkUpdates[0]!.data.enabled).toBe(false);
  });
});

describe("links/[id]/toggle.patch(启用/禁用切换)", () => {
  // toggle 无条件翻转当前 enabled,不接受 body 字段

  test("未登录 → 401", async () => {
    await expect(callAdmin(toggleHandler, {
      method: "PATCH",
      params: { id: "1" },
      cookie: CSRF_COOKIE,
      body: { csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    await expect(callAdmin(toggleHandler, {
      method: "PATCH",
      params: { id: "1" },
      body: {},
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("非法 id → 400", async () => {
    await expect(callAdmin(toggleHandler, {
      method: "PATCH",
      params: { id: "abc" },
      body: { csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("id 不存在 → 404", async () => {
    await expect(callAdmin(toggleHandler, {
      method: "PATCH",
      params: { id: "999" },
      body: { csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow();
  });

  test("已启用 → 翻转为禁用", async () => {
    // id=1 初始 enabled=true
    const r = await callAdmin(toggleHandler, {
      method: "PATCH",
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    }) as { id: number, enabled: boolean };
    expect(r.enabled).toBe(false);
    expect(linkUpdates[0]!.data.enabled).toBe(false);
  });

  test("已禁用 → 翻转为启用", async () => {
    // id=2 初始 enabled=false
    const r = await callAdmin(toggleHandler, {
      method: "PATCH",
      params: { id: "2" },
      body: { csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    }) as { id: number, enabled: boolean };
    expect(r.enabled).toBe(true);
    expect(linkUpdates[0]!.data.enabled).toBe(true);
  });

  test("条件式原子翻转:并发改了 enabled → 409", async () => {
    // 让 updateMany 返回 count:0(模拟并发条件不匹配)
    fakePrisma.sharedFake.on("links", "updateMany", async () => ({ count: 0 }));
    // 但 findUnique 仍能找到 row → 触发 409
    await expect(callAdmin(toggleHandler, {
      method: "PATCH",
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow();
    // 还原
    fakePrisma.sharedFake.on("links", "updateMany", async ({ where, data }: { where: { id: number }, data: Record<string, unknown> }) => {
      const row = linkRows.find(l => l.id === where.id);
      if (!row) throw Object.assign(new Error("P2025"), { code: "P2025" });
      linkUpdates.push({ id: where.id, data });
      Object.assign(row, data);
      return { count: 1 };
    });
  });
});
