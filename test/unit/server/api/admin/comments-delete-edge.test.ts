/**
 * admin/comments/[id].delete 补测:
 *  - 401/CSRF/400 守卫
 *  - 404 评论不存在
 *  - 删除已发布评论 → 文章 comment_num -1(事务内原子)
 *  - 删除待审核评论(非 status=1)→ 不动 comment_num
 *  - 文章已被删(P2025 in 计数 update)→ 404 而非 500
 *  - 响应只含 success,不含 coid
 */
import { describe, expect, mock, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";
import { CSRF_HEADER } from "#shared/constants";

mockSharedPrisma();
mock.module("#server/utils/content-cache", () => ({ invalidateContentCaches: async () => ({}) }));

const handler = (await import("#server/api/admin/comments/[id].delete")).default;

// 默认 comments.findUnique 返回 null,各测试可按需覆盖
sharedFake.on("comments", "findUnique", async () => null);
sharedFake.on("$transaction", async (arg: unknown) => {
  if (typeof arg === "function") return await (arg as (tx: unknown) => Promise<unknown>)(sharedFake.prisma);
  return arg;
});

async function sessionCookie(): Promise<string> {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

async function callDel(opts: { id?: string; headers?: Record<string, string>; cookie?: string }) {
  const params: Record<string, string> = {};
  if (opts.id !== undefined) params.id = opts.id;
  // opts.headers 完全覆盖默认(支持测试显式清空)
  return callAdmin(handler, {
    method: "DELETE",
    params,
    body: {},
    cookie: opts.cookie ?? await sessionCookie(),
    headers: { ...({ [CSRF_HEADER]: CSRF_TOKEN }), ...(opts.headers ?? {}) },
  });
}

describe("admin/comments/[id].delete 守卫", () => {
  test("未登录 → 401", async () => {
    await expect(callDel({ id: "1", cookie: "" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失(无 header)→ 403", async () => {
    await expect(callDel({ id: "1", headers: { [CSRF_HEADER]: "" } })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("id 缺省 → 400", async () => {
    await expect(callDel({})).rejects.toMatchObject({ statusCode: 400 });
  });

  test("id 非正整数 → 400(0/-1/abc)", async () => {
    for (const bad of ["0", "-1", "abc"]) {
      await expect(callDel({ id: bad })).rejects.toMatchObject({ statusCode: 400 });
    }
  });

  test("id 非数字字符 → 400", async () => {
    await expect(callDel({ id: "1a" })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("admin/comments/[id].delete:业务逻辑", () => {
  test("评论不存在 → 404", async () => {
    sharedFake.on("comments", "findUnique", async () => null);
    await expect(callDel({ id: "999" })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("删除已发布评论(status=1)→ 文章 comment_num -1", async () => {
    sharedFake.on("comments", "findUnique", async () => ({ coid: 1, cid: 10, status: 1 }));
    const contentUpdates: Array<unknown> = [];
    sharedFake.on("contents", "update", async ({ data }: { data: unknown }) => {
      contentUpdates.push(data);
      return {};
    });
    sharedFake.on("comments", "delete", async () => ({}));
    sharedFake.on("$transaction", async (arg: unknown) => {
      if (typeof arg === "function") return await (arg as (tx: unknown) => Promise<unknown>)(sharedFake.prisma);
      return arg;
    });
    const r = await callDel({ id: "1" }) as { success: boolean };
    expect(r.success).toBe(true);
    expect(contentUpdates).toHaveLength(1);
  });

  test("删除待审核评论(status=0)→ 不调用 contents.update(不动计数)", async () => {
    sharedFake.on("comments", "findUnique", async () => ({ coid: 1, cid: 10, status: 0 }));
    const contentUpdates: Array<unknown> = [];
    sharedFake.on("contents", "update", async ({ data }: { data: unknown }) => {
      contentUpdates.push(data);
      return {};
    });
    sharedFake.on("comments", "delete", async () => ({}));
    sharedFake.on("$transaction", async (arg: unknown) => {
      if (typeof arg === "function") return await (arg as (tx: unknown) => Promise<unknown>)(sharedFake.prisma);
      return arg;
    });
    await callDel({ id: "1" });
    expect(contentUpdates).toHaveLength(0);
  });
});

describe("admin/comments/[id].delete:并发兜底", () => {
  test("并发计数 update 时文章被删(P2025)→ 404 而非 500", async () => {
    sharedFake.on("comments", "findUnique", async () => ({ coid: 1, cid: 10, status: 1 }));
    sharedFake.on("comments", "delete", async () => ({}));
    sharedFake.on("contents", "update", async () => {
      throw Object.assign(new Error("not found"), { code: "P2025" });
    });
    sharedFake.on("$transaction", async (arg: unknown) => {
      if (typeof arg === "function") return await (arg as (tx: unknown) => Promise<unknown>)(sharedFake.prisma);
      return arg;
    });
    await expect(callDel({ id: "1" })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("admin/comments/[id].delete:响应 shape", () => {
  test("成功 → 只含 success(防泄漏 cid 内部 id)", async () => {
    sharedFake.on("comments", "findUnique", async () => ({ coid: 1, cid: 10, status: 1 }));
    sharedFake.on("contents", "update", async () => ({}));
    sharedFake.on("comments", "delete", async () => ({}));
    sharedFake.on("$transaction", async (arg: unknown) => {
      if (typeof arg === "function") return await (arg as (tx: unknown) => Promise<unknown>)(sharedFake.prisma);
      return arg;
    });
    const r = await callDel({ id: "1" }) as Record<string, unknown>;
    expect(Object.keys(r).sort()).toEqual(["success"]);
  });
});