/**
 * admin/links/[id].delete 补测:
 *  - 401/CSRF/400 守卫
 *  - 404 链接不存在
 *  - 成功:返回 { success: true }
 *  - 响应不含 id(防泄漏)
 */
import { describe, expect, mock, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";
import { CSRF_HEADER } from "#shared/constants";

mockSharedPrisma();
mock.module("#server/utils/content-cache", () => ({ invalidateContentCaches: async () => ({}) }));

const handler = (await import("#server/api/admin/links/[id].delete")).default;

async function sessionCookie(): Promise<string> {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

async function callDel(opts: { id?: string; cookie?: string; headers?: Record<string, string> }) {
  const params: Record<string, string> = {};
  if (opts.id !== undefined) params.id = opts.id;
  return callAdmin(handler, {
    method: "DELETE",
    params,
    body: {},
    cookie: opts.cookie ?? await sessionCookie(),
    headers: { ...({ [CSRF_HEADER]: CSRF_TOKEN }), ...(opts.headers ?? {}) },
  });
}

describe("admin/links/[id].delete 守卫", () => {
  test("未登录 → 401", async () => {
    await expect(callDel({ id: "1", cookie: "" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403(走 x-csrf-token 头)", async () => {
    await expect(callDel({ id: "1", headers: { [CSRF_HEADER]: "" } })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("id 缺省 → 400", async () => {
    await expect(callDel({})).rejects.toMatchObject({ statusCode: 400 });
  });

  test("id 非正整数 → 400", async () => {
    for (const bad of ["0", "-1", "abc", "1.5"]) {
      await expect(callDel({ id: bad })).rejects.toMatchObject({ statusCode: 400 });
    }
  });
});

describe("admin/links/[id].delete 业务逻辑", () => {
  test("链接不存在(P2025)→ 404 而非 500", async () => {
    sharedFake.on("links", "delete", async () => {
      throw Object.assign(new Error("not found"), { code: "P2025" });
    });
    await expect(callDel({ id: "999" })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("成功 → 只含 success(不泄漏 id 等)", async () => {
    sharedFake.on("links", "delete", async () => ({}));
    const r = (await callDel({ id: "1" })) as Record<string, unknown>;
    expect(Object.keys(r).sort()).toEqual(["success"]);
    expect(r.success).toBe(true);
  });
});