import { describe, expect, test } from "bun:test";

import { callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/admin/attachments/all.get")).default;

describe("admin/attachments/all.get(后台附件列表)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(handler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("成功 → 返回 list/total/page/pageSize(白名单字段)", async () => {
    sharedFake.on("attachments", "count", async () => 1);
    sharedFake.on("attachments", "findMany", async () => [{
      aid: 1,
      title: "图.png",
      type: "image",
      url: "/uploads/a.png",
      metadata: { size: 100, width: 10, height: 20, format: "png" },
      create_time: new Date(),
      contentattachments: [{ content: { cid: 5, title: "甲" } }],
    }]);
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, { method: "GET", cookie }) as { success: boolean; data: { list: Array<{ id: number; name: string; contents: Array<unknown> }>; total: number } };
    expect(r.success).toBe(true);
    expect(r.data.list).toHaveLength(1);
    expect(r.data.list[0]!.id).toBe(1);
    expect(r.data.list[0]!.contents).toHaveLength(1);
    expect(r.data.total).toBe(1);
  });

  test("type=image 过滤 + search 模糊查询", async () => {
    sharedFake.on("attachments", "count", async () => 0);
    sharedFake.on("attachments", "findMany", async () => []);
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "GET",
      cookie,
      url: "/api/admin/attachments/all?type=image&search=图",
    }) as { data: { list: unknown[] } };
    expect(r.data.list).toEqual([]);
  });

  test("type=all → 不过滤 type", async () => {
    sharedFake.on("attachments", "count", async () => 0);
    sharedFake.on("attachments", "findMany", async () => []);
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "GET",
      cookie,
      url: "/api/admin/attachments/all?type=all",
    }) as { success: boolean };
    expect(r.success).toBe(true);
  });

  test("pageSize/page 边界钳到 [1, 1000]/[1, 10000]", async () => {
    sharedFake.on("attachments", "count", async () => 0);
    sharedFake.on("attachments", "findMany", async () => []);
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "GET",
      cookie,
      url: "/api/admin/attachments/all?page=-1&pageSize=999999",
    }) as { data: { page: number; pageSize: number } };
    expect(r.data.page).toBe(1);
    expect(r.data.pageSize).toBe(1000);
  });

  test("未知异常 → 500", async () => {
    sharedFake.on("attachments", "count", async () => { throw new Error("db boom"); });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, { method: "GET", cookie })).rejects.toMatchObject({ statusCode: 500 });
  });
});