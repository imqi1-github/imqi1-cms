/**
 * server/api/admin/links/[id]/{toggle,approve-modification}.patch.ts:
 *  - 共用:CSRF/auth/路由参数(id 非正整数)校验
 *  - toggle:findUnique→updateMany 条件式原子翻转;并发竞态 409
 *  - approve-modification:action 校验 + isModification/originalLinkId 守卫 +
 *    approve 事务(更新原友链 + 删除修改请求)/reject 仅删除
 *
 * 放 zz-late/:mock shared 模块(auth/csrf/prisma/content-cache)
 */
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

let getUserImpl: (e: unknown) => Promise<unknown>;
let validateCsrfImpl: (e: unknown, t?: unknown) => boolean;

beforeEach(() => {
  getUserImpl = async () => ({ uid: 1 });
  validateCsrfImpl = () => true;
  mock.module("#server/lib/auth", () => ({
    getUser: async (e: unknown) => getUserImpl(e),
  }));
  mock.module("#server/utils/csrf", () => ({
    validateCsrfToken: (e: unknown, t: unknown) => validateCsrfImpl(e, t),
    ensureCsrfToken: () => "csrf-yes",
    getStoredCsrfToken: () => null,
    setCsrfToken: () => "csrf-yes",
    generateCsrfToken: () => "csrf-yes",
  }));
  mock.module("#server/utils/content-cache", () => ({
    invalidateContentCaches: async () => ({}),
  }));
});

const { default: toggleHandler } = await import("#server/api/admin/links/[id]/toggle.patch");
const { default: approveHandler } = await import("#server/api/admin/links/[id]/approve-modification.patch");

function makeEvent(method: string, params: Record<string, string>, body?: unknown) {
  return {
    method,
    path: `/api/admin/links/${params.id ?? ""}`,
    context: { params },
    _requestBody: body === undefined ? undefined : JSON.stringify(body),
    node: {
      req: {
        method,
        url: `/api/admin/links/${params.id ?? ""}`,
        headers: body === undefined ? {} : { "content-type": "application/json" },
      },
      res: { setHeader() {}, getHeader: () => undefined, getHeaders: () => ({}) },
    },
  };
}

function callPatch(handler: (e: never) => Promise<unknown>, params: Record<string, string>, body?: unknown) {
  return handler(makeEvent("PATCH", params, body) as never);
}

describe("admin links/[id]/toggle.patch", () => {
  test("未登录 → 401", async () => {
    getUserImpl = async () => null;
    await expect(callPatch(toggleHandler, { id: "1" }, { csrfToken: "x" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("缺 id → 400", async () => {
    await expect(callPatch(toggleHandler, {}, { csrfToken: "x" })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("id 非整数 → 400", async () => {
    await expect(callPatch(toggleHandler, { id: "abc" }, { csrfToken: "x" })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("CSRF 失败 → 403", async () => {
    validateCsrfImpl = () => false;
    await expect(callPatch(toggleHandler, { id: "1" }, { csrfToken: "x" })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("链接不存在 → 404", async () => {
    sharedFake.on("links", "findUnique", async () => null);
    await expect(callPatch(toggleHandler, { id: "99" }, { csrfToken: "x" })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("正常 enabled=true → enabled 翻转 + 返 {id, enabled}", async () => {
    sharedFake.on("links", "findUnique", async () => ({ id: 1, enabled: true }));
    sharedFake.on("links", "updateMany", async ({ where, data }: { where: { id: number; enabled: boolean }; data: { enabled: boolean } }) => {
      expect(where.enabled).toBe(true);
      expect(data.enabled).toBe(false);
      return { count: 1 };
    });
    const res = await callPatch(toggleHandler, { id: "1" }, { csrfToken: "x" }) as { id: number; enabled: boolean };
    expect(res).toEqual({ id: 1, enabled: false });
  });

  test("正常 enabled=false → enabled 翻转 true", async () => {
    sharedFake.on("links", "findUnique", async () => ({ id: 2, enabled: false }));
    sharedFake.on("links", "updateMany", async ({ data }) => ({ count: 1, data }));
    const res = await callPatch(toggleHandler, { id: "2" }, { csrfToken: "x" }) as { enabled: boolean };
    expect(res.enabled).toBe(true);
  });

  test("updateMany count=0(并发竞态)→ 409 '链接状态已更新'", async () => {
    sharedFake.on("links", "findUnique", async () => ({ id: 1, enabled: true }));
    sharedFake.on("links", "updateMany", async () => ({ count: 0 }));
    await expect(callPatch(toggleHandler, { id: "1" }, { csrfToken: "x" })).rejects.toMatchObject({ statusCode: 409 });
  });

  test("updateMany 抛 P2025(并发删除)→ 404", async () => {
    sharedFake.on("links", "findUnique", async () => ({ id: 1, enabled: true }));
    sharedFake.on("links", "updateMany", async () => {
      throw Object.assign(new Error("P2025"), { code: "P2025" });
    });
    await expect(callPatch(toggleHandler, { id: "1" }, { csrfToken: "x" })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("admin links/[id]/approve-modification.patch", () => {
  test("action 非法 → 400", async () => {
    await expect(callPatch(approveHandler, { id: "1" }, { csrfToken: "x", action: "bogus" })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("链接不存在 → 404", async () => {
    sharedFake.on("links", "findUnique", async () => null);
    await expect(callPatch(approveHandler, { id: "99" }, { csrfToken: "x", action: "approve" })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("不是修改请求(isModification=false)→ 400", async () => {
    sharedFake.on("links", "findUnique", async () => ({
      id: 1, name: "n", link: "l", desc: null, avatar: null,
      originalLinkId: 1, isModification: false,
    }));
    await expect(callPatch(approveHandler, { id: "1" }, { csrfToken: "x", action: "approve" })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("缺 originalLinkId → 400", async () => {
    sharedFake.on("links", "findUnique", async () => ({
      id: 1, name: "n", link: "l", desc: null, avatar: null,
      originalLinkId: null, isModification: true,
    }));
    await expect(callPatch(approveHandler, { id: "1" }, { csrfToken: "x", action: "approve" })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("approve → 事务更新原友链 + 删除修改请求", async () => {
    sharedFake.on("links", "findUnique", async () => ({
      id: 5, name: "new", link: "https://new", desc: "new d", avatar: "av",
      originalLinkId: 1, isModification: true,
    }));
    const calls: { method: string; args: unknown }[] = [];
    sharedFake.on("$transaction", async (fn: (tx: unknown) => Promise<unknown>) => {
      calls.push({ method: "$transaction", args: [fn] });
      // 回调内部调 tx.links.update + tx.links.delete,假 prisma 直接调 sharedFake.prisma
      return await fn(sharedFake.prisma);
    });
    sharedFake.on("links", "update", async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
      calls.push({ method: "update", args: { where, data } });
      return { id: where.id, ...data };
    });
    sharedFake.on("links", "delete", async ({ where }: { where: { id: number } }) => {
      calls.push({ method: "delete", args: where });
      return { id: where.id };
    });
    const res = await callPatch(approveHandler, { id: "5" }, { csrfToken: "x", action: "approve" }) as { success: boolean; message: string };
    expect(res.success).toBe(true);
    expect(res.message).toContain("已批准");
    // 关键:事务被调 + update+delete 都被调
    expect(calls.some(c => c.method === "$transaction")).toBe(true);
    expect(calls.some(c => c.method === "update" && (c.args as { where: { id: number } }).where.id === 1)).toBe(true);
    expect(calls.some(c => c.method === "delete" && (c.args as { id: number }).id === 5)).toBe(true);
  });

  test("reject → 仅删除修改请求,不动原友链", async () => {
    sharedFake.on("links", "findUnique", async () => ({
      id: 5, name: "x", link: "y", desc: null, avatar: null,
      originalLinkId: 1, isModification: true,
    }));
    let updateCalls = 0;
    let deleteCalls = 0;
    sharedFake.on("links", "update", async () => { updateCalls++; return {}; });
    sharedFake.on("links", "delete", async () => { deleteCalls++; return {}; });
    const res = await callPatch(approveHandler, { id: "5" }, { csrfToken: "x", action: "reject" }) as { success: boolean; message: string };
    expect(res.success).toBe(true);
    expect(res.message).toContain("已拒绝");
    expect(updateCalls).toBe(0); // 关键:不动原友链
    expect(deleteCalls).toBe(1);
  });

  test("approve 抛 P2025 → 404 '原友链或修改请求不存在'", async () => {
    sharedFake.on("links", "findUnique", async () => ({
      id: 5, name: "x", link: "y", desc: null, avatar: null,
      originalLinkId: 1, isModification: true,
    }));
    sharedFake.on("$transaction", async () => {
      throw Object.assign(new Error("P2025"), { code: "P2025" });
    });
    const origErr = console.error;
    console.error = () => {};
    try {
      await expect(callPatch(approveHandler, { id: "5" }, { csrfToken: "x", action: "approve" })).rejects.toMatchObject({ statusCode: 404 });
    } finally {
      console.error = origErr;
    }
  });
});