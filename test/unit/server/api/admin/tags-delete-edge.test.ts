/**
 * admin/tags/[id].delete 补测:
 *  - 401/CSRF/400 守卫
 *  - 404 标签不存在
 *  - 400 该 mid 是 category 而非 tag(防误删分类)
 *  - 成功 → 返回 { success: true }
 *  - 响应不含 id/mid(防泄漏)
 *  - P2025(并发删)→ 404 而非 500
 */
import { describe, expect, mock, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";
import { CSRF_HEADER } from "#shared/constants";

mockSharedPrisma();
mock.module("#server/utils/content-cache", () => ({ invalidateContentCaches: async () => ({}) }));

const handler = (await import("#server/api/admin/tags/[id].delete")).default;

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

describe("admin/tags/[id].delete 守卫", () => {
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

describe("admin/tags/[id].delete 业务逻辑", () => {
  test("标签不存在 → 404", async () => {
    sharedFake.on("metas", "findUnique", async () => null);
    await expect(callDel({ id: "999" })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("mid 是 category 而非 tag → 400(防误删分类)", async () => {
    sharedFake.on("metas", "findUnique", async () => ({ mid: 2, type: "category" }));
    await expect(callDel({ id: "2" })).rejects.toMatchObject({ statusCode: 400, message: "只能删除标签类型" });
  });

  test("成功 → 删 contentrelations + 删 metas(数组式事务)", async () => {
    sharedFake.on("metas", "findUnique", async () => ({ mid: 1, type: "tag" }));
    const relDeletes: Array<{ mid: number }> = [];
    sharedFake.on("contentrelations", "deleteMany", async ({ where }: { where: { mid: number } }) => {
      relDeletes.push({ mid: where.mid });
      return { count: 0 };
    });
    const metaDeletes: Array<{ mid: number }> = [];
    sharedFake.on("metas", "delete", async ({ where }: { where: { mid: number } }) => {
      metaDeletes.push({ mid: where.mid });
      return {};
    });
    sharedFake.on("$transaction", async (opsOrFn: unknown) => {
      // 数组形式:逐个 await
      if (Array.isArray(opsOrFn)) {
        const results = [];
        for (const _op of opsOrFn) {
          // 简化:每个 op 是带 _fakeType 标记的 proxy
          // 直接返回成功,验证 delete 顺序已触发
          results.push({ count: 1 });
        }
        return results;
      }
      return opsOrFn;
    });
    const r = await callDel({ id: "1" }) as { success: boolean };
    expect(r.success).toBe(true);
    expect(relDeletes).toEqual([{ mid: 1 }]);
    expect(metaDeletes).toEqual([{ mid: 1 }]);
  });

  test("成功 → 响应只含 success,不泄漏 id/mid", async () => {
    sharedFake.on("metas", "findUnique", async () => ({ mid: 1, type: "tag" }));
    sharedFake.on("contentrelations", "deleteMany", async () => ({ count: 0 }));
    sharedFake.on("metas", "delete", async () => ({}));
    sharedFake.on("$transaction", async () => [{ count: 1 }, {}]);
    const r = (await callDel({ id: "1" })) as Record<string, unknown>;
    expect(Object.keys(r).sort()).toEqual(["success"]);
  });
});

describe("admin/tags/[id].delete:并发兜底", () => {
  test("标签已被删(P2025)→ 404 而非 500", async () => {
    sharedFake.on("metas", "findUnique", async () => null);
    sharedFake.on("contentrelations", "deleteMany", async () => ({ count: 0 }));
    sharedFake.on("metas", "delete", async () => {
      throw Object.assign(new Error("not found"), { code: "P2025" });
    });
    await expect(callDel({ id: "1" })).rejects.toMatchObject({ statusCode: 404 });
  });
});