/**
 * admin/contents/batch-delete.post 补测:
 *  - ids 缺省/非数组/空数组 → 400
 *  - ids 含非数字/0/负数 → 400(过滤后空)
 *  - 重复 id 自动去重(Set)
 *  - 成功:返回 success + count + message
 *  - 含非法类型(boolean)被滤掉;最终 cidList 为有效正整数集合
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// 给事务内 4 个 deleteMany/findMany 注册假件
sharedFake.on("contentattachments", "findMany", async () => []);
sharedFake.on("contentrelations", "deleteMany", async () => ({ count: 0 }));
sharedFake.on("contentattachments", "deleteMany", async () => ({ count: 0 }));
sharedFake.on("comments", "deleteMany", async () => ({ count: 0 }));
sharedFake.on("contents", "deleteMany", async () => ({ count: 0 }));

let deleteOrphanCalls = 0;
mock.module("#server/utils/attachment-cleanup", () => ({
  deleteOrphanAttachments: async () => {
    deleteOrphanCalls++;
    return 0;
  },
}));
mock.module("#server/utils/content-cache", () => ({
  invalidateContentCaches: async () => ({}),
}));

const handler = (await import("#server/api/admin/contents/batch-delete.post")).default;

beforeEach(() => {
  deleteOrphanCalls = 0;
});

async function cookie(): Promise<string> {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

describe("admin/contents/batch-delete.post 边界补测", () => {
  test("ids 缺省 → 400", async () => {
    await expect(callAdmin(handler, {
      method: "POST",
      body: { csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400, message: "请选择要删除的文章" });
  });

  test("ids 非数组(字符串) → 400", async () => {
    await expect(callAdmin(handler, {
      method: "POST",
      body: { csrfToken: CSRF_TOKEN, ids: "1,2,3" },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("ids 空数组 → 400(避免「删 0 篇」歧义)", async () => {
    await expect(callAdmin(handler, {
      method: "POST",
      body: { csrfToken: CSRF_TOKEN, ids: [] },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400, message: "请选择要删除的文章" });
  });

  test("ids 含 0 / 负数 / 非整数 → 过滤后空 → 400", async () => {
    await expect(callAdmin(handler, {
      method: "POST",
      body: { csrfToken: CSRF_TOKEN, ids: [0, -1, 1.5] },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400, message: "文章 ID 无效" });
  });

  test("ids 含非数字类型(字符串/null/对象)→ 被过滤", async () => {
    await expect(callAdmin(handler, {
      method: "POST",
      body: { csrfToken: CSRF_TOKEN, ids: ["abc", null, {}, 5] },
      cookie: await cookie(),
    })).resolves.toMatchObject({ success: true, count: 1 });
  });

  test("ids 含重复 id 自动去重(Set)", async () => {
    await expect(callAdmin(handler, {
      method: "POST",
      body: { csrfToken: CSRF_TOKEN, ids: [1, 2, 1, 2, 1] },
      cookie: await cookie(),
    })).resolves.toMatchObject({ success: true, count: 2 });
  });

  test("成功 → 返回 success/count/message,deleteOrphanAttachments 被调", async () => {
    deleteOrphanCalls = 0;
    sharedFake.on("contentattachments", "findMany", async () => [{ aid: 1 }, { aid: 2 }]);
    const r = (await callAdmin(handler, {
      method: "POST",
      body: { csrfToken: CSRF_TOKEN, ids: [1, 2, 3] },
      cookie: await cookie(),
    })) as { success: boolean; count: number; message: string };
    expect(r.success).toBe(true);
    expect(r.count).toBe(3);
    expect(r.message).toContain("3");
    expect(deleteOrphanCalls).toBe(1);
  });

  test("成功响应里不带 cid 列表(防泄漏数据范围)", async () => {
    const r = (await callAdmin(handler, {
      method: "POST",
      body: { csrfToken: CSRF_TOKEN, ids: [1] },
      cookie: await cookie(),
    })) as Record<string, unknown>;
    expect(Object.keys(r).sort()).toEqual(["count", "message", "success"]);
  });
});