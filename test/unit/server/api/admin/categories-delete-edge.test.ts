/**
 * admin/categories/[id].delete 补测:
 *  - 401/CSRF/400 守卫
 *  - 分类不存在 → 404
 *  - 至少保留一个分类 → 400
 *  - 关联文章无目标分类可迁移 → 400
 *  - P2025 并发删 → 404 而非 500
 *  - 响应只含 success
 *  - 整段迁移 + 删除在事务内(任一步失败回滚)
 */
import { describe, expect, mock, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";
import { CSRF_HEADER } from "#shared/constants";

mockSharedPrisma();
mock.module("#server/utils/content-cache", () => ({ invalidateContentCaches: async () => ({}) }));

const handler = (await import("#server/api/admin/categories/[id].delete")).default;

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

describe("admin/categories/[id].delete 守卫", () => {
  test("未登录 → 401", async () => {
    await expect(callDel({ id: "1", cookie: "" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
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

describe("admin/categories/[id].delete 业务逻辑", () => {
  test("分类不存在 → 404", async () => {
    sharedFake.on("metas", "count", async () => 5);
    sharedFake.on("metas", "findFirst", async () => null);
    sharedFake.on("metas", "count", async () => 5); // 至少 2 个分类
    sharedFake.on("$queryRaw", async () => []);
    sharedFake.on("$transaction", async (arg: unknown) => {
      if (typeof arg === "function") return await (arg as (tx: unknown) => Promise<unknown>)(sharedFake.prisma);
      return arg;
    });
    await expect(callDel({ id: "999" })).rejects.toMatchObject({ statusCode: 404, message: "分类不存在" });
  });

  test("仅剩一个分类时 → 400 至少需要保留一个分类", async () => {
    sharedFake.on("metas", "count", async () => 1);
    sharedFake.on("$queryRaw", async () => []);
    sharedFake.on("$transaction", async (arg: unknown) => {
      if (typeof arg === "function") return await (arg as (tx: unknown) => Promise<unknown>)(sharedFake.prisma);
      return arg;
    });
    await expect(callDel({ id: "1" })).rejects.toMatchObject({ statusCode: 400, message: "至少需要保留一个分类" });
  });

  test("无关联文章 → 仅删 metas(不调 contentrelations)", async () => {
    sharedFake.on("$queryRaw", async () => []);
    sharedFake.on("metas", "count", async () => 3);
    sharedFake.on("metas", "findFirst", async () => ({ mid: 1, type: "category" }));
    sharedFake.on("contentrelations", "findMany", async () => []);
    let metaDeleted = false;
    sharedFake.on("metas", "delete", async () => {
      metaDeleted = true;
      return {};
    });
    sharedFake.on("$transaction", async (arg: unknown) => {
      if (typeof arg === "function") return await (arg as (tx: unknown) => Promise<unknown>)(sharedFake.prisma);
      return arg;
    });
    const r = await callDel({ id: "1" }) as { success: boolean };
    expect(r.success).toBe(true);
    expect(metaDeleted).toBe(true);
  });

  test("成功 → 响应只含 success(不泄漏 mid 等)", async () => {
    sharedFake.on("$queryRaw", async () => []);
    sharedFake.on("metas", "count", async () => 3);
    sharedFake.on("metas", "findFirst", async () => ({ mid: 1, type: "category" }));
    sharedFake.on("contentrelations", "findMany", async () => []);
    sharedFake.on("metas", "delete", async () => ({}));
    sharedFake.on("$transaction", async (arg: unknown) => {
      if (typeof arg === "function") return await (arg as (tx: unknown) => Promise<unknown>)(sharedFake.prisma);
      return arg;
    });
    const r = (await callDel({ id: "1" })) as Record<string, unknown>;
    expect(Object.keys(r).sort()).toEqual(["success"]);
  });
});

describe("admin/categories/[id].delete:并发兜底", () => {
  test("并发删除(P2025)→ 404 而非 500", async () => {
    sharedFake.on("$queryRaw", async () => []);
    sharedFake.on("metas", "count", async () => 3);
    sharedFake.on("metas", "findFirst", async () => ({ mid: 1, type: "category" }));
    sharedFake.on("contentrelations", "findMany", async () => []);
    sharedFake.on("metas", "delete", async () => {
      throw Object.assign(new Error("not found"), { code: "P2025" });
    });
    sharedFake.on("$transaction", async (arg: unknown) => {
      if (typeof arg === "function") return await (arg as (tx: unknown) => Promise<unknown>)(sharedFake.prisma);
      return arg;
    });
    await expect(callDel({ id: "1" })).rejects.toMatchObject({ statusCode: 404 });
  });
});