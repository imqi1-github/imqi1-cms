/**
 * admin/changelogs/[id].delete 补测:
 *  - 401/CSRF/400 守卫
 *  - 404 更新日志不存在
 *  - 成功 → { success: true }
 *  - 响应不含 id(防泄漏)
 *  - P2025 → 404 而非 500
 */
import { describe, expect, mock, test } from "bun:test";

import { callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";
import { CSRF_HEADER } from "#shared/constants";

mockSharedPrisma();
mock.module("#server/utils/content-cache", () => ({ invalidateContentCaches: async () => ({}) }));

const handler = (await import("#server/api/admin/changelogs/[id].delete")).default;

async function sessionCookie(): Promise<string> {
  return `${await loginSessionCookie()}; csrf_token=${"c".repeat(20)}`;
}

async function callDel(opts: { id?: string; cookie?: string; headers?: Record<string, string> }) {
  const params: Record<string, string> = {};
  if (opts.id !== undefined) params.id = opts.id;
  return callAdmin(handler, {
    method: "DELETE",
    params,
    body: {},
    cookie: opts.cookie ?? await sessionCookie(),
    headers: { ...({ [CSRF_HEADER]: "c".repeat(20) }), ...(opts.headers ?? {}) },
  });
}

describe("admin/changelogs/[id].delete 守卫", () => {
  test("未登录 → 401", async () => {
    await expect(callDel({ id: "1", cookie: "" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失(DELETE 走 header)→ 403", async () => {
    await expect(callDel({ id: "1", headers: { [CSRF_HEADER]: "" } })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("id 缺省 → 400", async () => {
    await expect(callDel({})).rejects.toMatchObject({ statusCode: 400 });
  });

  test("id 非正整数 → 400", async () => {
    for (const bad of ["0", "-1", "abc"]) {
      await expect(callDel({ id: bad })).rejects.toMatchObject({ statusCode: 400 });
    }
  });
});

describe("admin/changelogs/[id].delete 业务逻辑", () => {
  test("更新日志不存在(P2025)→ 404 而非 500", async () => {
    sharedFake.on("changelogs", "delete", async () => {
      throw Object.assign(new Error("not found"), { code: "P2025" });
    });
    await expect(callDel({ id: "999" })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("成功 → 调 changelogs.delete 并返回 success(响应不含 id)", async () => {
    const captured: { id?: number } = {};
    sharedFake.on("changelogs", "delete", async ({ where }: { where: { id: number } }) => {
      captured.id = where.id;
      return {};
    });
    const r = await callDel({ id: "5" }) as Record<string, unknown>;
    expect(captured.id).toBe(5);
    expect(r.success).toBe(true);
    expect(Object.keys(r).sort()).toEqual(["success"]);
  });
});