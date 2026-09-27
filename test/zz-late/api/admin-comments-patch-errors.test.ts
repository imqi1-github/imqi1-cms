import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/admin/comments/[id].patch")).default;

describe("admin/comments/[id].patch 错误路径", () => {
  test("评论不存在(老评论被并发删除)→ 404", async () => {
    sharedFake.on("comments", "findUnique", async () => null);
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "999" },
      body: { csrfToken: CSRF_TOKEN, status: 1 },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("P2025(并发更新竞态)→ 404", async () => {
    sharedFake.on("comments", "findUnique", async () => ({ coid: 1, cid: 10, status: 1 }));
    sharedFake.on("comments", "update", async () => {
      throw Object.assign(new Error("not found"), { code: "P2025" });
    });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, content: "新内容" },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("非字符串字段(name=数字) → 400(避免 Prisma 打 500)", async () => {
    sharedFake.on("comments", "findUnique", async () => ({ coid: 1, cid: 10, status: 1 }));
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, name: 12345 },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("status 非法值(字符串/3/-1)→ 400", async () => {
    sharedFake.on("comments", "findUnique", async () => ({ coid: 1, cid: 10, status: 1 }));
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, status: "abc" },
    })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(handler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, status: 5 },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("状态由 0→1 → 文章 comment_num 增 1(计数同步)", async () => {
    sharedFake.on("comments", "findUnique", async () => ({ coid: 1, cid: 10, status: 0 }));
    sharedFake.on("comments", "update", async ({ data }: { data: { status?: number } }) =>
      ({ coid: 1, cid: 10, status: data.status ?? 0, name: "x", link: null, content: "c", create_time: new Date(), parent_id: null, content_ref: null }));
    const counterUpdates: Array<{ data: unknown }> = [];
    sharedFake.on("contents", "update", async ({ data }: { data: unknown }) => {
      counterUpdates.push({ data });
      return {};
    });
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, status: 1 },
    }) as { success: boolean };
    expect(r.success).toBe(true);
    expect(counterUpdates[0]!.data).toEqual({ comment_num: { increment: 1 } });
  });

  test("状态由 1→0 → 文章 comment_num 减 1", async () => {
    sharedFake.on("comments", "findUnique", async () => ({ coid: 1, cid: 10, status: 1 }));
    sharedFake.on("comments", "update", async ({ data }: { data: { status?: number } }) =>
      ({ coid: 1, cid: 10, status: data.status ?? 0, name: "x", link: null, content: "c", create_time: new Date(), parent_id: null, content_ref: null }));
    const counterUpdates: Array<{ data: unknown }> = [];
    sharedFake.on("contents", "update", async ({ data }: { data: unknown }) => {
      counterUpdates.push({ data });
      return {};
    });
    const cookie = await loginSessionCookie();
    await callAdmin(handler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, status: 0 },
    });
    expect(counterUpdates[0]!.data).toEqual({ comment_num: { decrement: 1 } });
  });

  test("未知异常 → 500", async () => {
    sharedFake.on("comments", "findUnique", async () => ({ coid: 1, cid: 10, status: 1 }));
    sharedFake.on("comments", "update", async () => { throw new Error("db boom"); });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, content: "x" },
    })).rejects.toMatchObject({ statusCode: 500 });
  });
});