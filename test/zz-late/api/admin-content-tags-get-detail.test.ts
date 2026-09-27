/**
 * server/api/admin/content-tags/[id].get.ts 集成测:
 *  - 与 content-categories 同构,标签分支;key 是 metas.type === "tag"
 */
import { describe, expect, test } from "bun:test";

import { callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/admin/content-tags/[id].get")).default;

describe("admin/content-tags/[id].get(文章关联标签)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(handler, { method: "GET", params: { id: "1" } })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("id 缺/非法 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, { method: "GET", cookie })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(handler, { method: "GET", cookie, params: { id: "abc" } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("成功 → 只取 type:'tag' 的关系;白名单字段", async () => {
    let capturedWhere: Record<string, unknown> | undefined;
    sharedFake.on("contentrelations", "findMany", async (args: { where: Record<string, unknown> }) => {
      capturedWhere = args.where;
      return [{ metas: { mid: 5, name: "JS", slug: "js", desc: null } }];
    });
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, { method: "GET", cookie, params: { id: "10" } }) as { success: boolean; data: Array<Record<string, unknown>> };
    expect(r.success).toBe(true);
    expect(r.data).toHaveLength(1);
    expect(r.data[0]?.slug).toBe("js");
    expect(capturedWhere).toMatchObject({ cid: 10, metas: { type: "tag" } });
  });

  test("DB 异常 → 500", async () => {
    sharedFake.on("contentrelations", "findMany", async () => { throw new Error("db boom"); });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, { method: "GET", cookie, params: { id: "10" } })).rejects.toMatchObject({ statusCode: 500 });
  });
});