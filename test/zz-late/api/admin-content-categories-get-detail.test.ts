/**
 * server/api/admin/content-categories/[id].get.ts 集成测:
 *  - 仅已读到的写路径(put)有覆盖,GET 全无
 *  - 鉴权 401 + id 校验 + 白名单字段(metas 行不裸下传)
 */
import { describe, expect, test } from "bun:test";

import { callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/admin/content-categories/[id].get")).default;

describe("admin/content-categories/[id].get(文章关联分类)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(handler, { method: "GET", params: { id: "1" } })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("id 缺/非法 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, { method: "GET", cookie })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(handler, { method: "GET", cookie, params: { id: "abc" } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(handler, { method: "GET", cookie, params: { id: "0" } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("成功 → 只取 type:'category' 的关系;metas 走白名单字段", async () => {
    let capturedWhere: Record<string, unknown> | undefined;
    sharedFake.on("contentrelations", "findMany", async (args: { where: Record<string, unknown> }) => {
      capturedWhere = args.where;
      return [
        { metas: { mid: 2, name: "笔记", slug: "note", desc: "d" } },
        { metas: { mid: 3, name: "生活", slug: "life", desc: null } },
      ];
    });
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, { method: "GET", cookie, params: { id: "10" } }) as { success: boolean; data: Array<Record<string, unknown>> };
    expect(r.success).toBe(true);
    expect(r.data).toHaveLength(2);
    expect(r.data[0]?.slug).toBe("note");
    expect(capturedWhere).toMatchObject({ cid: 10, metas: { type: "category" } });
  });

  test("DB 异常 → 500", async () => {
    sharedFake.on("contentrelations", "findMany", async () => { throw new Error("db boom"); });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, { method: "GET", cookie, params: { id: "10" } })).rejects.toMatchObject({ statusCode: 500 });
  });
});