import { beforeEach, describe, expect, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { CSRF_HEADER } from "#shared/constants";

// 不调 registerMetasFakes — subscribes 不依赖 metas;
// 顶层 import 时 test/helpers/admin 已调过,这里仅需注册 subscribes 自己的假件

// subscribes 表假件
const subscribeRows: Array<Record<string, unknown>> = [];
const subscribeCreates: Array<Record<string, unknown>> = [];
const subscribeUpdates: Array<{ id: number, data: Record<string, unknown> }> = [];
const subscribeDeletes: number[] = [];
const fakePrisma = await import("#test/helpers/fake-prisma");
fakePrisma.sharedFake.on("subscribes", "findUnique", async ({ where }: { where: { id: number } }) =>
  subscribeRows.find(r => r.id === where.id) ?? null);
fakePrisma.sharedFake.on("subscribes", "create", async ({ data }: { data: Record<string, unknown> }) => {
  subscribeCreates.push({ ...data });
  const id = subscribeRows.length + 1;
  const row = { id, ...data };
  subscribeRows.push(row);
  return { ...row };
});
fakePrisma.sharedFake.on("subscribes", "update", async ({ where, data }: { where: { id: number }, data: Record<string, unknown> }) => {
  const row = subscribeRows.find(r => r.id === where.id);
  if (!row) throw Object.assign(new Error("P2025"), { code: "P2025" });
  subscribeUpdates.push({ id: where.id, data });
  Object.assign(row, data);
  return { id: where.id, ...data };
});
fakePrisma.sharedFake.on("subscribes", "delete", async ({ where }: { where: { id: number } }) => {
  subscribeDeletes.push(where.id);
  const i = subscribeRows.findIndex(r => r.id === where.id);
  if (i === -1) throw Object.assign(new Error("P2025"), { code: "P2025" });
  subscribeRows.splice(i, 1);
  return {};
});

const createHandler = (await import("#server/api/admin/subscribes.post")).default;
const putHandler = (await import("#server/api/admin/subscribes/[id].put")).default;
const deleteHandler = (await import("#server/api/admin/subscribes/[id].delete")).default;

async function cookie() {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

beforeEach(() => {
  subscribeRows.length = 0;
  subscribeRows.push({ id: 1, name: "源甲", url: "https://a.com", feed: "https://a.com/feed" });
  subscribeCreates.length = 0;
  subscribeUpdates.length = 0;
  subscribeDeletes.length = 0;
});

describe("subscribes.post(订阅源创建)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(createHandler, {
      method: "POST",
      cookie: CSRF_COOKIE,
      body: { name: "x", url: "https://x.com", csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    await expect(callAdmin(createHandler, {
      method: "POST",
      body: { name: "x", url: "https://x.com" },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("成功创建:name + url + feed", async () => {
    const r = await callAdmin(createHandler, {
      method: "POST",
      body: { name: "新源", url: "https://x.com", feed: "https://x.com/feed", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    }) as { id: number, name: string };
    expect(r.name).toBe("新源");
    expect(r.id).toBeGreaterThan(0);
    expect(subscribeCreates).toHaveLength(1);
  });
});

describe("subscribes/[id].put", () => {
  test("id 不存在 → 404", async () => {
    await expect(callAdmin(putHandler, {
      method: "PUT",
      params: { id: "999" },
      body: { name: "x", url: "https://x.com", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("非法 id → 400", async () => {
    await expect(callAdmin(putHandler, {
      method: "PUT",
      params: { id: "abc" },
      body: { name: "x", url: "https://x.com", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("name/url 缺一 → 400 必填校验", async () => {
    await expect(callAdmin(putHandler, {
      method: "PUT",
      params: { id: "1" },
      body: { name: "x", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/必填/);
  });

  test("成功更新:返回 select 字段直对象", async () => {
    const r = await callAdmin(putHandler, {
      method: "PUT",
      params: { id: "1" },
      body: { name: "新名", url: "https://x.com", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    }) as { id: number, name: string, url: string };
    expect(r.name).toBe("新名");
    expect(r.url).toBe("https://x.com");
    expect(subscribeUpdates).toHaveLength(1);
  });
});

describe("subscribes/[id].delete", () => {
  test("CSRF header 缺失 → 403", async () => {
    await expect(callAdmin(deleteHandler, {
      method: "DELETE",
      params: { id: "1" },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("id 不存在 → 404", async () => {
    await expect(callAdmin(deleteHandler, {
      method: "DELETE",
      params: { id: "999" },
      cookie: await cookie(),
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("成功删除", async () => {
    const r = await callAdmin(deleteHandler, {
      method: "DELETE",
      params: { id: "1" },
      cookie: await cookie(),
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    });
    expect(r).toBeDefined();
    expect(subscribeDeletes).toEqual([1]);
  });
});
