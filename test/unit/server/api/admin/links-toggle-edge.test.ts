/**
 * admin/links/[id]/toggle.patch 补测:
 *  - 401/CSRF/400 守卫
 *  - 404 链接不存在
 *  - 成功:enabled 翻转(条件式 updateMany 防并发覆盖)
 *  - 并发:enabled 已被改动 → 409 提示刷新
 *  - 行在并发中被删 → 404 而非 500
 *  - 响应只含 id/enabled(白名单)
 */
import { describe, expect, mock, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();
mock.module("#server/utils/content-cache", () => ({ invalidateContentCaches: async () => ({}) }));

const handler = (await import("#server/api/admin/links/[id]/toggle.patch")).default;

async function cookie(): Promise<string> {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

async function callToggle(opts: { id?: string; cookie?: string }) {
  const params: Record<string, string> = {};
  if (opts.id !== undefined) params.id = opts.id;
  return callAdmin(handler, {
    method: "PATCH",
    params,
    body: { csrfToken: CSRF_TOKEN },
    cookie: opts.cookie ?? await cookie(),
  });
}

describe("admin/links/[id]/toggle.patch 守卫", () => {
  test("未登录 → 401", async () => {
    await expect(callToggle({ id: "1", cookie: "" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const session = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PATCH",
      params: { id: "1" },
      body: {},
      cookie: session,
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("id 缺省 → 400", async () => {
    await expect(callToggle({})).rejects.toMatchObject({ statusCode: 400 });
  });

  test("id 非正整数 → 400", async () => {
    for (const bad of ["0", "-1", "abc"]) {
      await expect(callToggle({ id: bad })).rejects.toMatchObject({ statusCode: 400 });
    }
  });
});

describe("admin/links/[id]/toggle.patch 业务逻辑", () => {
  test("链接不存在 → 404", async () => {
    sharedFake.on("links", "findUnique", async () => null);
    await expect(callToggle({ id: "999" })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("成功:enabled true → false", async () => {
    sharedFake.on("links", "findUnique", async () => ({ id: 1, enabled: true }));
    sharedFake.on("links", "updateMany", async () => ({ count: 1 }));
    const r = await callToggle({ id: "1" }) as { id: number; enabled: boolean };
    expect(r.id).toBe(1);
    expect(r.enabled).toBe(false);
  });

  test("成功:enabled false → true", async () => {
    sharedFake.on("links", "findUnique", async () => ({ id: 1, enabled: false }));
    sharedFake.on("links", "updateMany", async () => ({ count: 1 }));
    const r = await callToggle({ id: "1" }) as { id: number; enabled: boolean };
    expect(r.enabled).toBe(true);
  });

  test("并发:enabled 已被改动 → 409 提示刷新(而非静默翻转)", async () => {
    sharedFake.on("links", "findUnique", async ({ where }: { where: { id: number } }) => {
      // 第一次 findUnique 返回 true;updateMany 失败(count=0);第二次 findUnique 仍返回该行
      if (where.id === 1) return { id: 1, enabled: true };
      return null;
    });
    sharedFake.on("links", "updateMany", async () => ({ count: 0 }));
    await expect(callToggle({ id: "1" })).rejects.toMatchObject({ statusCode: 409, message: "链接状态已更新，请刷新后重试" });
  });

  test("行在并发中被删 → 404 而非 500", async () => {
    sharedFake.on("links", "findUnique", async () => ({ id: 1, enabled: true }));
    sharedFake.on("links", "updateMany", async () => ({ count: 0 }));
    sharedFake.on("links", "findUnique", async () => null); // 第二次查不存在
    await expect(callToggle({ id: "1" })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("admin/links/[id]/toggle.patch:响应 shape", () => {
  test("成功 → 只含 id/enabled(白名单,不裸返整行)", async () => {
    sharedFake.on("links", "findUnique", async () => ({ id: 1, enabled: true }));
    sharedFake.on("links", "updateMany", async () => ({ count: 1 }));
    const r = (await callToggle({ id: "1" })) as Record<string, unknown>;
    expect(Object.keys(r).sort()).toEqual(["enabled", "id"]);
  });
});