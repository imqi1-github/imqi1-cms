/**
 * server/api/admin/detailed-stats.get.ts 集成测:
 *  - 已有 admin-system-get.test.ts 覆盖基础 happy;本文件补内容侧断言 + 异常分支
 *  - 内容分类分布(type/status) + 当月新增 + 草稿 / 草稿页 / 月评论
 */
import { describe, expect, test } from "bun:test";

import { callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { sharedFake } from "#test/helpers/fake-prisma";

const handler = (await import("#server/api/admin/detailed-stats.get")).default;

describe("admin/detailed-stats.get(详细统计)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(handler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("成功 → 返回 contents/pages/comments/categories/tags/users 完整树", async () => {
    sharedFake.on("contents", "count", async (args?: { where?: Record<string, unknown> }) => {
      const w = args?.where ?? {};
      if (w.type === 1) return 5;
      if (w.type === 0 && w.status === 1) return 8;
      if (w.type === 0 && w.status === 0) return 2;
      if (w.type === 0 && (w as { create_time?: unknown }).create_time !== undefined) return 3;
      return 10;
    });
    sharedFake.on("comments", "count", async (args?: { where?: Record<string, unknown> }) => {
      const w = args?.where ?? {};
      if (w.status === 0) return 4;
      if ((w as { create_time?: unknown }).create_time !== undefined) return 6;
      return 30;
    });
    sharedFake.on("users", "count", async () => 1);
    sharedFake.on("metas", "count", async (args: { where: { type: string } }) =>
      args.where.type === "category" ? 4 : 7);

    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, { method: "GET", cookie }) as {
      contents: { total: number; published: number; draft: number; thisMonth: number };
      pages: { total: number };
      comments: { total: number; pending: number; thisMonth: number };
      categories: { total: number };
      tags: { total: number };
      users: { total: number; online: number };
    };
    expect(r.contents).toEqual({ total: 10, published: 8, draft: 2, thisMonth: 3 });
    expect(r.pages).toEqual({ total: 5 });
    expect(r.comments).toEqual({ total: 30, pending: 4, thisMonth: 6 });
    expect(r.categories).toEqual({ total: 4 });
    expect(r.tags).toEqual({ total: 7 });
    expect(r.users.total).toBe(1);
    expect(r.users.online).toBe(0);
  });

  test("DB 异常 → 500(泛化文案,不泄漏内部细节)", async () => {
    sharedFake.on("contents", "count", async () => { throw new Error("relation timeout"); });
    sharedFake.on("comments", "count", async () => 1);
    sharedFake.on("users", "count", async () => 1);
    sharedFake.on("metas", "count", async () => 1);
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, { method: "GET", cookie })).rejects.toMatchObject({ statusCode: 500 });
  });
});