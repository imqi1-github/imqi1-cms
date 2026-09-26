import { beforeEach, describe, expect, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { CSRF_HEADER } from "#shared/constants";

const fakePrisma = await import("#test/helpers/fake-prisma");

// comments 表假件 + 联动 contents.comment_num 计数
const commentRows: Array<Record<string, unknown>> = [];
const commentUpdates: Array<{ coid: number, data: Record<string, unknown> }> = [];
const commentDeletes: number[] = [];
const contentUpdates: Array<{ cid: number, data: Record<string, unknown> }> = [];
const batchDeleted: Array<{ coid: { in: number[] } }> = [];

commentRows.push({ coid: 1, cid: 100, status: 1, name: "原", mail: null, content: "x" });
commentRows.push({ coid: 2, cid: 100, status: 0, name: "待审", mail: null, content: "y" });
commentRows.push({ coid: 3, cid: 101, status: 1, name: "已发", mail: null, content: "z" });

fakePrisma.sharedFake.on("comments", "findUnique", async ({ where }: { where: { coid: number } }) =>
  commentRows.find(c => c.coid === where.coid) ?? null);
fakePrisma.sharedFake.on("comments", "update", async ({ where, data }: { where: { coid: number }, data: Record<string, unknown> }) => {
  const row = commentRows.find(c => c.coid === where.coid);
  if (!row) throw Object.assign(new Error("P2025"), { code: "P2025" });
  commentUpdates.push({ coid: where.coid, data });
  // 注意:不 Object.assign 改 row.status — 让 source 用 oldComment.status 判定「状态变化」
  return { ...row, ...data, content_ref: undefined };
});
fakePrisma.sharedFake.on("comments", "delete", async ({ where }: { where: { coid: number } }) => {
  const i = commentRows.findIndex(c => c.coid === where.coid);
  if (i === -1) throw Object.assign(new Error("P2025"), { code: "P2025" });
  commentDeletes.push(where.coid);
  commentRows.splice(i, 1);
  return {};
});
fakePrisma.sharedFake.on("comments", "findMany", async ({ where }: { where?: { coid?: { in?: number[] } } } = {}) => {
  if (where?.coid?.in) return commentRows.filter(c => where.coid!.in!.includes(c.coid as number)).map(c => ({ ...c }));
  return [];
});
fakePrisma.sharedFake.on("comments", "deleteMany", async ({ where }: { where: { coid: { in: number[] } } }) => {
  batchDeleted.push(where);
  const ids = where.coid.in;
  // 只删行 + 返回 count;联动计数由 source 自己通过 tx.contents.update 推送,不在此重复
  for (let i = commentRows.length - 1; i >= 0; i--) {
    if (ids.includes(commentRows[i]!.coid as number)) commentRows.splice(i, 1);
  }
  return { count: ids.length };
});

fakePrisma.sharedFake.on("contents", "update", async ({ where, data }: { where: { cid: number }, data: Record<string, unknown> }) => {
  contentUpdates.push({ cid: where.cid, data });
  return {};
});

const patchHandler = (await import("#server/api/admin/comments/[id].patch")).default;
const deleteHandler = (await import("#server/api/admin/comments/[id].delete")).default;
const batchDeleteHandler = (await import("#server/api/admin/comments/batch-delete.post")).default;

async function cookie() {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

beforeEach(() => {
  commentRows.length = 0;
  commentRows.push({ coid: 1, cid: 100, status: 1, name: "原", mail: null, content: "x" });
  commentRows.push({ coid: 2, cid: 100, status: 0, name: "待审", mail: null, content: "y" });
  commentRows.push({ coid: 3, cid: 101, status: 1, name: "已发", mail: null, content: "z" });
  commentUpdates.length = 0;
  commentDeletes.length = 0;
  contentUpdates.length = 0;
  batchDeleted.length = 0;
});

describe("comments/[id].patch(编辑/审核)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(patchHandler, {
      method: "PATCH",
      params: { id: "1" },
      cookie: CSRF_COOKIE,
      body: { name: "x", csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    await expect(callAdmin(patchHandler, {
      method: "PATCH",
      params: { id: "1" },
      body: { name: "x" },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("非法 coid → 400", async () => {
    await expect(callAdmin(patchHandler, {
      method: "PATCH",
      params: { id: "abc" },
      body: { name: "x", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("评论不存在 → 404", async () => {
    await expect(callAdmin(patchHandler, {
      method: "PATCH",
      params: { id: "999" },
      body: { name: "x", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow();
  });

  test("name 非字符串 → 400", async () => {
    await expect(callAdmin(patchHandler, {
      method: "PATCH",
      params: { id: "1" },
      body: { name: 123, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/格式错误/);
  });

  test("status 非法值(字符串)→ 400", async () => {
    await expect(callAdmin(patchHandler, {
      method: "PATCH",
      params: { id: "1" },
      body: { status: "abc", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/非法/);
  });

  test("status 越界(3)→ 400", async () => {
    await expect(callAdmin(patchHandler, {
      method: "PATCH",
      params: { id: "1" },
      body: { status: 3, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/非法/);
  });

  test("成功:仅更新 name,不动 status", async () => {
    const r = await callAdmin(patchHandler, {
      method: "PATCH",
      params: { id: "1" },
      body: { name: "新名", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    }) as { success: boolean, data: { coid: number } };
    expect(r.success).toBe(true);
    expect(r.data.coid).toBe(1);
    expect(contentUpdates).toHaveLength(0);
  });

  test("审核通过:status 0→1 → 文章计数 +1", async () => {
    await callAdmin(patchHandler, {
      method: "PATCH",
      params: { id: "2" },
      body: { status: 1, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    });
    expect(contentUpdates).toContainEqual({ cid: 100, data: { comment_num: { increment: 1 } } });
  });

  test("已发布评论重新设置 status 1(无变化)→ 不联动计数", async () => {
    await callAdmin(patchHandler, {
      method: "PATCH",
      params: { id: "1" },
      body: { status: 1, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    });
    expect(contentUpdates).toHaveLength(0);
  });

  test("取消发布:status 1→0 → 文章计数 -1", async () => {
    await callAdmin(patchHandler, {
      method: "PATCH",
      params: { id: "1" },
      body: { status: 0, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    });
    expect(contentUpdates).toContainEqual({ cid: 100, data: { comment_num: { decrement: 1 } } });
  });

  test("改为待审(status 2)→ 计数 -1(从已发布下来)", async () => {
    await callAdmin(patchHandler, {
      method: "PATCH",
      params: { id: "1" },
      body: { status: 2, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    });
    expect(contentUpdates).toContainEqual({ cid: 100, data: { comment_num: { decrement: 1 } } });
  });
});

describe("comments/[id].delete(删除)", () => {
  test("CSRF header 缺失 → 403", async () => {
    await expect(callAdmin(deleteHandler, {
      method: "DELETE",
      params: { id: "1" },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("非法 coid → 400", async () => {
    await expect(callAdmin(deleteHandler, {
      method: "DELETE",
      params: { id: "abc" },
      cookie: await cookie(),
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("评论不存在 → 404", async () => {
    await expect(callAdmin(deleteHandler, {
      method: "DELETE",
      params: { id: "999" },
      cookie: await cookie(),
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    })).rejects.toThrow();
  });

  test("成功删除已发布评论 → 联动计数 -1", async () => {
    const r = await callAdmin(deleteHandler, {
      method: "DELETE",
      params: { id: "1" },
      cookie: await cookie(),
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    }) as { success: boolean };
    expect(r.success).toBe(true);
    expect(commentDeletes).toEqual([1]);
    expect(contentUpdates).toContainEqual({ cid: 100, data: { comment_num: { decrement: 1 } } });
  });

  test("删除待审评论 → 不联动计数", async () => {
    await callAdmin(deleteHandler, {
      method: "DELETE",
      params: { id: "2" },
      cookie: await cookie(),
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    });
    expect(commentDeletes).toEqual([2]);
    expect(contentUpdates).toHaveLength(0);
  });
});

describe("comments/batch-delete.post", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(batchDeleteHandler, {
      method: "POST",
      cookie: CSRF_COOKIE,
      body: { ids: [1], csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    await expect(callAdmin(batchDeleteHandler, {
      method: "POST",
      body: { ids: [1] },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("成功批量删除 → 已发布评论联动计数", async () => {
    const r = await callAdmin(batchDeleteHandler, {
      method: "POST",
      body: { ids: [1, 3], csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    }) as { success: boolean, count: number, message: string };
    expect(r.success).toBe(true);
    expect(r.count).toBe(2);
    expect(contentUpdates.length).toBe(2);
    expect(contentUpdates.filter(u => (u.data as { comment_num: { decrement: number } }).comment_num.decrement === 1))
      .toHaveLength(2);
  });
});
