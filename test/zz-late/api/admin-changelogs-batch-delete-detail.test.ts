import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/admin/changelogs/batch-delete.post")).default;

describe("admin/changelogs/batch-delete.post 边界", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(handler, {
      method: "POST",
      body: { csrfToken: CSRF_TOKEN, ids: [1] },
      cookie: "csrf_token=" + CSRF_TOKEN,
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie,
      body: { ids: [1] },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("ids 缺省/非数组/空数组 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, ids: "1,2,3" },
    })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, ids: [] },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("ids 全是非正整数(Set 去重后为空)→ 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, ids: [-1, 0, -5] },
    })).rejects.toThrow(/更新日志 ID 无效/);
  });

  test("成功 → 删除日志 + 失效缓存", async () => {
    let deleted: { id: { in: number[] } } | undefined;
    sharedFake.on("changelogs", "deleteMany", async ({ where }: { where: { id: { in: number[] } } }) => {
      deleted = where;
      return { count: where.id.in.length };
    });
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, ids: [1, 2, 3] },
    }) as { success: boolean; count: number; message: string };
    expect(r.success).toBe(true);
    expect(r.count).toBe(3);
    expect(deleted!.id.in).toEqual([1, 2, 3]);
  });

  test("deleteMany 抛错 → 500", async () => {
    sharedFake.on("changelogs", "deleteMany", async () => { throw new Error("db boom"); });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, ids: [1] },
    })).rejects.toMatchObject({ statusCode: 500 });
  });
});