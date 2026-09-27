import { describe, expect, test } from "bun:test";

import { callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/admin/pages.get")).default;

describe("admin/pages.get(后台页面列表)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(handler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("成功 → 返回 data/pagination(relations 按 cid 归组)", async () => {
    sharedFake.on("contents", "findMany", async () => [
      { cid: 1, title: "关于", slug: "about", desc: null, status: 1, create_time: new Date(), update_time: new Date(), user: { uid: 1, name: "admin", nickname: null } },
      { cid: 2, title: "友链", slug: "links", desc: null, status: 1, create_time: new Date(), update_time: new Date(), user: { uid: 1, name: "admin", nickname: null } },
    ]);
    sharedFake.on("contents", "count", async () => 2);
    sharedFake.on("contentrelations", "findMany", async () => [
      { cid: 1, mid: 2, metas: { mid: 2, name: "分类", slug: "cat" } },
    ]);
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, { method: "GET", cookie }) as { data: Array<{ cid: number; relations: Array<unknown> }>; pagination: { total: number; page: number } };
    expect(r.data).toHaveLength(2);
    expect(r.data[0]!.relations).toHaveLength(1);
    expect(r.data[1]!.relations).toHaveLength(0);
    expect(r.pagination.total).toBe(2);
  });

  test("pageSize/page 边界钳正", async () => {
    sharedFake.on("contents", "findMany", async () => []);
    sharedFake.on("contents", "count", async () => 0);
    sharedFake.on("contentrelations", "findMany", async () => []);
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "GET",
      cookie,
      url: "/api/admin/pages?page=-3&pageSize=99999",
    }) as { pagination: { page: number; pageSize: number } };
    expect(r.pagination.page).toBe(1);
    expect(r.pagination.pageSize).toBeGreaterThanOrEqual(1);
    expect(r.pagination.pageSize).toBeLessThanOrEqual(1000);
  });

  test("status 非法值 → 丢弃该筛选(不抛 500)", async () => {
    sharedFake.on("contents", "findMany", async () => []);
    sharedFake.on("contents", "count", async () => 0);
    sharedFake.on("contentrelations", "findMany", async () => []);
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "GET",
      cookie,
      url: "/api/admin/pages?status=abc",
    }) as { data: unknown[] };
    expect(r.data).toEqual([]);
  });

  test("DB 异常 → 500", async () => {
    sharedFake.on("contents", "findMany", async () => { throw new Error("db down"); });
    sharedFake.on("contents", "count", async () => 0);
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, { method: "GET", cookie })).rejects.toMatchObject({ statusCode: 500 });
  });
});