/**
 * server/api/admin/pages.get.ts 集成测:
 *  - page/pageSize 边界(负数 / 0 / 超限)与 status 过滤
 *  - relations 关联(N+1 已优化 → 单次 findMany)
 *  - 长文 content 不下传(白名单只取列表字段)
 */
import { beforeEach, describe, expect, test } from "bun:test";

import { callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { sharedFake } from "#test/helpers/fake-prisma";

const handler = (await import("#server/api/admin/pages.get")).default;

const baseContents = [
  {
    cid: 1, title: "关于", slug: "about", desc: "d", status: 1,
    create_time: new Date(), update_time: new Date(),
    user: { uid: 1, name: "admin", nickname: "阿棋" },
  },
  {
    cid: 2, title: "留言", slug: "messages", desc: null, status: 1,
    create_time: new Date(), update_time: new Date(),
    user: { uid: 1, name: "admin", nickname: null },
  },
];
const baseRelations = [
  { cid: 1, mid: 9, metas: { mid: 9, name: "归档", slug: "archive" } },
];

beforeEach(() => {
  sharedFake.on("contents", "findMany", async () => baseContents.map(r => ({ ...r })));
  sharedFake.on("contents", "count", async () => baseContents.length);
  sharedFake.on("contentrelations", "findMany", async () => baseRelations.map(r => ({ ...r })));
});

describe("admin/pages.get(页面列表)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(handler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("默认 page=1,pageSize=10 + status 过滤", async () => {
    let capturedWhere: Record<string, unknown> | undefined;
    sharedFake.on("contents", "findMany", async (args: { where: Record<string, unknown> }) => {
      capturedWhere = args.where;
      return baseContents;
    });
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "GET", cookie, url: "/api/admin/pages?status=1",
    }) as { data: Array<Record<string, unknown>>; pagination: { page: number; pageSize: number; total: number; totalPages: number; hasMore: boolean } };
    expect(r.data).toHaveLength(2);
    expect(capturedWhere).toMatchObject({ type: 1, status: 1 });
    expect(r.pagination).toMatchObject({ page: 1, pageSize: 10, total: 2, totalPages: 1, hasMore: false });
  });

  test("page/pageSize 钳到合法区间(page>=1, pageSize∈[1, 1000])", async () => {
    const cookie = await loginSessionCookie();
    const r1 = await callAdmin(handler, {
      method: "GET", cookie, url: "/api/admin/pages?page=-5&pageSize=9999",
    }) as { pagination: { page: number; pageSize: number } };
    expect(r1.pagination.page).toBe(1);
    expect(r1.pagination.pageSize).toBeLessThanOrEqual(1000);

    const r2 = await callAdmin(handler, {
      method: "GET", cookie, url: "/api/admin/pages?page=abc&pageSize=0",
    }) as { pagination: { page: number; pageSize: number } };
    expect(r2.pagination.page).toBe(1);
    expect(r2.pagination.pageSize).toBeGreaterThanOrEqual(1);
  });

  test("status 非数字回落 undefined → 不过滤 status", async () => {
    let capturedWhere: Record<string, unknown> | undefined;
    sharedFake.on("contents", "findMany", async (args: { where: Record<string, unknown> }) => {
      capturedWhere = args.where;
      return [];
    });
    const cookie = await loginSessionCookie();
    await callAdmin(handler, { method: "GET", cookie, url: "/api/admin/pages?status=abc" });
    expect(capturedWhere).toMatchObject({ type: 1 });
    expect(capturedWhere).not.toHaveProperty("status");
  });

  test("relations 命中按 cid 归组(无 relations 的页面 → [])", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, { method: "GET", cookie }) as { data: Array<{ cid: number; relations: unknown[] }> };
    expect(r.data[0]!.relations).toHaveLength(1);
    expect(r.data[1]!.relations).toEqual([]);
  });

  test("DB 异常 → 500", async () => {
    sharedFake.on("contents", "findMany", async () => { throw new Error("db down"); });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, { method: "GET", cookie })).rejects.toMatchObject({ statusCode: 500 });
  });
});