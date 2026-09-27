/**
 * admin/contents/[cid].delete 补测:
 *  - 401/CSRF/400 守卫(已有覆盖)
 *  - 删除时 affectedAttachments 空数组 → 不调 deleteOrphanAttachments
 *  - 删完返回 { success: true } 不含 cid(防泄漏)
 *  - 路由参数 cid 缺失 → 400
 *  - 字符串 cid(非数字)→ 400
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();
// deleteOrphanAttachments stub:记录是否被调
let deleteOrphanCalls = 0;
mock.module("#server/utils/attachment-cleanup", () => ({
  deleteOrphanAttachments: async () => {
    deleteOrphanCalls++;
    return 0;
  },
}));

// content-cache stub:invalidateContentCaches 是 best-effort,真实现会异步触发 scan
mock.module("#server/utils/content-cache", () => ({
  invalidateContentCaches: async () => ({}),
}));

const handler = (await import("#server/api/admin/contents/[cid].delete")).default;

beforeEach(() => {
  deleteOrphanCalls = 0;
});

async function cookie(): Promise<string> {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

describe("admin/contents/[cid].delete 边界补测", () => {
  // DELETE 接口 CSRF 走 header(x-csrf-token),不在 body
  async function callDel(opts: { cid?: string } = {}) {
    const params: Record<string, string> = {};
    if (opts.cid !== undefined) params.cid = opts.cid;
    return callAdmin(handler, {
      method: "DELETE",
      params,
      cookie: await cookie(),
      body: {},
      headers: { "x-csrf-token": CSRF_TOKEN },
    });
  }

  test("cid 缺省 → 400", async () => {
    await expect(callDel()).rejects.toMatchObject({ statusCode: 400 });
  });

  test("cid 非正整数 → 400(包含 0 与 abc)", async () => {
    for (const bad of ["0", "-1", "abc"]) {
      await expect(callDel({ cid: bad })).rejects.toMatchObject({ statusCode: 400 });
    }
  });

  test("cid 非数字字符(数字后带字母) → 400", async () => {
    await expect(callDel({ cid: "1a" })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("成功 → 返回 success:true,且 deleteOrphanAttachments 被调", async () => {
    sharedFake.on("contentattachments", "findMany", async () => [{ aid: 1 }, { aid: 2 }]);
    sharedFake.on("contents", "delete", async () => ({}));
    const r = (await callDel({ cid: "1" })) as { success: boolean };
    expect(r.success).toBe(true);
    expect(deleteOrphanCalls).toBe(1);
  });

  test("无关联附件 → deleteOrphanAttachments 仍被调(空数组,不抛)", async () => {
    sharedFake.on("contentattachments", "findMany", async () => []);
    sharedFake.on("contents", "delete", async () => ({}));
    const r = (await callDel({ cid: "1" })) as { success: boolean };
    expect(r.success).toBe(true);
    expect(deleteOrphanCalls).toBe(1);
  });

  test("响应只含 success,不回传 cid / 内部字段", async () => {
    sharedFake.on("contents", "delete", async () => ({}));
    sharedFake.on("contentattachments", "findMany", async () => []);
    const r = (await callDel({ cid: "1" })) as Record<string, unknown>;
    expect(Object.keys(r).sort()).toEqual(["success"]);
  });
});

describe("admin/contents/[cid].delete:CSRF 走 DELETE 头路径", () => {
  test("CSRF 缺失(无 header)→ 403", async () => {
    const session = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "DELETE",
      params: { cid: "1" },
      cookie: session,
      body: {},
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("未登录 + CSRF 错误 → 401 优先于 403", async () => {
    await expect(callAdmin(handler, {
      method: "DELETE",
      params: { cid: "1" },
      cookie: CSRF_COOKIE,
      body: {},
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 401 });
  });
});