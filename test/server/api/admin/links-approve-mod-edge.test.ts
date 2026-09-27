/**
 * admin/links/[id]/approve-modification.patch 补测:
 *  - 401/CSRF/400 守卫
 *  - 404 修改请求不存在
 *  - 400 不是修改请求
 *  - 400 缺少原友链ID
 *  - 400 action 非法值(非 approve/reject)
 *  - approve:更新原友链 + 删除修改请求(原子事务)
 *  - reject:仅删除修改请求
 *  - 响应含 success + message
 */
import { describe, expect, mock, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();
mock.module("#server/utils/content-cache", () => ({ invalidateContentCaches: async () => ({}) }));

const handler = (await import("#server/api/admin/links/[id]/approve-modification.patch")).default;

// 默认 $transaction 透传到函数形式
sharedFake.on("$transaction", async (arg: unknown) => {
  if (typeof arg === "function") return await (arg as (tx: unknown) => Promise<unknown>)(sharedFake.prisma);
  return arg;
});

async function cookie(): Promise<string> {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

async function callApprove(opts: { id?: string; body?: Record<string, unknown>; cookie?: string }) {
  const params: Record<string, string> = {};
  if (opts.id !== undefined) params.id = opts.id;
  return callAdmin(handler, {
    method: "PATCH",
    params,
    body: { csrfToken: CSRF_TOKEN, action: "approve", ...(opts.body ?? {}) },
    cookie: opts.cookie ?? await cookie(),
  });
}

describe("admin/links/[id]/approve-modification 守卫", () => {
  test("未登录 → 401", async () => {
    await expect(callApprove({ id: "1", cookie: "" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const session = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PATCH",
      params: { id: "1" },
      body: { action: "approve" },
      cookie: session,
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("id 缺省 → 400", async () => {
    await expect(callApprove({})).rejects.toMatchObject({ statusCode: 400 });
  });

  test("id 非正整数 → 400(0/负数/abc)", async () => {
    for (const bad of ["0", "-1", "abc"]) {
      await expect(callApprove({ id: bad })).rejects.toMatchObject({ statusCode: 400 });
    }
  });

  test("action 缺省 → 400", async () => {
    sharedFake.on("links", "findUnique", async () => ({ id: 1, name: "x", link: "https://x", desc: null, avatar: null, originalLinkId: 5, isModification: true }));
    await expect(callApprove({ id: "1", body: { action: undefined } })).rejects.toMatchObject({ statusCode: 400, message: "无效的操作" });
  });

  test("action 非法值(其它字符串/数字)→ 400", async () => {
    sharedFake.on("links", "findUnique", async () => ({ id: 1, name: "x", link: "https://x", desc: null, avatar: null, originalLinkId: 5, isModification: true }));
    for (const bad of ["approve ", "Approve", "delete", 123, true, null]) {
      await expect(callApprove({ id: "1", body: { action: bad } })).rejects.toMatchObject({ statusCode: 400 });
    }
  });
});

describe("admin/links/[id]/approve-modification 业务逻辑", () => {
  test("修改请求不存在 → 404", async () => {
    sharedFake.on("links", "findUnique", async () => null);
    await expect(callApprove({ id: "999" })).rejects.toMatchObject({ statusCode: 404, message: "修改请求不存在" });
  });

  test("找到的友链 isModification=false → 400(不是修改请求)", async () => {
    sharedFake.on("links", "findUnique", async () => ({ id: 1, name: "x", link: "https://x", desc: null, avatar: null, originalLinkId: 5, isModification: false }));
    await expect(callApprove({ id: "1" })).rejects.toMatchObject({ statusCode: 400, message: "这不是一个修改请求" });
  });

  test("isModification=true 但 originalLinkId=null → 400 缺少原友链ID", async () => {
    sharedFake.on("links", "findUnique", async () => ({ id: 1, name: "x", link: "https://x", desc: null, avatar: null, originalLinkId: null, isModification: true }));
    await expect(callApprove({ id: "1" })).rejects.toMatchObject({ statusCode: 400, message: "缺少原友链ID" });
  });

  test("approve → 事务内更新原友链 + 删除修改请求", async () => {
    sharedFake.on("links", "findUnique", async () => ({ id: 1, name: "新名", link: "https://new", desc: "新 desc", avatar: null, originalLinkId: 5, isModification: true }));
    const updates: Array<{ where: { id: number }; data: Record<string, unknown> }> = [];
    sharedFake.on("links", "update", async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
      updates.push({ where, data });
      return { id: where.id, ...data };
    });
    const deletes: number[] = [];
    sharedFake.on("links", "delete", async ({ where }: { where: { id: number } }) => {
      deletes.push(where.id);
      return {};
    });
    const r = await callApprove({ id: "1", body: { action: "approve" } }) as { success: boolean; message: string };
    expect(r.success).toBe(true);
    expect(r.message).toContain("已批准");
    expect(updates).toHaveLength(1);
    expect(updates[0]!.where.id).toBe(5); // 更新原友链(5),不是修改请求(1)
    expect(deletes).toEqual([1]); // 删除修改请求
  });

  test("reject → 仅删除修改请求,不更新原友链", async () => {
    sharedFake.on("links", "findUnique", async () => ({ id: 1, name: "新名", link: "https://new", desc: "新 desc", avatar: null, originalLinkId: 5, isModification: true }));
    const updates: unknown[] = [];
    sharedFake.on("links", "update", async () => {
      updates.push({});
      return {};
    });
    const deletes: number[] = [];
    sharedFake.on("links", "delete", async ({ where }: { where: { id: number } }) => {
      deletes.push(where.id);
      return {};
    });
    const r = await callApprove({ id: "1", body: { action: "reject" } }) as { success: boolean; message: string };
    expect(r.success).toBe(true);
    expect(r.message).toContain("已拒绝");
    expect(updates).toHaveLength(0); // 不调用 update
    expect(deletes).toEqual([1]); // 仅删除修改请求
  });
});

describe("admin/links/[id]/approve-modification:并发兜底", () => {
  test("原友链已被删(P2025)→ 404 而非 500", async () => {
    sharedFake.on("links", "findUnique", async () => ({ id: 1, name: "新名", link: "https://new", desc: null, avatar: null, originalLinkId: 5, isModification: true }));
    sharedFake.on("links", "update", async () => {
      throw Object.assign(new Error("not found"), { code: "P2025" });
    });
    await expect(callApprove({ id: "1", body: { action: "approve" } })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("admin/links/[id]/approve-modification:响应 shape", () => {
  test("approve → 含 success + message(不泄漏 id/原友链)", async () => {
    sharedFake.on("links", "findUnique", async () => ({ id: 1, name: "x", link: "https://x", desc: null, avatar: null, originalLinkId: 5, isModification: true }));
    sharedFake.on("links", "update", async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => ({ id: where.id, ...data }));
    sharedFake.on("links", "delete", async () => ({}));
    const r = (await callApprove({ id: "1", body: { action: "approve" } })) as Record<string, unknown>;
    expect(Object.keys(r).sort()).toEqual(["message", "success"]);
  });
});